import { createHash } from 'node:crypto';
import { Prisma, type ExportFormat, type ExportType } from '@prisma/client';
import type { CreateExportInput } from '@cplan/contracts';
import type { Database } from '../../platform/db.js';
import type { Storage } from '../../platform/storage.js';
import type { AuditService } from '../../platform/audit.js';
import { AuditAction } from '../../platform/audit.js';
import { errors } from '../../platform/errors.js';
import { withPlatformScope, withSchoolScope } from '../../platform/school-scope.js';
import type { ReportingService } from '../reporting/reporting.service.js';
import type { NotificationsService } from '../notifications/notifications.service.js';
import { renderCsv, renderPdf, renderXlsx, type TabularDocument } from './document-renderer.js';

const formats: Record<ExportType, ExportFormat[]> = {
  STUDENTS_LIST: ['PDF', 'XLSX', 'CSV'],
  STUDENTS_BY_CLASS: ['PDF', 'XLSX'],
  PAID_STUDENTS: ['PDF', 'XLSX'],
  UNPAID_STUDENTS: ['PDF', 'XLSX'],
  STUDENT_FINANCIAL_STATEMENT: ['PDF'],
  PAYMENTS_BY_PERIOD: ['PDF', 'XLSX', 'CSV'],
  PAYMENTS_BY_OPERATOR: ['PDF', 'XLSX'],
  PAYMENTS_BY_CLASS: ['PDF', 'XLSX'],
  RECEIPTS: ['PDF'],
  OUTSTANDING: ['PDF', 'XLSX'],
};
const serial = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const asRecord = (value: Prisma.JsonValue) =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const int = (v: unknown, fallback = 0) =>
  typeof v === 'number' ? v : typeof v === 'string' ? Number(v) || fallback : fallback;
