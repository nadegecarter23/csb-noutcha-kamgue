import type { EnrollmentStatus, Prisma, StudentStatus } from '@prisma/client';
import type {
  CreateEnrollmentBody,
  CreateStudentBody,
  EnrollmentDto,
  Paginated,
  StudentDto,
  StudentListQuery,
} from '@cplan/contracts';
import { buildPaginationMeta, parseSort } from '@cplan/contracts';
import type { Database } from '../../platform/db.js';
import type { AuditService } from '../../platform/audit.js';
import { AuditAction } from '../../platform/audit.js';
import { errors } from '../../platform/errors.js';
import { generateOpaqueToken, generateShortCode, hashToken } from '../../platform/crypto.js';
import { withSchoolScope } from '../../platform/school-scope.js';
import { assignMandatoryFees } from '../finance/finance.service.js';

const dbDate = (value: string): Date => new Date(`${value}T00:00:00.000Z`);
const dateOnly = (value: Date): string => value.toISOString().slice(0, 10);
const iso = (value: Date): string => value.toISOString();

const enrollmentInclude = {
  academicYear: { select: { name: true } },
  class: { select: { name: true, gradeLevel: { select: { id: true, name: true } } } },
  studentCategory: { select: { name: true } },
} satisfies Prisma.EnrollmentInclude;

type EnrollmentRow = Prisma.EnrollmentGetPayload<{ include: typeof enrollmentInclude }>;
const studentInclude = {
  enrollments: { include: enrollmentInclude, orderBy: { enrollmentDate: 'desc' as const } },
  _count: { select: { guardianLinks: true } },
} satisfies Prisma.StudentInclude;
type StudentRow = Prisma.StudentGetPayload<{ include: typeof studentInclude }>;

function enrollmentDto(row: EnrollmentRow): EnrollmentDto {
  return {
    id: row.id,
    studentId: row.studentId,
    academicYearId: row.academicYearId,
    academicYearName: row.academicYear.name,
    classId: row.classId,
    className: row.class?.name ?? null,
    gradeLevelId: row.class?.gradeLevel.id ?? null,
    gradeLevelName: row.class?.gradeLevel.name ?? null,
    studentCategoryId: row.studentCategoryId,
    studentCategoryName: row.studentCategory?.name ?? null,
    enrollmentDate: dateOnly(row.enrollmentDate),
    enrollmentType: row.enrollmentType,
    status: row.status,
  };
}

function studentDto(row: StudentRow, academicYearId?: string): StudentDto {
  const current = academicYearId
    ? row.enrollments.find((enrollment) => enrollment.academicYearId === academicYearId)
    : row.enrollments[0];
  return {
    id: row.id,
    studentNumber: row.studentNumber,
    firstName: row.firstName,
    lastName: row.lastName,
    dateOfBirth: row.dateOfBirth ? dateOnly(row.dateOfBirth) : null,
    placeOfBirth: row.placeOfBirth,
    gender: row.gender,
    photoFileId: row.photoFileId,
    status: row.status,
    currentEnrollment: current ? enrollmentDto(current) : null,
    guardianCount: row._count.guardianLinks,
  };
}

async function validateEnrollment(
  tx: Prisma.TransactionClient,
  schoolId: string,
  input: {
    academicYearId: string;
    classId?: string | null | undefined;
    studentCategoryId?: string | null | undefined;
  },
) {
  const year = await tx.academicYear.findFirst({ where: { id: input.academicYearId, schoolId } });
  if (!year) throw errors.notFound('Année scolaire introuvable.');
  if (year.status === 'CLOSED' || year.status === 'ARCHIVED')
    throw errors.validation('Cette année est en consultation uniquement.');
  if (input.classId) {
    const classroom = await tx.class.findFirst({
      where: {
        id: input.classId,
        schoolId,
        academicYearId: input.academicYearId,
        status: 'ACTIVE',
      },
    });
    if (!classroom) throw errors.validation('La classe n’appartient pas à l’année choisie.');
  }
  if (input.studentCategoryId) {
    const category = await tx.studentCategory.findFirst({
      where: { id: input.studentCategoryId, schoolId, status: 'ACTIVE' },
    });
    if (!category) throw errors.validation('Régime élève invalide.');
  }
}

