import ExcelJS from 'exceljs';
import { assertFileSignature } from '../../platform/file-validation.js';
import { Prisma } from '@prisma/client';
import { requirePhone } from '@cplan/domain';
import type { AuditService } from '../../platform/audit.js';
import { AuditAction } from '../../platform/audit.js';
import type { Database } from '../../platform/db.js';
import { errors } from '../../platform/errors.js';
import { withSchoolScope } from '../../platform/school-scope.js';
import { assignMandatoryFees } from '../finance/finance.service.js';

type RawRow = Record<string, string | undefined>;
const batchDto = (row: {
  id: string;
  academicYearId: string | null;
  status: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  importedRows: number;
  createdAt: Date;
}) => ({
  id: row.id,
  academicYearId: row.academicYearId,
  status: row.status,
  totalRows: row.totalRows,
  validRows: row.validRows,
  errorRows: row.errorRows,
  importedRows: row.importedRows,
  createdAt: row.createdAt.toISOString(),
});
const normalizeKey = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f\s-]/g, '');
const gender = (value: string) =>
  ['m', 'masculin', 'garcon'].includes(normalizeKey(value))
    ? 'M'
    : ['f', 'feminin', 'fille'].includes(normalizeKey(value))
      ? 'F'
      : null;
const relationship = (value?: string) => {
  const normalized = normalizeKey(value ?? 'autre');
  return (
    (
      {
        pere: 'PERE',
        mere: 'MERE',
        tuteur: 'TUTEUR',
        oncle: 'ONCLE',
        tante: 'TANTE',
        grandparent: 'GRAND_PARENT',
      } as const
    )[normalized as 'pere'] ?? 'AUTRE'
  );
};
function parsedDate(value?: string) {
  if (!value) return null;
  const fr = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  const date = fr ? new Date(`${fr[3]}-${fr[2]}-${fr[1]}T00:00:00Z`) : new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date;
}
function similarity(a: string, b: string) {
  const x = normalizeKey(a);
  const y = normalizeKey(b);
  let previous = Array.from({ length: y.length + 1 }, (_, index) => index);
  for (let i = 1; i <= x.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= y.length; j += 1)
      current[j] = Math.min(
        (current[j - 1] ?? 0) + 1,
        (previous[j] ?? 0) + 1,
        (previous[j - 1] ?? 0) + (x[i - 1] === y[j - 1] ? 0 : 1),
      );
    previous = current;
  }
  return 1 - (previous[y.length] ?? 0) / Math.max(x.length, y.length, 1);
}
async function nextStudentNumber(tx: Prisma.TransactionClient, schoolId: string) {
  const [settings, sequence] = await Promise.all([
    tx.schoolSettings.findUniqueOrThrow({ where: { schoolId } }),
    tx.numberSequence.upsert({
      where: { schoolId_scope_period: { schoolId, scope: 'STUDENT_NUMBER', period: '' } },
      create: { schoolId, scope: 'STUDENT_NUMBER', period: '', currentValue: 1n },
      update: { currentValue: { increment: 1n } },
    }),
  ]);
  return `${settings.studentNumberPrefix}${sequence.currentValue.toString().padStart(settings.studentNumberPadding, '0')}`;
}