export function createExportsService(
  db: Database,
  storage: Storage,
  audit: AuditService,
  reports: ReportingService,
  notifications?: NotificationsService,
) {
  async function dataset(
    schoolId: string,
    userId: string,
    type: ExportType,
    filters: Record<string, unknown>,
  ): Promise<TabularDocument> {
    const school = await withSchoolScope(db, schoolId, (tx) =>
      tx.school.findUniqueOrThrow({
        where: { id: schoolId },
        select: { name: true, address: true, phone: true, email: true },
      }),
    );
    const user = await withPlatformScope(db, (tx) =>
      tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { firstName: true, lastName: true },
      }),
    );
    const base = { filters, school, generatedBy: `${user.firstName} ${user.lastName}` };
    if (type === 'OUTSTANDING' || type === 'UNPAID_STUDENTS') {
      let rows = await reports.outstanding(schoolId, {
        academic_year_id: filters.academic_year_id as string | undefined,
        class_id: filters.class_id as string | undefined,
        grade_level_id: filters.grade_level_id as string | undefined,
        min_amount: type === 'UNPAID_STUDENTS' ? 0 : int(filters.min_amount),
      });
      if (type === 'UNPAID_STUDENTS') {
        const year = await reports.resolveYear(
          schoolId,
          filters.academic_year_id as string | undefined,
        );
        rows = (
          await withSchoolScope(db, schoolId, (tx) =>
            tx.$queryRaw<
              Array<{
                enrollment_id: string;
                student_id: string;
                student_number: string;
                first_name: string;
                last_name: string;
                class_name: string;
                guardian_name: string | null;
                guardian_phone: string | null;
              }>
            >(
              Prisma.sql`SELECT b.enrollment_id,b.student_id,s.student_number,s.first_name,s.last_name,c.name class_name,CONCAT(g.last_name,' ',g.first_name) guardian_name,g.phone guardian_phone FROM v_enrollment_balance b JOIN enrollments e ON e.id=b.enrollment_id JOIN students s ON s.id=b.student_id LEFT JOIN classes c ON c.id=b.class_id LEFT JOIN LATERAL(SELECT g.* FROM student_guardians sg JOIN guardians g ON g.id=sg.guardian_id WHERE sg.student_id=s.id AND sg.status='ACCEPTED' ORDER BY sg.is_primary DESC LIMIT 1)g ON true WHERE b.school_id=${schoolId}::uuid AND b.academic_year_id=${year}::uuid AND b.total_paid=0 AND e.status='ACTIVE' ORDER BY s.last_name`,
            ),
          )
        ).map((r) => ({
          enrollmentId: r.enrollment_id,
          studentId: r.student_id,
          studentNumber: r.student_number,
          studentName: `${r.last_name} ${r.first_name}`,
          className: r.class_name,
          balance: 0,
          guardianName: r.guardian_name,
          guardianPhone: r.guardian_phone,
        }));
      }
      return {
        ...base,
        title: type === 'OUTSTANDING' ? 'État des créances' : 'Élèves n’ayant pas payé',
        landscape: true,
        columns: [
          { key: 'studentNumber', label: 'Matricule' },
          { key: 'studentName', label: 'Élève' },
          { key: 'className', label: 'Classe' },
          { key: 'balance', label: 'Reste FCFA' },
          { key: 'guardianName', label: 'Responsable' },
          { key: 'guardianPhone', label: 'Téléphone' },
        ],
        rows,
      };
    }
    if (type === 'PAYMENTS_BY_CLASS') {
      const year = await reports.resolveYear(
        schoolId,
        filters.academic_year_id as string | undefined,
      );
      const rows = await reports.collection(
        schoolId,
        year,
        'class',
        filters.grade_level_id as string | undefined,
      );
      return {
        ...base,
        title: 'Paiements par classe',
        landscape: true,
        columns: [
          { key: 'name', label: 'Classe' },
          { key: 'students', label: 'Élèves' },
          { key: 'expected', label: 'Attendu' },
          { key: 'collected', label: 'Encaissé' },
          { key: 'balance', label: 'Reste' },
          { key: 'collectionRate', label: 'Taux %' },
        ],
        rows,
      };
    }
    if (type === 'PAID_STUDENTS') {
      const classId = String(filters.class_id ?? '');
      if (!classId) throw errors.validation('class_id est requis pour cet export.');
      const result = await reports.classPaymentStatus(schoolId, classId, 'ON_TRACK');
      return {
        ...base,
        title: 'Élèves à jour',
        columns: [
          { key: 'studentNumber', label: 'Matricule' },
          { key: 'studentName', label: 'Élève' },
          { key: 'className', label: 'Classe' },
          { key: 'expected', label: 'Attendu' },
          { key: 'collected', label: 'Payé' },
          { key: 'balance', label: 'Reste' },
        ],
        rows: result.data,
      };
    }
    if (type === 'STUDENTS_LIST' || type === 'STUDENTS_BY_CLASS') {
      const rows = await withSchoolScope(db, schoolId, async (tx) =>
        (
          await tx.enrollment.findMany({
            where: {
              schoolId,
              status: 'ACTIVE',
              ...(filters.academic_year_id
                ? { academicYearId: String(filters.academic_year_id) }
                : {}),
              ...(filters.class_id ? { classId: String(filters.class_id) } : {}),
            },
            include: { student: true, class: true, academicYear: true },
            orderBy: [
              { class: { name: 'asc' } },
              { student: { lastName: 'asc' } },
              { student: { firstName: 'asc' } },
            ],
          })
        ).map((r, index) => ({
          number: index + 1,
          studentNumber: r.student.studentNumber,
          lastName: r.student.lastName.toUpperCase(),
          firstName: r.student.firstName,
          className: r.class?.name ?? '',
          gender: r.student.gender ?? '',
          birthDate: r.student.dateOfBirth?.toISOString().slice(0, 10) ?? '',
          academicYear: r.academicYear.name,
          observations: '................................',
        })),
      );
      return {
        ...base,
        title: type === 'STUDENTS_BY_CLASS' ? 'Élèves par classe' : 'Liste des élèves',
        landscape: type === 'STUDENTS_BY_CLASS',
        columns: [
          { key: 'number', label: 'N°' },
          { key: 'studentNumber', label: 'Matricule' },
          { key: 'lastName', label: 'Nom' },
          { key: 'firstName', label: 'Prénoms' },
          { key: 'gender', label: 'Sexe' },
          { key: 'className', label: 'Classe' },
          { key: 'birthDate', label: 'Né(e) le' },
          { key: 'observations', label: 'Observations' },
        ],
        rows,
      };
    }
    if (type === 'PAYMENTS_BY_PERIOD' || type === 'PAYMENTS_BY_OPERATOR' || type === 'RECEIPTS') {
      const paymentIds = Array.isArray(filters.payment_ids)
        ? filters.payment_ids.map(String)
        : undefined;
      const rows = await withSchoolScope(db, schoolId, async (tx) =>
        (
          await tx.payment.findMany({
            where: {
              schoolId,
              status: { in: ['SUCCESS', 'REVERSED'] },
              ...(paymentIds?.length ? { id: { in: paymentIds } } : {}),
              ...(filters.from || filters.to
                ? {
                    paidAt: {
                      ...(filters.from ? { gte: new Date(String(filters.from)) } : {}),
                      ...(filters.to ? { lte: new Date(String(filters.to)) } : {}),
                    },
                  }
                : {}),
            },
            include: { receipt: true },
            orderBy: { paidAt: 'desc' },
          })
        ).map((r) => ({
          reference: r.reference,
          receipt: r.receipt?.receiptNumber ?? '',
          paidAt: r.paidAt?.toISOString() ?? '',
          method: r.paymentMethod,
          provider: r.provider ?? '',
          providerReference: r.providerReference ?? '',
          payer: r.payerName ?? '',
          amount: Number(r.amount),
          status: r.status,
        })),
      );
      return {
        ...base,
        title:
          type === 'PAYMENTS_BY_OPERATOR'
            ? 'Paiements par opérateur'
            : type === 'RECEIPTS'
              ? 'Reçus'
              : 'Paiements par période',
        landscape: true,
        columns: [
          { key: 'reference', label: 'Référence' },
          { key: 'receipt', label: 'Reçu' },
          { key: 'paidAt', label: 'Date' },
          { key: 'method', label: 'Moyen' },
          { key: 'provider', label: 'Opérateur' },
          { key: 'providerReference', label: 'Réf. opérateur' },
          { key: 'payer', label: 'Payeur' },
          { key: 'amount', label: 'Montant' },
        ],
        rows,
      };
    }
    if (type === 'STUDENT_FINANCIAL_STATEMENT') {
      const enrollmentId = String(filters.enrollment_id ?? '');
      if (!enrollmentId) throw errors.validation('enrollment_id est requis.');
      const [balance] = await withSchoolScope(
        db,
        schoolId,
        (tx) =>
          tx.$queryRaw<
            Array<{
              student_number: string;
              student_name: string;
              class_name: string;
              total_due: bigint;
              total_paid: bigint;
              balance: bigint;
            }>
          >`SELECT s.student_number,CONCAT(s.last_name,' ',s.first_name) student_name,c.name class_name,b.total_due,b.total_paid,b.balance FROM v_enrollment_balance b JOIN students s ON s.id=b.student_id LEFT JOIN classes c ON c.id=b.class_id WHERE b.school_id=${schoolId}::uuid AND b.enrollment_id=${enrollmentId}::uuid`,
      );
      if (!balance) throw errors.notFound('Inscription introuvable.');
      return {
        ...base,
        title: 'Situation financière de l’élève',
        columns: [
          { key: 'student_number', label: 'Matricule' },
          { key: 'student_name', label: 'Élève' },
          { key: 'class_name', label: 'Classe' },
          { key: 'total_due', label: 'À payer' },
          { key: 'total_paid', label: 'Payé' },
          { key: 'balance', label: 'Reste' },
        ],
        rows: [
          {
            ...balance,
            total_due: Number(balance.total_due),
            total_paid: Number(balance.total_paid),
            balance: Number(balance.balance),
          },
        ],
      };
    }
    throw errors.validation('Type d’export non pris en charge.');
  }
  async function generate(job: {
    id: string;
    schoolId: string;
    userId: string;
    type: ExportType;
    format: ExportFormat;
    filters: Prisma.JsonValue;
  }) {
    try {
      const doc = await dataset(job.schoolId, job.userId, job.type, asRecord(job.filters));
      const body =
        job.format === 'CSV'
          ? renderCsv(doc)
          : job.format === 'XLSX'
            ? await renderXlsx(doc)
            : await renderPdf(doc);
      const ext = job.format.toLowerCase();
      const mime =
        job.format === 'PDF'
          ? 'application/pdf'
          : job.format === 'XLSX'
            ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            : 'text/csv; charset=utf-8';
      const key = `exports/${job.schoolId}/${job.id}.${ext}`;
      await storage.putObject({ key, body, contentType: mime });
      const expires = new Date(Date.now() + 30 * 86400000);
      await withSchoolScope(db, job.schoolId, async (tx) => {
        const file = await tx.file.create({
          data: {
            schoolId: job.schoolId,
            storageKey: key,
            originalName: `csb-noutcha-kamgue-${job.type.toLowerCase()}.${ext}`,
            mimeType: mime,
            sizeBytes: body.byteLength,
            checksumSha256: createHash('sha256').update(body).digest('hex'),
            kind: 'EXPORT',
            uploadedBy: job.userId,
          },
        });
        await tx.exportJob.update({
          where: { id: job.id },
          data: {
            status: 'READY',
            rowCount: doc.rows.length,
            fileId: file.id,
            completedAt: new Date(),
            expiresAt: expires,
          },
        });
        await audit.log(
          {
            action: AuditAction.EXPORT_READY,
            entityType: 'ExportJob',
            entityId: job.id,
            schoolId: job.schoolId,
            userId: job.userId,
            metadata: { rows: doc.rows.length, format: job.format },
          },
          tx,
        );
      });
      if (notifications)
        await notifications.emit({
          schoolId: job.schoolId,
          userIds: [job.userId],
          type: 'EXPORT_READY',
          title: 'Votre export est prêt',
          body: `${job.type} peut maintenant être téléchargé.`,
          data: { screen: 'exports', exportId: job.id },
          channels: ['IN_APP', 'PUSH'],
          dedupKey: `export:${job.id}`,
        });
      return { rows: doc.rows.length };
    } catch (error) {
      await withSchoolScope(db, job.schoolId, (tx) =>
        tx.exportJob.update({
          where: { id: job.id },
          data: {
            status: 'FAILED',
            error: error instanceof Error ? error.message.slice(0, 1000) : 'Erreur inconnue',
          },
        }),
      );
      throw error;
    }
  }
  const dto = async (
    row: {
      id: string;
      schoolId: string;
      userId: string;
      type: ExportType;
      format: ExportFormat;
      filters: Prisma.JsonValue;
      options: Prisma.JsonValue;
      status: string;
      rowCount: number | null;
      fileId: string | null;
      error: string | null;
      requestedAt: Date;
      completedAt: Date | null;
      expiresAt: Date | null;
      file?: { storageKey: string } | null;
    },
    url = false,
  ) => ({
    exportId: row.id,
    type: row.type,
    format: row.format,
    filters: row.filters,
    options: row.options,
    status: row.status,
    rowCount: row.rowCount,
    error: row.error,
    requestedAt: row.requestedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    ...(url && row.status === 'READY' && row.file
      ? { downloadUrl: await storage.getDownloadUrl(row.file.storageKey, 86400) }
      : {}),
  });
  return {
    dataset,
    async print(
      schoolId: string,
      userId: string,
      kind:
        | 'student'
        | 'enrollment'
        | 'class-list'
        | 'class-payment-status'
        | 'student-statement'
        | 'receipts'
        | 'outstanding',
      params: Record<string, unknown>,
    ) {
      let type: ExportType = 'STUDENTS_LIST';
      const filters = { ...params };
      if (kind === 'class-list') type = 'STUDENTS_BY_CLASS';
      else if (kind === 'receipts') type = 'RECEIPTS';
      else if (kind === 'outstanding') type = 'OUTSTANDING';
      else if (kind === 'student-statement') type = 'STUDENT_FINANCIAL_STATEMENT';
      else if (kind === 'student' || kind === 'enrollment') {
        const enrollment = await withSchoolScope(db, schoolId, (tx) =>
          tx.enrollment.findFirst({
            where: {
              schoolId,
              ...(kind === 'student'
                ? { studentId: String(params.id) }
                : { id: String(params.id) }),
            },
            orderBy: { createdAt: 'desc' },
            select: { id: true },
          }),
        );
        if (!enrollment) throw errors.notFound('Inscription introuvable.');
        type = 'STUDENT_FINANCIAL_STATEMENT';
        filters.enrollment_id = enrollment.id;
      }
      if (kind === 'class-payment-status') {
        const result = await reports.classPaymentStatus(schoolId, String(params.class_id));
        const school = await withSchoolScope(db, schoolId, (tx) =>
          tx.school.findUniqueOrThrow({
            where: { id: schoolId },
            select: { name: true, address: true, phone: true, email: true },
          }),
        );
        const user = await withPlatformScope(db, (tx) =>
          tx.user.findUniqueOrThrow({
            where: { id: userId },
            select: { firstName: true, lastName: true },
          }),
        );
        return renderPdf({
          title: 'État des paiements par classe',
          filters,
          school,
          generatedBy: `${user.firstName} ${user.lastName}`,
          landscape: true,
          columns: [
            { key: 'studentNumber', label: 'Matricule' },
            { key: 'studentName', label: 'Élève' },
            { key: 'expected', label: 'À payer' },
            { key: 'collected', label: 'Payé' },
            { key: 'balance', label: 'Reste' },
            { key: 'situation', label: 'Situation' },
          ],
          rows: result.data,
        });
      }
      return renderPdf(await dataset(schoolId, userId, type, filters));
    },
    async create(schoolId: string, userId: string, input: CreateExportInput) {
      if (!formats[input.type].includes(input.format))
        throw errors.validation(
          `Le format ${input.format} n'est pas disponible pour ${input.type}.`,
        );
      const quota = await withSchoolScope(db, schoolId, (tx) =>
        tx.exportJob.count({
          where: { schoolId, userId, requestedAt: { gte: new Date(Date.now() - 86400000) } },
        }),
      );
      if (quota >= 50) throw errors.conflict('Quota quotidien de 50 exports atteint.');
      const row = await withSchoolScope(db, schoolId, async (tx) => {
        const created = await tx.exportJob.create({
          data: {
            schoolId,
            userId,
            type: input.type,
            format: input.format,
            filters: serial(input.filters),
            options: serial(input.options),
          },
        });
        await audit.log(
          {
            action: AuditAction.EXPORT_REQUESTED,
            entityType: 'ExportJob',
            entityId: created.id,
            schoolId,
            userId,
            metadata: { type: input.type, format: input.format, filters: input.filters },
          },
          tx,
        );
        return created;
      });
      const preview = await dataset(schoolId, userId, input.type, input.filters);
      if (preview.rows.length <= 500) {
        await generate(row);
        return dto(
          await withSchoolScope(db, schoolId, (tx) =>
            tx.exportJob.findUniqueOrThrow({ where: { id: row.id }, include: { file: true } }),
          ),
          true,
        );
      }
      await withSchoolScope(db, schoolId, (tx) =>
        tx.exportJob.update({ where: { id: row.id }, data: { rowCount: preview.rows.length } }),
      );
      return dto(row);
    },
    async list(schoolId: string, userId: string) {
      return Promise.all(
        (
          await withSchoolScope(db, schoolId, (tx) =>
            tx.exportJob.findMany({
              where: { schoolId, userId },
              include: { file: true },
              orderBy: { requestedAt: 'desc' },
              take: 50,
            }),
          )
        ).map((r) => dto(r)),
      );
    },
    async get(schoolId: string, userId: string, id: string, withUrl = false) {
      const row = await withSchoolScope(db, schoolId, (tx) =>
        tx.exportJob.findFirst({ where: { id, schoolId, userId }, include: { file: true } }),
      );
      if (!row) throw errors.notFound('Export introuvable.');
      return dto(row, withUrl);
    },
    async download(schoolId: string, userId: string, id: string) {
      const row = await withSchoolScope(db, schoolId, (tx) =>
        tx.exportJob.findFirst({
          where: { id, schoolId, userId, status: 'READY' },
          include: { file: true },
        }),
      );
      if (!row?.file) throw errors.notFound('Fichier d’export indisponible.');
      await audit.log({
        action: AuditAction.EXPORT_DOWNLOADED,
        entityType: 'ExportJob',
        entityId: id,
        schoolId,
        userId,
        metadata: { format: row.format },
      });
      return {
        downloadUrl: await storage.getDownloadUrl(row.file.storageKey, 86400),
        expiresIn: 86400,
      };
    },
    async processPending(limit = 5) {
      const jobs = await withPlatformScope(db, (tx) =>
        tx.exportJob.findMany({
          where: { status: 'PROCESSING' },
          orderBy: { requestedAt: 'asc' },
          take: limit,
        }),
      );
      for (const job of jobs) await generate(job);
      return { processed: jobs.length };
    },
    async purgeExpired() {
      const jobs = await withPlatformScope(db, (tx) =>
        tx.exportJob.findMany({
          where: { status: 'READY', expiresAt: { lt: new Date() } },
          include: { file: true },
          take: 100,
        }),
      );
      for (const job of jobs) {
        if (job.file) await storage.deleteObject(job.file.storageKey).catch(() => undefined);
        await withPlatformScope(db, async (tx) => {
          await tx.exportJob.update({
            where: { id: job.id },
            data: { status: 'EXPIRED', fileId: null },
          });
          if (job.file) await tx.file.delete({ where: { id: job.file.id } });
        });
      }
      return { purged: jobs.length };
    },
    async template(schoolId: string) {
      const row = await withSchoolScope(db, schoolId, (tx) =>
        tx.documentTemplate.upsert({ where: { schoolId }, create: { schoolId }, update: {} }),
      );
      return { ...row, updatedAt: row.updatedAt.toISOString() };
    },
    async updateTemplate(
      schoolId: string,
      userId: string,
      input: Record<string, string | null | undefined>,
    ) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const row = await tx.documentTemplate.upsert({
          where: { schoolId },
          create: { schoolId, ...input },
          update: input,
        });
        await audit.log(
          {
            action: AuditAction.DOCUMENT_TEMPLATE_UPDATED,
            entityType: 'DocumentTemplate',
            entityId: schoolId,
            schoolId,
            userId,
            after: input,
          },
          tx,
        );
        return { ...row, updatedAt: row.updatedAt.toISOString() };
      });
    },
  };
}
export type ExportsService = ReturnType<typeof createExportsService>;