async function allocateStudentNumber(tx: Prisma.TransactionClient, schoolId: string) {
  const settings = await tx.schoolSettings.findUnique({ where: { schoolId } });
  if (!settings) throw errors.validation('Les paramètres de l’établissement sont absents.');
  const sequence = await tx.numberSequence.upsert({
    where: { schoolId_scope_period: { schoolId, scope: 'STUDENT_NUMBER', period: '' } },
    create: { schoolId, scope: 'STUDENT_NUMBER', period: '', currentValue: 1n },
    update: { currentValue: { increment: 1 } },
  });
  return `${settings.studentNumberPrefix}${sequence.currentValue.toString().padStart(settings.studentNumberPadding, '0')}`;
}

export function createStudentsService(db: Database, audit: AuditService) {
  return {
    async list(schoolId: string, query: StudentListQuery): Promise<Paginated<StudentDto>> {
      return withSchoolScope(db, schoolId, async (tx) => {
        let searchIds: string[] | undefined;
        if (query.q) {
          const rows = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT id FROM students
            WHERE school_id = ${schoolId}::uuid AND (
              unaccent_immutable(lower(first_name || ' ' || last_name)) % unaccent_immutable(lower(${query.q}))
              OR unaccent_immutable(lower(first_name)) % unaccent_immutable(lower(${query.q}))
              OR unaccent_immutable(lower(last_name)) % unaccent_immutable(lower(${query.q}))
              OR lower(student_number) LIKE '%' || lower(${query.q}) || '%'
            )`;
          searchIds = rows.map((row) => row.id);
        }
        const enrollmentWhere: Prisma.EnrollmentWhereInput = {
          ...(query.academic_year_id && { academicYearId: query.academic_year_id }),
          ...(query.grade_level_id && { class: { gradeLevelId: query.grade_level_id } }),
          ...(query.class_id && { classId: query.class_id === 'none' ? null : query.class_id }),
          ...(query.enrollment_status && { status: query.enrollment_status }),
          ...(query.enrollment_type && { enrollmentType: query.enrollment_type }),
        };
        const where: Prisma.StudentWhereInput = {
          schoolId,
          status: query.status ?? 'ACTIVE',
          ...(query.gender && { gender: query.gender }),
          ...(searchIds && { id: { in: searchIds } }),
          ...(Object.keys(enrollmentWhere).length && { enrollments: { some: enrollmentWhere } }),
          ...(query.has_guardian_account !== undefined && {
            guardianLinks: {
              ...(query.has_guardian_account
                ? { some: { guardian: { userId: { not: null } } } }
                : { none: { guardian: { userId: { not: null } } } }),
            },
          }),
        };
        const sort = parseSort(
          query.sort,
          ['lastName', 'firstName', 'studentNumber', 'createdAt'],
          {
            field: 'lastName',
            direction: 'asc',
          },
        );
        const [total, rows] = await Promise.all([
          tx.student.count({ where }),
          tx.student.findMany({
            where,
            include: studentInclude,
            orderBy: { [sort.field]: sort.direction },
            skip: (query.page - 1) * query.page_size,
            take: query.page_size,
          }),
        ]);
        return {
          data: rows.map((row) => studentDto(row, query.academic_year_id)),
          meta: buildPaginationMeta(query.page, query.page_size, total),
        };
      });
    },

    async get(schoolId: string, id: string): Promise<StudentDto> {
      return withSchoolScope(db, schoolId, async (tx) => {
        const row = await tx.student.findFirst({
          where: { id, schoolId },
          include: studentInclude,
        });
        if (!row) throw errors.notFound('Élève introuvable.');
        return studentDto(row);
      });
    },

    async create(schoolId: string, input: CreateStudentBody) {
      return withSchoolScope(
        db,
        schoolId,
        async (tx) => {
          await validateEnrollment(tx, schoolId, input.enrollment);
          if (input.student.dateOfBirth) {
            const duplicate = await tx.student.findFirst({
              where: {
                schoolId,
                firstName: { equals: input.student.firstName, mode: 'insensitive' },
                lastName: { equals: input.student.lastName, mode: 'insensitive' },
                dateOfBirth: dbDate(input.student.dateOfBirth),
              },
            });
            if (duplicate && !input.confirmDuplicate)
              throw errors.conflict(
                'Un élève avec le même nom et la même date de naissance existe déjà.',
                {
                  duplicateStudentId: duplicate.id,
                  requiresConfirmation: true,
                },
              );
          }
          const studentNumber =
            input.student.studentNumber ?? (await allocateStudentNumber(tx, schoolId));
          const existingNumber = await tx.student.findFirst({ where: { schoolId, studentNumber } });
          if (existingNumber) throw errors.conflict('Ce matricule est déjà utilisé.');
          if (input.student.studentNumber) {
            const settings = await tx.schoolSettings.findUniqueOrThrow({ where: { schoolId } });
            if (studentNumber.startsWith(settings.studentNumberPrefix)) {
              const suffix = studentNumber.slice(settings.studentNumberPrefix.length);
              if (/^\d+$/.test(suffix)) {
                const manualValue = BigInt(suffix);
                const sequence = await tx.numberSequence.upsert({
                  where: {
                    schoolId_scope_period: { schoolId, scope: 'STUDENT_NUMBER', period: '' },
                  },
                  create: {
                    schoolId,
                    scope: 'STUDENT_NUMBER',
                    period: '',
                    currentValue: manualValue,
                  },
                  update: {},
                });
                if (sequence.currentValue < manualValue) {
                  await tx.numberSequence.update({
                    where: {
                      schoolId_scope_period: { schoolId, scope: 'STUDENT_NUMBER', period: '' },
                    },
                    data: { currentValue: manualValue },
                  });
                }
              }
            }
          }
          const student = await tx.student.create({
            data: {
              schoolId,
              studentNumber,
              firstName: input.student.firstName,
              lastName: input.student.lastName,
              dateOfBirth: input.student.dateOfBirth ? dbDate(input.student.dateOfBirth) : null,
              placeOfBirth: input.student.placeOfBirth ?? null,
              gender: input.student.gender ?? null,
            },
          });
          const enrollment = await tx.enrollment.create({
            data: {
              schoolId,
              studentId: student.id,
              academicYearId: input.enrollment.academicYearId,
              classId: input.enrollment.classId ?? null,
              studentCategoryId: input.enrollment.studentCategoryId ?? null,
              enrollmentDate: dbDate(input.enrollment.enrollmentDate),
              enrollmentType: input.enrollment.enrollmentType,
              status: input.enrollment.status,
            },
            include: enrollmentInclude,
          });
          await assignMandatoryFees(tx, schoolId, enrollment.id);
          for (const entry of input.guardians) {
            const existingGuardian = entry.id
              ? null
              : await tx.guardian.findUnique({
                  where: { schoolId_phone: { schoolId, phone: entry.phone } },
                });
            const guardian = entry.id
              ? await tx.guardian.findFirst({ where: { id: entry.id, schoolId } })
              : await tx.guardian.upsert({
                  where: { schoolId_phone: { schoolId, phone: entry.phone } },
                  create: {
                    schoolId,
                    firstName: entry.firstName,
                    lastName: entry.lastName,
                    phone: entry.phone,
                    phoneSecondary: entry.phoneSecondary ?? null,
                    email: entry.email ?? null,
                  },
                  update: {},
                });
            if (!guardian) throw errors.notFound('Responsable introuvable.');
            if (!entry.id && !existingGuardian) {
              await audit.log(
                {
                  action: AuditAction.GUARDIAN_CREATED,
                  entityType: 'guardian',
                  entityId: guardian.id,
                  schoolId,
                  after: {
                    firstName: entry.firstName,
                    lastName: entry.lastName,
                    phone: entry.phone,
                  },
                },
                tx,
              );
            }
            const link = await tx.studentGuardian.create({
              data: {
                studentId: student.id,
                guardianId: guardian.id,
                relationship: entry.relationship,
                isPrimary: entry.isPrimary,
                isFinancialResponsible: entry.isFinancialResponsible,
                canPay: entry.canPay,
                canViewFinances: entry.canViewFinances,
                canReceiveNotifications: entry.canReceiveNotifications,
              },
            });
            await audit.log(
              {
                action: AuditAction.GUARDIAN_LINK_CREATED,
                entityType: 'student_guardian',
                entityId: link.id,
                schoolId,
                after: {
                  studentId: student.id,
                  guardianId: guardian.id,
                  relationship: entry.relationship,
                },
              },
              tx,
            );
          }
          const token = generateOpaqueToken();
          const shortCode = generateShortCode();
          const settings = await tx.schoolSettings.findUniqueOrThrow({ where: { schoolId } });
          await tx.guardianInvite.create({
            data: {
              schoolId,
              studentId: student.id,
              tokenHash: hashToken(token),
              shortCode,
              type: 'QR_CODE',
              expiresAt: new Date(Date.now() + settings.inviteTokenTtlDays * 86_400_000),
            },
          });
          await audit.log(
            {
              action: AuditAction.STUDENT_CREATED,
              entityType: 'student',
              entityId: student.id,
              schoolId,
              after: { ...input.student, studentNumber },
            },
            tx,
          );
          await audit.log(
            {
              action: AuditAction.ENROLLMENT_CREATED,
              entityType: 'enrollment',
              entityId: enrollment.id,
              schoolId,
              after: input.enrollment,
            },
            tx,
          );
          const full = await tx.student.findUniqueOrThrow({
            where: { id: student.id },
            include: studentInclude,
          });
          return {
            student: studentDto(full),
            enrollment: enrollmentDto(enrollment),
            associationCode: shortCode,
          };
        },
        { timeoutMs: 20_000 },
      );
    },

    async update(schoolId: string, id: string, input: Record<string, unknown>) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const before = await tx.student.findFirst({ where: { id, schoolId } });
        if (!before) throw errors.notFound('Élève introuvable.');
        if (before.status === 'TRANSFERRED' || before.status === 'ARCHIVED')
          throw errors.validation('Ce dossier est figé.');
        const row = await tx.student.update({
          where: { id },
          data: {
            ...(input.firstName !== undefined && { firstName: input.firstName as string }),
            ...(input.lastName !== undefined && { lastName: input.lastName as string }),
            ...(input.dateOfBirth !== undefined && {
              dateOfBirth: input.dateOfBirth ? dbDate(input.dateOfBirth as string) : null,
            }),
            ...(input.placeOfBirth !== undefined && {
              placeOfBirth: input.placeOfBirth as string | null,
            }),
            ...(input.gender !== undefined && { gender: input.gender as 'M' | 'F' | null }),
          },
          include: studentInclude,
        });
        await audit.log(
          {
            action: AuditAction.STUDENT_UPDATED,
            entityType: 'student',
            entityId: id,
            schoolId,
            before,
            after: input,
          },
          tx,
        );
        return studentDto(row);
      });
    },

    async correctNumber(schoolId: string, id: string, studentNumber: string, reason: string) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const before = await tx.student.findFirst({ where: { id, schoolId } });
        if (!before) throw errors.notFound('Élève introuvable.');
        if (await tx.student.findFirst({ where: { schoolId, studentNumber, id: { not: id } } }))
          throw errors.conflict('Ce matricule est déjà utilisé.');
        const row = await tx.student.update({
          where: { id },
          data: { studentNumber },
          include: studentInclude,
        });
        await audit.log(
          {
            action: AuditAction.STUDENT_NUMBER_CORRECTED,
            entityType: 'student',
            entityId: id,
            schoolId,
            before: { studentNumber: before.studentNumber },
            after: { studentNumber },
            metadata: { reason },
          },
          tx,
        );
        return studentDto(row);
      });
    },

    async attachPhoto(schoolId: string, id: string, fileId: string | null) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const before = await tx.student.findFirst({ where: { id, schoolId } });
        if (!before) throw errors.notFound('Élève introuvable.');
        if (
          fileId &&
          !(await tx.file.findFirst({ where: { id: fileId, schoolId, kind: 'STUDENT_PHOTO' } }))
        )
          throw errors.validation('Fichier photo invalide.');
        const row = await tx.student.update({
          where: { id },
          data: { photoFileId: fileId },
          include: studentInclude,
        });
        await audit.log(
          {
            action: AuditAction.STUDENT_UPDATED,
            entityType: 'student',
            entityId: id,
            schoolId,
            before: { photoFileId: before.photoFileId },
            after: { photoFileId: fileId },
          },
          tx,
        );
        return studentDto(row);
      });
    },

    async changeStatus(schoolId: string, id: string, status: StudentStatus, reason: string) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const before = await tx.student.findFirst({ where: { id, schoolId } });
        if (!before) throw errors.notFound('Élève introuvable.');
        const row = await tx.student.update({
          where: { id },
          data: { status },
          include: studentInclude,
        });
        await audit.log(
          {
            action: AuditAction.STUDENT_STATUS_CHANGED,
            entityType: 'student',
            entityId: id,
            schoolId,
            before: { status: before.status },
            after: { status },
            metadata: { reason },
          },
          tx,
        );
        return studentDto(row);
      });
    },

    async remove(schoolId: string, id: string, reason: string) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const student = await tx.student.findFirst({
          where: { id, schoolId },
          include: { _count: { select: { enrollments: true } } },
        });
        if (!student) throw errors.notFound('Élève introuvable.');
        if (student._count.enrollments > 0)
          throw errors.conflict(
            `Suppression impossible : ${student._count.enrollments} inscription(s).`,
            { enrollments: student._count.enrollments, payments: 0, receipts: 0 },
          );
        await tx.student.delete({ where: { id } });
        await audit.log(
          {
            action: AuditAction.STUDENT_DELETED,
            entityType: 'student',
            entityId: id,
            schoolId,
            before: student,
            metadata: { reason },
          },
          tx,
        );
      });
    },

    async history(schoolId: string, id: string) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const student = await tx.student.findFirst({ where: { id, schoolId } });
        if (!student) throw errors.notFound('Élève introuvable.');
        const [enrollments, changes, audits] = await Promise.all([
          tx.enrollment.findMany({
            where: { studentId: id, schoolId },
            include: enrollmentInclude,
          }),
          tx.studentClassChange.findMany({
            where: { enrollment: { studentId: id, schoolId } },
            include: { fromClass: true, toClass: true },
          }),
          tx.auditLog.findMany({
            where: { schoolId, entityId: id },
            orderBy: { createdAt: 'desc' },
          }),
        ]);
        return [
          ...enrollments.map((row) => ({
            id: row.id,
            kind: 'ENROLLMENT',
            label: `${row.academicYear.name} — ${row.class?.name ?? 'Non affecté'} — ${row.status}`,
            occurredAt: iso(row.createdAt),
          })),
          ...changes.map((row) => ({
            id: row.id,
            kind: 'CLASS_CHANGE',
            label: `${row.fromClass?.name ?? 'Non affecté'} → ${row.toClass?.name ?? 'Non affecté'} — ${row.reason}`,
            occurredAt: iso(row.changedAt),
          })),
          ...audits.map((row) => ({
            id: row.id,
            kind: 'AUDIT',
            label: row.action,
            occurredAt: iso(row.createdAt),
          })),
        ].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
      });
    },

    async listEnrollments(
      schoolId: string,
      query: {
        student_id?: string | undefined;
        academic_year_id?: string | undefined;
        class_id?: string | undefined;
        status?: EnrollmentStatus | undefined;
      },
    ) {
      return withSchoolScope(db, schoolId, async (tx) =>
        (
          await tx.enrollment.findMany({
            where: {
              schoolId,
              ...(query.student_id && { studentId: query.student_id }),
              ...(query.academic_year_id && { academicYearId: query.academic_year_id }),
              ...(query.class_id && { classId: query.class_id }),
              ...(query.status && { status: query.status }),
            },
            include: enrollmentInclude,
            orderBy: { enrollmentDate: 'desc' },
          })
        ).map(enrollmentDto),
      );
    },

    async createEnrollment(schoolId: string, input: CreateEnrollmentBody) {
      return withSchoolScope(db, schoolId, async (tx) => {
        if (!(await tx.student.findFirst({ where: { id: input.studentId, schoolId } })))
          throw errors.notFound('Élève introuvable.');
        await validateEnrollment(tx, schoolId, input);
        if (
          await tx.enrollment.findUnique({
            where: {
              studentId_academicYearId: {
                studentId: input.studentId,
                academicYearId: input.academicYearId,
              },
            },
          })
        )
          throw errors.conflict('Cet élève possède déjà une inscription pour cette année.');
        const row = await tx.enrollment.create({
          data: {
            schoolId,
            studentId: input.studentId,
            academicYearId: input.academicYearId,
            classId: input.classId ?? null,
            studentCategoryId: input.studentCategoryId ?? null,
            enrollmentDate: dbDate(input.enrollmentDate),
            enrollmentType: input.enrollmentType,
            status: input.status,
          },
          include: enrollmentInclude,
        });
        await audit.log(
          {
            action: AuditAction.ENROLLMENT_CREATED,
            entityType: 'enrollment',
            entityId: row.id,
            schoolId,
            after: input,
          },
          tx,
        );
        return enrollmentDto(row);
      });
    },

    async updateEnrollment(schoolId: string, id: string, input: Record<string, unknown>) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const before = await tx.enrollment.findFirst({ where: { id, schoolId } });
        if (!before) throw errors.notFound('Inscription introuvable.');
        await validateEnrollment(tx, schoolId, {
          academicYearId: before.academicYearId,
          classId: input.classId !== undefined ? (input.classId as string | null) : before.classId,
          studentCategoryId:
            input.studentCategoryId !== undefined
              ? (input.studentCategoryId as string | null)
              : before.studentCategoryId,
        });
        const row = await tx.enrollment.update({
          where: { id },
          data: {
            ...(input.classId !== undefined && { classId: input.classId as string | null }),
            ...(input.studentCategoryId !== undefined && {
              studentCategoryId: input.studentCategoryId as string | null,
            }),
            ...(input.enrollmentDate !== undefined && {
              enrollmentDate: dbDate(input.enrollmentDate as string),
            }),
            ...(input.enrollmentType !== undefined && {
              enrollmentType: input.enrollmentType as never,
            }),
            ...(input.status !== undefined && { status: input.status as never }),
          },
          include: enrollmentInclude,
        });
        await audit.log(
          {
            action: AuditAction.ENROLLMENT_UPDATED,
            entityType: 'enrollment',
            entityId: id,
            schoolId,
            before,
            after: input,
          },
          tx,
        );
        return enrollmentDto(row);
      });
    },

    async transferClass(
      schoolId: string,
      id: string,
      toClassId: string | null,
      reason: string,
      effectiveAt?: string,
    ) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const before = await tx.enrollment.findFirst({ where: { id, schoolId } });
        if (!before) throw errors.notFound('Inscription introuvable.');
        await validateEnrollment(tx, schoolId, {
          academicYearId: before.academicYearId,
          classId: toClassId,
        });
        if (before.classId === toClassId)
          throw errors.validation('La nouvelle classe est identique à la classe actuelle.');
        await tx.studentClassChange.create({
          data: {
            enrollmentId: id,
            fromClassId: before.classId,
            toClassId,
            reason,
            ...(effectiveAt && { effectiveAt: new Date(effectiveAt) }),
          },
        });
        const row = await tx.enrollment.update({
          where: { id },
          data: { classId: toClassId },
          include: enrollmentInclude,
        });
        await audit.log(
          {
            action: AuditAction.ENROLLMENT_CLASS_TRANSFERRED,
            entityType: 'enrollment',
            entityId: id,
            schoolId,
            before: { classId: before.classId },
            after: { classId: toClassId },
            metadata: { reason },
          },
          tx,
        );
        return enrollmentDto(row);
      });
    },

    async cancelEnrollment(schoolId: string, id: string, reason: string) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const before = await tx.enrollment.findFirst({ where: { id, schoolId } });
        if (!before) throw errors.notFound('Inscription introuvable.');
        if (before.status === 'CANCELLED')
          throw errors.validation('Cette inscription est déjà annulée.');
        const row = await tx.enrollment.update({
          where: { id },
          data: { status: 'CANCELLED' },
          include: enrollmentInclude,
        });
        await audit.log(
          {
            action: AuditAction.ENROLLMENT_CANCELLED,
            entityType: 'enrollment',
            entityId: id,
            schoolId,
            before: { status: before.status },
            after: { status: 'CANCELLED' },
            metadata: { reason },
          },
          tx,
        );
        return enrollmentDto(row);
      });
    },

    async dashboard(schoolId: string, academicYearId?: string) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const year =
          academicYearId ??
          (await tx.academicYear.findFirst({ where: { schoolId, isCurrent: true } }))?.id;
        const enrollmentWhere = { schoolId, ...(year && { academicYearId: year }) };
        const [
          activeStudents,
          newEnrollments,
          reenrollments,
          unassignedStudents,
          pendingGuardianLinks,
        ] = await Promise.all([
          tx.student.count({ where: { schoolId, status: 'ACTIVE' } }),
          tx.enrollment.count({
            where: { ...enrollmentWhere, enrollmentType: 'NEW', status: 'ACTIVE' },
          }),
          tx.enrollment.count({
            where: { ...enrollmentWhere, enrollmentType: 'RE_ENROLLMENT', status: 'ACTIVE' },
          }),
          tx.enrollment.count({ where: { ...enrollmentWhere, classId: null, status: 'ACTIVE' } }),
          tx.studentGuardian.count({ where: { student: { schoolId }, status: 'PENDING' } }),
        ]);
        return {
          activeStudents,
          newEnrollments,
          reenrollments,
          unassignedStudents,
          pendingGuardianLinks,
        };
      });
    },

    async search(schoolId: string, q: string) {
      const result = await this.list(schoolId, { q, page: 1, page_size: 10 });
      return {
        students: result.data.map(({ id, studentNumber, firstName, lastName }) => ({
          id,
          studentNumber,
          firstName,
          lastName,
        })),
      };
    },
  };
}

export type StudentsService = ReturnType<typeof createStudentsService>;
