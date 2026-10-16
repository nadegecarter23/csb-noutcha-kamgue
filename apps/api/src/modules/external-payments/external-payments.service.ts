import { createHash, randomUUID } from 'node:crypto';
import type { Prisma, ExternalPaymentStatus, PaymentMethod } from '@prisma/client';
import type { Database } from '../../platform/db.js';
import type { Storage } from '../../platform/storage.js';
import type { AuditService } from '../../platform/audit.js';
import { AuditAction } from '../../platform/audit.js';
import { errors } from '../../platform/errors.js';
import { withPlatformScope, withSchoolScope } from '../../platform/school-scope.js';
import type { PaymentsService } from '../finance/payments.service.js';
import type { NotificationsService } from '../notifications/notifications.service.js';

const ALLOWED_METHODS = new Set<PaymentMethod>([
  'BANK_TRANSFER',
  'BANK_DEPOSIT',
  'CHEQUE',
  'OTHER',
]);
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const include = {
  payment: true,
  student: true,
  enrollment: { include: { class: true } },
  school: { include: { settings: true } },
  proofs: { include: { file: true }, orderBy: { orderIndex: 'asc' as const } },
} satisfies Prisma.ExternalPaymentDeclarationInclude;
type Row = Prisma.ExternalPaymentDeclarationGetPayload<{ include: typeof include }>;
const n = (value: bigint | null | undefined) => (value == null ? null : Number(value));
const asDate = (value: string) => new Date(`${value}T00:00:00.000Z`);

function dto(row: Row) {
  const sla = row.school.settings?.externalPaymentSlaHours ?? 48;
  return {
    id: row.id,
    paymentId: row.paymentId,
    reference: row.payment.reference,
    studentId: row.studentId,
    enrollmentId: row.enrollmentId,
    studentName: `${row.student.firstName} ${row.student.lastName}`,
    className: row.enrollment.class?.name ?? null,
    amount: Number(row.declaredAmount),
    creditedAmount: n(row.creditedAmount),
    paymentMethod: row.payment.paymentMethod as
      'BANK_TRANSFER' | 'BANK_DEPOSIT' | 'CHEQUE' | 'OTHER',
    bankName: row.bankName,
    paymentDate: row.paymentDate.toISOString().slice(0, 10),
    externalReference: row.externalReference,
    notes: row.notes,
    status: row.status,
    rejectionReason: row.rejectionReason,
    correctionMessage: row.correctionMessage,
    duplicateWarning: row.duplicateWarning,
    overdue:
      ['AWAITING_VALIDATION', 'CORRECTION_REQUESTED'].includes(row.status) &&
      Date.now() - row.submittedAt.getTime() > sla * 3_600_000,
    submittedAt: row.submittedAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
    proofs: row.proofs.map((proof) => ({
      id: proof.id,
      filename: proof.file.originalName,
      mimeType: proof.file.mimeType,
      sizeBytes: Number(proof.file.sizeBytes),
    })),
  };
}

export interface UploadedProof {
  filename: string;
  mimeType: string;
  body: Buffer;
}