export function createImportsService(db: Database, audit: AuditService) {
  return {
    async template(schoolId: string, academicYearId?: string) {
      const classes = await withSchoolScope(db, schoolId, (tx) =>
        tx.class.findMany({
          where: { schoolId, ...(academicYearId ? { academicYearId } : {}) },
          orderBy: { name: 'asc' },
        }),
      );
      const workbook = new ExcelJS.Workbook();
      const instructions = workbook.addWorksheet('Instructions');
      instructions.addRows([
        ['MODÈLE IMPORT ÉLÈVES — CSB NOUTCHA KAMGUE'],
        ['Les colonnes Nom, Prénom, Sexe et Classe sont obligatoires.'],
        [
          'La classe choisie détermine obligatoirement le cycle, la section linguistique et, au secondaire, la filière.',
        ],
        ['Les liens responsables seront créés en attente de validation.'],
      ]);
      const sheet = workbook.addWorksheet('Élèves');
      sheet.columns = [
        'Matricule',
        'Nom',
        'Prénom',
        'Date de naissance',
        'Sexe',
        'Lieu de naissance',
        'Classe',
        'Régime',
        'Responsable 1 Nom',
        'Responsable 1 Prénom',
        'Responsable 1 Parenté',
        'Responsable 1 Téléphone',
        'Responsable 1 E-mail',
        'Responsable 2 Nom',
        'Responsable 2 Prénom',
        'Responsable 2 Parenté',
        'Responsable 2 Téléphone',
        'Responsable 2 E-mail',
      ].map((header) => ({ header, key: header, width: 23 }));
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
      sheet.getRow(1).font = { bold: true };
      for (let row = 2; row <= 1001; row += 1) {
        sheet.getCell(`E${row}`).dataValidation = { type: 'list', formulae: ['"M,F"'] };
        sheet.getCell(`G${row}`).dataValidation = {
          type: 'list',
          formulae: [`"${classes.map((item) => item.name).join(',')}"`],
        };
        for (const column of ['K', 'P'])
          sheet.getCell(`${column}${row}`).dataValidation = {
            type: 'list',
            formulae: ['"PERE,MERE,TUTEUR,ONCLE,TANTE,GRAND_PARENT,AUTRE"'],
          };
      }
      return workbook.xlsx.writeBuffer();
    },
    async create(schoolId: string, actorId: string, academicYearId: string, rows: RawRow[]) {
      return withSchoolScope(db, schoolId, async (tx) => {
        if (!(await tx.academicYear.findFirst({ where: { id: academicYearId, schoolId } })))
          throw errors.notFound('Année scolaire introuvable.');
        const batch = await tx.importBatch.create({
          data: {
            schoolId,
            academicYearId,
            createdBy: actorId,
            totalRows: rows.length,
            rows: {
              create: rows.map((row, index) => ({
                rowNumber: index + 2,
                rawData: row as Prisma.InputJsonValue,
              })),
            },
          },
        });
        await audit.log(
          {
            action: AuditAction.IMPORT_CREATED,
            entityType: 'import_batch',
            entityId: batch.id,
            schoolId,
            after: { rows: rows.length },
          },
          tx,
        );
        return batchDto(batch);
      });
    },
    async createFromWorkbook(
      schoolId: string,
      actorId: string,
      academicYearId: string,
      fileBase64: string,
    ) {
      const workbook = new ExcelJS.Workbook();
      const buffer = Buffer.from(fileBase64, 'base64');
      assertFileSignature(
        buffer,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      const bytes = Uint8Array.from(buffer);
      await workbook.xlsx.load(bytes.buffer);
      const sheet =
        workbook.getWorksheet('Élèves') ??
        workbook.worksheets.find((item) => normalizeKey(item.name) === 'eleves') ??
        workbook.worksheets[0];
      if (!sheet) throw errors.validation('Le classeur Excel ne contient aucune feuille.');
      const keys = [
        'studentNumber',
        'lastName',
        'firstName',
        'dateOfBirth',
        'gender',
        'placeOfBirth',
        'className',
        'categoryName',
        'guardian1LastName',
        'guardian1FirstName',
        'guardian1Relationship',
        'guardian1Phone',
        'guardian1Email',
        'guardian2LastName',
        'guardian2FirstName',
        'guardian2Relationship',
        'guardian2Phone',
        'guardian2Email',
      ];
      const rows: RawRow[] = [];
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const raw: RawRow = {};
        for (const [index, key] of keys.entries()) {
          const value = row.getCell(index + 1).text.trim();
          if (value) raw[key] = value;
        }
        if (Object.keys(raw).length) rows.push(raw);
      });
      if (!rows.length) throw errors.validation('Le fichier Excel ne contient aucune ligne élève.');
      if (rows.length > 5000) throw errors.validation('Un import est limité à 5 000 lignes.');
      return this.create(schoolId, actorId, academicYearId, rows);
    },
    async get(schoolId: string, id: string) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const row = await tx.importBatch.findFirst({ where: { id, schoolId } });
        if (!row) throw errors.notFound('Import introuvable.');
        return batchDto(row);
      });
    },
    async rows(
      schoolId: string,
      id: string,
      status?: 'PENDING' | 'VALID' | 'ERROR' | 'IMPORTED' | 'SKIPPED',
    ) {
      return withSchoolScope(db, schoolId, async (tx) =>
        (
          await tx.importRow.findMany({
            where: { batch: { id, schoolId }, ...(status ? { status } : {}) },
            orderBy: { rowNumber: 'asc' },
          })
        ).map((row) => ({
          id: row.id,
          rowNumber: row.rowNumber,
          rawData: row.rawData as Record<string, unknown>,
          normalizedData: row.normalizedData as Record<string, unknown> | null,
          errors: row.errors as unknown[],
          status: row.status,
          createdEntityId: row.createdEntityId,
        })),
      );
    },
    async updateRow(schoolId: string, batchId: string, rowId: string, rawData: RawRow) {
      return withSchoolScope(db, schoolId, async (tx) => {
        if (
          !(await tx.importBatch.findFirst({
            where: { id: batchId, schoolId, status: { notIn: ['COMPLETED', 'IMPORTING'] } },
          }))
        )
          throw errors.conflict("Cet import n'est plus modifiable.");
        await tx.importRow.update({
          where: { id: rowId },
          data: {
            rawData: rawData as Prisma.InputJsonValue,
            normalizedData: Prisma.JsonNull,
            errors: [],
            status: 'PENDING',
          },
        });
      });
    },
    async validate(schoolId: string, _actorId: string, id: string) {
      return withSchoolScope(
        db,
        schoolId,
        async (tx) => {
          const batch = await tx.importBatch.findFirst({
            where: { id, schoolId },
            include: { rows: true },
          });
          if (!batch?.academicYearId) throw errors.notFound('Import introuvable.');
          const classes = await tx.class.findMany({
            where: { schoolId, academicYearId: batch.academicYearId },
            include: {
              gradeLevel: true,
              organizationalUnit: true,
              languageSection: true,
              educationTrack: true,
            },
          });
          const categories = await tx.studentCategory.findMany({ where: { schoolId } });
          const seen = new Set<string>();
          let valid = 0;
          let invalid = 0;
          for (const line of batch.rows) {
            const raw = line.rawData as RawRow;
            const issues: Array<{
              field: string;
              message: string;
              severity: string;
              suggestion?: string;
            }> = [];
            if (!raw.lastName?.trim())
              issues.push({ field: 'lastName', message: 'Nom obligatoire.', severity: 'ERROR' });
            if (!raw.firstName?.trim())
              issues.push({
                field: 'firstName',
                message: 'Prénom obligatoire.',
                severity: 'ERROR',
              });
            const parsedGender = gender(raw.gender ?? '');
            if (!parsedGender)
              issues.push({
                field: 'gender',
                message: 'Sexe attendu : M ou F.',
                severity: 'ERROR',
              });
            const schoolClass = classes.find(
              (item) => normalizeKey(item.name) === normalizeKey(raw.className ?? ''),
            );
            if (!schoolClass) {
              const suggestion = classes
                .map((item) => ({ item, score: similarity(raw.className ?? '', item.name) }))
                .sort((a, b) => b.score - a.score)[0];
              issues.push({
                field: 'className',
                message: 'Classe inexistante.',
                severity: 'ERROR',
                ...(suggestion && suggestion.score >= 0.5
                  ? { suggestion: suggestion.item.name }
                  : {}),
              });
            }
            if (
              schoolClass &&
              (!schoolClass.organizationalUnitId || !schoolClass.languageSectionId)
            )
              issues.push({
                field: 'className',
                message:
                  'La classe ne définit pas complètement son cycle et sa section linguistique.',
                severity: 'ERROR',
              });
            if (
              schoolClass?.organizationalUnit?.code === 'SECONDAIRE' &&
              !schoolClass.educationTrackId
            )
              issues.push({
                field: 'className',
                message: 'La classe secondaire doit définir une filière générale ou technique.',
                severity: 'ERROR',
              });
            const birth = parsedDate(raw.dateOfBirth);
            if (raw.dateOfBirth && !birth)
              issues.push({
                field: 'dateOfBirth',
                message: 'Date de naissance invalide.',
                severity: 'ERROR',
              });
            if (birth && birth > new Date())
              issues.push({
                field: 'dateOfBirth',
                message: 'La naissance ne peut pas être future.',
                severity: 'ERROR',
              });
            if (birth && birth < new Date(new Date().setFullYear(new Date().getFullYear() - 30)))
              issues.push({
                field: 'dateOfBirth',
                message: 'Âge supérieur à 30 ans.',
                severity: 'WARNING',
              });
            if (raw.studentNumber) {
              if (seen.has(raw.studentNumber))
                issues.push({
                  field: 'studentNumber',
                  message: 'Matricule dupliqué dans le fichier.',
                  severity: 'ERROR',
                });
              seen.add(raw.studentNumber);
              if (
                await tx.student.findFirst({
                  where: { schoolId, studentNumber: raw.studentNumber },
                })
              )
                issues.push({
                  field: 'studentNumber',
                  message: 'Matricule déjà présent en base.',
                  severity: 'ERROR',
                });
            }
            const phones: Array<string | null> = [];
            for (const key of ['guardian1Phone', 'guardian2Phone'] as const) {
              const value = raw[key];
              if (!value) {
                phones.push(null);
                continue;
              }
              try {
                const normalizedPhone = requirePhone(value).e164;
                phones.push(normalizedPhone);
                if (
                  await tx.guardian.findUnique({
                    where: { schoolId_phone: { schoolId, phone: normalizedPhone } },
                  })
                )
                  issues.push({
                    field: key,
                    message: 'Responsable déjà connu : le dossier existant sera partagé.',
                    severity: 'WARNING',
                  });
              } catch {
                phones.push(null);
                issues.push({
                  field: key,
                  message: 'Téléphone responsable invalide.',
                  severity: 'ERROR',
                });
              }
            }
            const duplicate = birth
              ? await tx.student.findFirst({
                  where: {
                    schoolId,
                    firstName: { equals: raw.firstName ?? '', mode: 'insensitive' },
                    lastName: { equals: raw.lastName ?? '', mode: 'insensitive' },
                    dateOfBirth: birth,
                  },
                })
              : null;
            if (duplicate)
              issues.push({
                field: 'student',
                message: `Doublon potentiel : ${duplicate.studentNumber}.`,
                severity: 'WARNING',
              });
            const categoryName = raw.categoryName;
            const category = categoryName
              ? categories.find((item) => normalizeKey(item.name) === normalizeKey(categoryName))
              : null;
            if (raw.categoryName && !category)
              issues.push({
                field: 'categoryName',
                message: 'Régime inexistant.',
                severity: 'ERROR',
              });
            const hasError = issues.some((issue) => issue.severity === 'ERROR');
            await tx.importRow.update({
              where: { id: line.id },
              data: {
                status: hasError ? 'ERROR' : 'VALID',
                errors: issues as Prisma.InputJsonValue,
                normalizedData: {
                  ...raw,
                  gender: parsedGender,
                  classId: schoolClass?.id,
                  categoryId: category?.id,
                  dateOfBirth: birth?.toISOString().slice(0, 10),
                  guardian1Phone: phones[0],
                  guardian2Phone: phones[1],
                } as Prisma.InputJsonValue,
              },
            });
            if (hasError) invalid++;
            else valid++;
          }
          const updated = await tx.importBatch.update({
            where: { id },
            data: { status: 'VALIDATED', validRows: valid, errorRows: invalid },
          });
          await audit.log(
            {
              action: AuditAction.IMPORT_VALIDATED,
              entityType: 'import_batch',
              entityId: id,
              schoolId,
              after: { valid, invalid },
            },
            tx,
          );
          return batchDto(updated);
        },
        { timeoutMs: 60_000 },
      );
    },
    async execute(schoolId: string, _actorId: string, id: string) {
      await withSchoolScope(db, schoolId, async (tx) => {
        const batch = await tx.importBatch.findFirst({
          where: { id, schoolId, status: { in: ['VALIDATED', 'IMPORTING', 'FAILED'] } },
        });
        if (!batch) throw errors.conflict("L'import doit être validé avant exécution.");
        await tx.importBatch.update({ where: { id }, data: { status: 'IMPORTING' } });
      });
      while (true) {
        const processed = await withSchoolScope(
          db,
          schoolId,
          async (tx) => {
            const batch = await tx.importBatch.findFirstOrThrow({ where: { id, schoolId } });
            if (!batch.academicYearId)
              throw errors.validation("L'annÃ©e scolaire de l'import est obligatoire.");
            const lines = await tx.importRow.findMany({
              where: { batchId: id, status: 'VALID' },
              orderBy: { rowNumber: 'asc' },
              take: 100,
            });
            for (const line of lines) {
              const data = line.normalizedData as RawRow & {
                classId: string;
                categoryId?: string;
                gender: 'M' | 'F';
                guardian1Phone?: string;
                guardian2Phone?: string;
              };
              if (!data.firstName || !data.lastName || !data.classId || !data.gender)
                throw errors.validation(`La ligne ${line.rowNumber} n'est plus valide.`);
              const student = await tx.student.create({
                data: {
                  schoolId,
                  studentNumber: data.studentNumber || (await nextStudentNumber(tx, schoolId)),
                  firstName: data.firstName,
                  lastName: data.lastName,
                  dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
                  placeOfBirth: data.placeOfBirth ?? null,
                  gender: data.gender,
                },
              });
              const enrollment = await tx.enrollment.create({
                data: {
                  schoolId,
                  studentId: student.id,
                  academicYearId: batch.academicYearId,
                  classId: data.classId,
                  studentCategoryId: data.categoryId ?? null,
                  enrollmentDate: new Date(),
                  enrollmentType: 'NEW',
                },
              });
              for (const index of [1, 2] as const) {
                const phone = data[`guardian${index}Phone`];
                if (!phone) continue;
                const guardian = await tx.guardian.upsert({
                  where: { schoolId_phone: { schoolId, phone } },
                  create: {
                    schoolId,
                    phone,
                    firstName: data[`guardian${index}FirstName`] || 'Responsable',
                    lastName: data[`guardian${index}LastName`] || data.lastName,
                    email: data[`guardian${index}Email`] || null,
                  },
                  update: {},
                });
                await tx.studentGuardian.create({
                  data: {
                    studentId: student.id,
                    guardianId: guardian.id,
                    relationship: relationship(data[`guardian${index}Relationship`]),
                    isPrimary: index === 1,
                  },
                });
              }
              await assignMandatoryFees(tx, schoolId, enrollment.id);
              await tx.importRow.update({
                where: { id: line.id },
                data: { status: 'IMPORTED', createdEntityId: student.id },
              });
            }
            if (lines.length)
              await tx.importBatch.update({
                where: { id },
                data: { importedRows: { increment: lines.length } },
              });
            return lines.length;
          },
          { timeoutMs: 30_000 },
        );
        if (!processed) break;
      }
      return withSchoolScope(db, schoolId, async (tx) => {
        const row = await tx.importBatch.update({ where: { id }, data: { status: 'COMPLETED' } });
        await audit.log(
          {
            action: AuditAction.IMPORT_EXECUTED,
            entityType: 'import_batch',
            entityId: id,
            schoolId,
            after: { imported: row.importedRows },
          },
          tx,
        );
        return batchDto(row);
      });
    },
    async report(schoolId: string, id: string) {
      const lines = await this.rows(schoolId, id);
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Rapport');
      sheet.columns = [
        { header: 'Ligne', key: 'row', width: 10 },
        { header: 'Statut', key: 'status', width: 16 },
        { header: 'Erreurs / avertissements', key: 'errors', width: 80 },
      ];
      for (const line of lines)
        sheet.addRow({
          row: line.rowNumber,
          status: line.status,
          errors: line.errors.map((item) => JSON.stringify(item)).join(' | '),
        });
      return workbook.xlsx.writeBuffer();
    },
    async reenroll(
      schoolId: string,
      _actorId: string,
      input: {
        studentId: string;
        sourceEnrollmentId: string;
        academicYearId: string;
        classId?: string | null | undefined;
        studentCategoryId?: string | null | undefined;
        enrollmentDate: string;
        completeSource: boolean;
      },
    ) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const source = await tx.enrollment.findFirst({
          where: { id: input.sourceEnrollmentId, studentId: input.studentId, schoolId },
        });
        if (!source) throw errors.notFound('Inscription source introuvable.');
        const existing = await tx.enrollment.findUnique({
          where: {
            studentId_academicYearId: {
              studentId: input.studentId,
              academicYearId: input.academicYearId,
            },
          },
        });
        if (existing) return { enrollmentId: existing.id, skipped: true };
        if (
          input.classId &&
          !(await tx.class.findFirst({
            where: { id: input.classId, schoolId, academicYearId: input.academicYearId },
          }))
        )
          throw errors.validation("La classe n'appartient pas à l'année cible.");
        const enrollment = await tx.enrollment.create({
          data: {
            schoolId,
            studentId: input.studentId,
            academicYearId: input.academicYearId,
            classId: input.classId ?? null,
            studentCategoryId: input.studentCategoryId ?? source.studentCategoryId,
            enrollmentDate: new Date(input.enrollmentDate),
            enrollmentType: 'RE_ENROLLMENT',
          },
        });
        if (input.completeSource)
          await tx.enrollment.update({ where: { id: source.id }, data: { status: 'COMPLETED' } });
        await assignMandatoryFees(tx, schoolId, enrollment.id);
        await audit.log(
          {
            action: AuditAction.ENROLLMENT_REENROLLED,
            entityType: 'enrollment',
            entityId: enrollment.id,
            schoolId,
            after: { sourceEnrollmentId: source.id },
          },
          tx,
        );
        return { enrollmentId: enrollment.id, skipped: false };
      });
    },
    async bulkReenroll(
      schoolId: string,
      actorId: string,
      input: {
        sourceAcademicYearId: string;
        targetAcademicYearId: string;
        studentIds: string[];
        classByGradeLevel: Record<string, string>;
        completeSource: boolean;
        preview: boolean;
      },
    ) {
      const sources = await withSchoolScope(db, schoolId, (tx) =>
        tx.enrollment.findMany({
          where: {
            schoolId,
            academicYearId: input.sourceAcademicYearId,
            studentId: { in: input.studentIds },
            student: { status: { notIn: ['GRADUATED', 'TRANSFERRED'] } },
          },
          include: { class: true },
        }),
      );
      const errorsList: Array<{ studentId: string; message: string }> = [];
      let created = 0;
      let skipped = 0;
      for (const source of sources) {
        const classId = source.class
          ? input.classByGradeLevel[source.class.gradeLevelId]
          : undefined;
        if (!classId) {
          errorsList.push({
            studentId: source.studentId,
            message: 'Aucune classe cible configurée.',
          });
          continue;
        }
        if (input.preview) {
          created++;
          continue;
        }
        const result = await this.reenroll(schoolId, actorId, {
          studentId: source.studentId,
          sourceEnrollmentId: source.id,
          academicYearId: input.targetAcademicYearId,
          classId,
          studentCategoryId: source.studentCategoryId,
          enrollmentDate: new Date().toISOString().slice(0, 10),
          completeSource: input.completeSource,
        });
        if (result.skipped) skipped++;
        else created++;
      }
      return { created, skipped, errors: errorsList };
    },
  };
}

export type ImportsService = ReturnType<typeof createImportsService>;