export function createExternalPaymentsService(
  db: Database,
  audit: AuditService,
  payments: PaymentsService,
  storage: Storage,
  notifications: NotificationsService,
) {
  async function getParentRow(userId: string, id: string) {
    const row = await withPlatformScope(db, (tx) =>
      tx.externalPaymentDeclaration.findFirst({
        where: { declaredByUserId: userId, OR: [{ id }, { paymentId: id }] },
        include,
      }),
    );
    if (!row) throw errors.notFound('Déclaration introuvable.');
    return row;
  }
  async function getStaffRow(schoolId: string, id: string) {
    const row = await withSchoolScope(db, schoolId, (tx) =>
      tx.externalPaymentDeclaration.findFirst({ where: { id, schoolId }, include }),
    );
    if (!row) throw errors.notFound('Déclaration introuvable.');
    return row;
  }
  async function proofUrls(row: Row) {
    return {
      proofs: await Promise.all(
        row.proofs.map(async (proof) => ({
          id: proof.id,
          filename: proof.file.originalName,
          mimeType: proof.file.mimeType,
          url: await storage.getDownloadUrl(proof.file.storageKey, 300),
          expiresIn: 300 as const,
        })),
      ),
    };
  }

  return {
    async declare(
      userId: string,
      input: {
        enrollmentId: string;
        amount: number;
        paymentMethod: PaymentMethod;
        bankName?: string | undefined;
        paymentDate: string;
        externalReference: string;
        notes?: string | undefined;
      },
      files: UploadedProof[],
    ) {
      if (!ALLOWED_METHODS.has(input.paymentMethod))
        throw errors.validation('Mode de paiement externe invalide.');
      if (!files.length) throw errors.validation('Au moins un justificatif est obligatoire.');
      if (
        files.some(
          (file) =>
            file.body.length > MAX_FILE_BYTES ||
            !['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.mimeType),
        )
      )
        throw errors.validation('Justificatif invalide (PDF/image, 10 Mo maximum).');
      const enrollment = await withPlatformScope(db, (tx) =>
        tx.enrollment.findFirst({
          where: {
            id: input.enrollmentId,
            student: {
              guardianLinks: {
                some: { status: 'ACCEPTED', canPay: true, guardian: { userId, status: 'ACTIVE' } },
              },
            },
          },
          include: { academicYear: true, student: true },
        }),
      );
      if (!enrollment) throw errors.notFound('Inscription introuvable ou paiement non autorisé.');
      const paymentDate = asDate(input.paymentDate);
      const today = asDate(new Date().toISOString().slice(0, 10));
      if (paymentDate > today || paymentDate < enrollment.academicYear.startDate)
        throw errors.validation(
          'La date de paiement doit appartenir à l’année scolaire et ne peut pas être future.',
        );
      const min = new Date(paymentDate);
      min.setUTCDate(min.getUTCDate() - 7);
      const max = new Date(paymentDate);
      max.setUTCDate(max.getUTCDate() + 7);
      const duplicate = await withPlatformScope(db, (tx) =>
        tx.externalPaymentDeclaration.count({
          where: {
            studentId: enrollment.studentId,
            declaredAmount: BigInt(input.amount),
            externalReference: input.externalReference,
            paymentDate: { gte: min, lte: max },
            status: { not: 'CANCELLED' },
          },
        }),
      );
      const objects = files.map((file, index) => ({
        file,
        index,
        key: `schools/${enrollment.schoolId}/payment-proofs/${randomUUID()}-${file.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`,
      }));
      try {
        await Promise.all(
          objects.map((object) =>
            storage.putObject({
              key: object.key,
              body: object.file.body,
              contentType: object.file.mimeType,
            }),
          ),
        );
        const row = await withSchoolScope(db, enrollment.schoolId, async (tx) => {
          const now = new Date();
          const period = now.toISOString().slice(2, 10).replaceAll('-', '');
          const sequence = await tx.numberSequence.upsert({
            where: {
              schoolId_scope_period: {
                schoolId: enrollment.schoolId,
                scope: 'PAYMENT_REF',
                period,
              },
            },
            create: {
              schoolId: enrollment.schoolId,
              scope: 'PAYMENT_REF',
              period,
              currentValue: 1n,
            },
            update: { currentValue: { increment: 1n } },
          });
          const payment = await tx.payment.create({
            data: {
              schoolId: enrollment.schoolId,
              reference: `CPL-${period}-${sequence.currentValue.toString().padStart(6, '0')}`,
              payerUserId: userId,
              amount: BigInt(input.amount),
              paymentMethod: input.paymentMethod,
              externalReference: input.externalReference,
              status: 'AWAITING_VALIDATION',
              channel: 'PARENT_APP',
              createdBy: userId,
              paidAt: paymentDate,
              note: input.notes ?? null,
              targets: {
                create: {
                  schoolId: enrollment.schoolId,
                  studentId: enrollment.studentId,
                  enrollmentId: enrollment.id,
                },
              },
            },
          });
          const declaration = await tx.externalPaymentDeclaration.create({
            data: {
              schoolId: enrollment.schoolId,
              paymentId: payment.id,
              enrollmentId: enrollment.id,
              studentId: enrollment.studentId,
              declaredByUserId: userId,
              declaredAmount: BigInt(input.amount),
              bankName: input.bankName ?? null,
              paymentDate,
              externalReference: input.externalReference,
              notes: input.notes ?? null,
              duplicateWarning: duplicate > 0,
            },
            include,
          });
          for (const object of objects) {
            const file = await tx.file.create({
              data: {
                schoolId: enrollment.schoolId,
                storageKey: object.key,
                originalName: object.file.filename,
                mimeType: object.file.mimeType,
                sizeBytes: BigInt(object.file.body.length),
                checksumSha256: createHash('sha256').update(object.file.body).digest('hex'),
                kind: 'PAYMENT_PROOF',
                uploadedBy: userId,
              },
            });
            await tx.externalPaymentProof.create({
              data: {
                schoolId: enrollment.schoolId,
                declarationId: declaration.id,
                fileId: file.id,
                orderIndex: object.index,
              },
            });
          }
          await audit.log(
            {
              action: AuditAction.EXTERNAL_PAYMENT_DECLARED,
              entityType: 'external_payment',
              entityId: declaration.id,
              schoolId: enrollment.schoolId,
              after: {
                amount: input.amount,
                paymentMethod: input.paymentMethod,
                reference: input.externalReference,
                duplicateWarning: duplicate > 0,
              },
            },
            tx,
          );
          return tx.externalPaymentDeclaration.findUniqueOrThrow({
            where: { id: declaration.id },
            include,
          });
        });
        return dto(row);
      } catch (error) {
        await Promise.allSettled(objects.map((object) => storage.deleteObject(object.key)));
        throw error;
      }
    },
    async parentList(userId: string) {
      return withPlatformScope(db, async (tx) =>
        (
          await tx.externalPaymentDeclaration.findMany({
            where: { declaredByUserId: userId },
            include,
            orderBy: { submittedAt: 'desc' },
          })
        ).map(dto),
      );
    },
    async cancel(userId: string, id: string) {
      const row = await getParentRow(userId, id);
      if (!['AWAITING_VALIDATION', 'CORRECTION_REQUESTED'].includes(row.status))
        throw errors.conflict('Cette déclaration ne peut plus être annulée.');
      return withSchoolScope(db, row.schoolId, async (tx) => {
        await tx.externalPaymentDeclaration.update({
          where: { id: row.id },
          data: { status: 'CANCELLED', decidedAt: new Date() },
        });
        await tx.payment.update({
          where: { id: row.paymentId },
          data: { status: 'CANCELLED', statusReason: 'Annulée par le déclarant.' },
        });
        await audit.log(
          {
            action: AuditAction.EXTERNAL_PAYMENT_CANCELLED,
            entityType: 'external_payment',
            entityId: row.id,
            schoolId: row.schoolId,
            before: { status: row.status },
            after: { status: 'CANCELLED' },
          },
          tx,
        );
      });
    },
    async parentProof(userId: string, id: string) {
      return proofUrls(await getParentRow(userId, id));
    },
    async list(
      schoolId: string,
      query: {
        status?: ExternalPaymentStatus;
        overdue?: boolean;
        from?: string;
        to?: string;
        class_id?: string;
      },
    ) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const settings = await tx.schoolSettings.findUnique({ where: { schoolId } });
        const cutoff = new Date(Date.now() - (settings?.externalPaymentSlaHours ?? 48) * 3_600_000);
        const rows = await tx.externalPaymentDeclaration.findMany({
          where: {
            schoolId,
            ...(query.status ? { status: query.status } : {}),
            ...(query.overdue
              ? {
                  status: { in: ['AWAITING_VALIDATION', 'CORRECTION_REQUESTED'] },
                  submittedAt: { lt: cutoff },
                }
              : {}),
            ...(query.from || query.to
              ? {
                  paymentDate: {
                    ...(query.from ? { gte: asDate(query.from) } : {}),
                    ...(query.to ? { lte: asDate(query.to) } : {}),
                  },
                }
              : {}),
            ...(query.class_id ? { enrollment: { classId: query.class_id } } : {}),
          },
          include,
          orderBy: { submittedAt: 'asc' },
        });
        return rows.map(dto);
      });
    },
    async get(schoolId: string, id: string) {
      return dto(await getStaffRow(schoolId, id));
    },
    async staffProof(schoolId: string, id: string) {
      return proofUrls(await getStaffRow(schoolId, id));
    },
    async validate(
      schoolId: string,
      actorId: string,
      id: string,
      input: {
        creditedAmount?: number;
        valueDate?: string;
        allocations?: Array<{
          studentFeeAssignmentId: string;
          studentFeeInstallmentId?: string | null;
          amount: number;
        }>;
        internalNote?: string;
      },
    ) {
      const row = await getStaffRow(schoolId, id);
      if (!['AWAITING_VALIDATION', 'CORRECTION_REQUESTED'].includes(row.status))
        throw errors.conflict('Cette déclaration a déjà été traitée.');
      const amount = input.creditedAmount ?? Number(row.declaredAmount);
      await withSchoolScope(db, schoolId, async (tx) => {
        await tx.$queryRaw`SELECT id FROM external_payment_declarations WHERE id = ${id}::uuid AND school_id = ${schoolId}::uuid FOR UPDATE`;
        await tx.payment.update({
          where: { id: row.paymentId },
          data: {
            amount: BigInt(amount),
            paidAt: input.valueDate ? asDate(input.valueDate) : row.paymentDate,
          },
        });
        await tx.externalPaymentDeclaration.update({
          where: { id },
          data: { creditedAmount: BigInt(amount), internalNote: input.internalNote ?? null },
        });
      });
      const result = await payments.markSuccess(
        schoolId,
        actorId,
        row.paymentId,
        [row.enrollmentId],
        input.allocations,
      );
      await withSchoolScope(db, schoolId, (tx) =>
        audit.log(
          {
            action: AuditAction.EXTERNAL_PAYMENT_VALIDATED,
            entityType: 'external_payment',
            entityId: id,
            schoolId,
            before: { status: row.status, declaredAmount: Number(row.declaredAmount) },
            after: { status: 'VALIDATED', creditedAmount: amount },
          },
          tx,
        ),
      );
      await notifications.emitForPayment(
        row.paymentId,
        'EXTERNAL_PAYMENT_VALIDATED',
        { reference: row.payment.reference, amount },
        { screen: 'payment-detail', paymentId: row.paymentId },
        { critical: true },
      );
      return result;
    },
    async reject(schoolId: string, actorId: string, id: string, reason: string) {
      const row = await getStaffRow(schoolId, id);
      if (!['AWAITING_VALIDATION', 'CORRECTION_REQUESTED'].includes(row.status))
        throw errors.conflict('Cette déclaration a déjà été traitée.');
      await withSchoolScope(db, schoolId, async (tx) => {
        await tx.$queryRaw`SELECT id FROM external_payment_declarations WHERE id = ${id}::uuid AND school_id = ${schoolId}::uuid FOR UPDATE`;
        await tx.externalPaymentDeclaration.update({
          where: { id },
          data: {
            status: 'REJECTED',
            rejectionReason: reason,
            decidedAt: new Date(),
            decidedBy: actorId,
          },
        });
        await tx.payment.update({
          where: { id: row.paymentId },
          data: {
            status: 'REJECTED',
            statusReason: reason,
            validatedAt: new Date(),
            validatedBy: actorId,
          },
        });
        await audit.log(
          {
            action: AuditAction.EXTERNAL_PAYMENT_REJECTED,
            entityType: 'external_payment',
            entityId: id,
            schoolId,
            before: { status: row.status },
            after: { status: 'REJECTED', reason },
          },
          tx,
        );
      });
      await notifications.emitForPayment(
        row.paymentId,
        'EXTERNAL_PAYMENT_REJECTED',
        { reference: row.payment.reference, reason },
        { screen: 'external-payment', declarationId: id },
        { critical: true },
      );
    },
    async requestCorrection(schoolId: string, actorId: string, id: string, message: string) {
      const row = await getStaffRow(schoolId, id);
      if (row.status !== 'AWAITING_VALIDATION')
        throw errors.conflict('Une correction ne peut plus être demandée.');
      await withSchoolScope(db, schoolId, async (tx) => {
        await tx.externalPaymentDeclaration.update({
          where: { id },
          data: { status: 'CORRECTION_REQUESTED', correctionMessage: message, decidedBy: actorId },
        });
        await tx.payment.update({
          where: { id: row.paymentId },
          data: { status: 'CORRECTION_REQUESTED', statusReason: message },
        });
        await audit.log(
          {
            action: AuditAction.EXTERNAL_PAYMENT_CORRECTION_REQUESTED,
            entityType: 'external_payment',
            entityId: id,
            schoolId,
            before: { status: row.status },
            after: { status: 'CORRECTION_REQUESTED', message },
          },
          tx,
        );
      });
      await notifications.emitForPayment(
        row.paymentId,
        'EXTERNAL_PAYMENT_CORRECTION',
        { reference: row.payment.reference, reason: message },
        { screen: 'external-payment', declarationId: id },
        { critical: true },
      );
    },
    async stats(schoolId: string) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const settings = await tx.schoolSettings.findUnique({ where: { schoolId } });
        const cutoff = new Date(Date.now() - (settings?.externalPaymentSlaHours ?? 48) * 3_600_000);
        const [grouped, overdue] = await Promise.all([
          tx.externalPaymentDeclaration.groupBy({
            by: ['status'],
            where: { schoolId },
            _count: true,
            _sum: { declaredAmount: true },
          }),
          tx.externalPaymentDeclaration.count({
            where: {
              schoolId,
              status: { in: ['AWAITING_VALIDATION', 'CORRECTION_REQUESTED'] },
              submittedAt: { lt: cutoff },
            },
          }),
        ]);
        return {
          overdue,
          byStatus: Object.fromEntries(
            grouped.map((item) => [
              item.status,
              { count: item._count, amount: Number(item._sum.declaredAmount ?? 0n) },
            ]),
          ),
        };
      });
    },
    async notifyOverdue() {
      const schools = await withPlatformScope(db, (tx) =>
        tx.school.findMany({ where: { status: 'ACTIVE' }, select: { id: true, settings: true } }),
      );
      for (const school of schools) {
        const cutoff = new Date(
          Date.now() - (school.settings?.externalPaymentSlaHours ?? 48) * 3_600_000,
        );
        const count = await withSchoolScope(db, school.id, (tx) =>
          tx.externalPaymentDeclaration.count({
            where: {
              schoolId: school.id,
              status: { in: ['AWAITING_VALIDATION', 'CORRECTION_REQUESTED'] },
              submittedAt: { lt: cutoff },
            },
          }),
        );
        if (!count) continue;
        const users = await withSchoolScope(db, school.id, async (tx) =>
          (
            await tx.userRole.findMany({
              where: {
                schoolId: school.id,
                role: {
                  permissions: { some: { permission: { code: 'payments.validate_external' } } },
                },
                user: { status: 'ACTIVE' },
              },
              select: { userId: true },
            })
          ).map((row) => row.userId),
        );
        await notifications.emit({
          schoolId: school.id,
          userIds: users,
          type: 'EXTERNAL_PAYMENT_PENDING_SLA',
          variables: { count },
          data: { screen: 'external-payments' },
          channels: ['IN_APP', 'PUSH'],
          dedupKey: `external-sla:${new Date().toISOString().slice(0, 10)}`,
        });
      }
    },
  };
}
export type ExternalPaymentsService = ReturnType<typeof createExternalPaymentsService>;
