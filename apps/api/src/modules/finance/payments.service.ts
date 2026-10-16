import { Prisma, type PaymentStatus } from '@prisma/client';
import {
  assertPaymentTransition,
  computeAllocations,
  validateManualAllocations,
  type AllocationTarget,
} from '@cplan/domain';
import type { AuditService } from '../../platform/audit.js';
import { AuditAction } from '../../platform/audit.js';
import type { Database } from '../../platform/db.js';
import { errors } from '../../platform/errors.js';
import { withSchoolScope } from '../../platform/school-scope.js';
import { renderReceiptPdf } from './receipt.pdf.js';

const n = (value: bigint) => Number(value);
const paymentInclude = {
  allocations: {
    include: { assignment: { include: { feeType: true, feeStructure: true } }, student: true },
  },
  targets: true,
  receipt: true,
} satisfies Prisma.PaymentInclude;
type PaymentRow = Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>;

function paymentDto(row: PaymentRow) {
  return {
    id: row.id,
    reference: row.reference,
    amount: n(row.amount),
    paymentMethod: row.paymentMethod,
    provider: row.provider,
    providerReference: row.providerReference,
    status: row.status,
    statusReason: row.statusReason,
    channel: row.channel,
    unallocatedAmount: n(row.unallocatedAmount),
    paidAt: row.paidAt?.toISOString() ?? null,
    studentNames: [
      ...new Set(
        row.allocations.map((item) => `${item.student.firstName} ${item.student.lastName}`),
      ),
    ],
    receiptId: row.receipt?.id ?? null,
    receiptNumber: row.receipt?.receiptNumber ?? null,
  };
}

async function nextNumber(
  tx: Prisma.TransactionClient,
  schoolId: string,
  scope: 'PAYMENT_REF' | 'RECEIPT',
  period: string,
) {
  const sequence = await tx.numberSequence.upsert({
    where: { schoolId_scope_period: { schoolId, scope, period } },
    create: { schoolId, scope, period, currentValue: 1n },
    update: { currentValue: { increment: 1n } },
  });
  return sequence.currentValue;
}

async function nextUnitReceipt(
  tx: Prisma.TransactionClient,
  schoolId: string,
  organizationalUnitId: string,
  period: string,
) {
  const register = await tx.cashRegister.findFirst({
    where: { schoolId, organizationalUnitId, status: 'ACTIVE' },
    orderBy: { code: 'asc' },
  });
  if (!register) throw errors.conflict('Aucune caisse active n’est configurée pour cette unité.');
  const sequence = await tx.receiptSequence.upsert({
    where: {
      schoolId_organizationalUnitId_cashRegisterId_period: {
        schoolId,
        organizationalUnitId,
        cashRegisterId: register.id,
        period,
      },
    },
    create: {
      schoolId,
      organizationalUnitId,
      cashRegisterId: register.id,
      period,
      currentValue: 1n,
    },
    update: { currentValue: { increment: 1n } },
  });
  return `${register.code}-RCT-${period}-${sequence.currentValue.toString().padStart(6, '0')}`;
}

export function createPaymentsService(db: Database, audit: AuditService) {
  return {
    async create(
      schoolId: string,
      actorId: string,
      input: {
        enrollmentIds: string[];
        amount: number;
        paymentMethod: Prisma.PaymentCreateInput['paymentMethod'];
        provider?: string | null | undefined;
        providerReference?: string | null | undefined;
        externalReference?: string | null | undefined;
        payerUserId?: string | null | undefined;
        payerName?: string | null | undefined;
        payerPhone?: string | null | undefined;
        channel: Prisma.PaymentCreateInput['channel'];
        cashSessionId?: string | null | undefined;
        note?: string | null | undefined;
        paidAt?: Date | null | undefined;
      },
    ) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const enrollments = await tx.enrollment.findMany({
          where: { id: { in: input.enrollmentIds }, schoolId },
          select: { id: true, studentId: true, class: { select: { organizationalUnitId: true } } },
        });
        if (enrollments.length !== new Set(input.enrollmentIds).size)
          throw errors.notFound('Une inscription est introuvable.');
        const unitIds = [
          ...new Set(
            enrollments
              .map((x) => x.class?.organizationalUnitId)
              .filter((x): x is string => Boolean(x)),
          ),
        ];
        if (unitIds.length > 1)
          throw errors.validation('Un paiement doit cibler une seule unité organisationnelle.');
        const unitId = unitIds[0] ?? null;
        const now = new Date();
        const period = now.toISOString().slice(2, 10).replaceAll('-', '');
        const seq = await nextNumber(tx, schoolId, 'PAYMENT_REF', period);
        const row = await tx.payment.create({
          data: {
            schoolId,
            reference: `CPL-${period}-${seq.toString().padStart(6, '0')}`,
            amount: BigInt(input.amount),
            paymentMethod: input.paymentMethod,
            provider: input.provider ?? null,
            providerReference: input.providerReference ?? null,
            externalReference: input.externalReference ?? null,
            payerUserId: input.payerUserId ?? null,
            payerName: input.payerName ?? null,
            payerPhone: input.payerPhone ?? null,
            channel: input.channel,
            createdBy: actorId,
            cashSessionId: input.cashSessionId ?? null,
            note: input.note ?? null,
            paidAt: input.paidAt ?? null,
            targets: {
              create: enrollments.map((enrollment) => ({
                schoolId,
                studentId: enrollment.studentId,
                enrollmentId: enrollment.id,
                organizationalUnitId: unitId,
              })),
            },
          },
          include: paymentInclude,
        });
        await audit.log(
          {
            action: AuditAction.PAYMENT_CREATED,
            entityType: 'payment',
            entityId: row.id,
            schoolId,
            after: {
              amount: input.amount,
              method: input.paymentMethod,
              enrollmentIds: input.enrollmentIds,
            },
          },
          tx,
        );
        return paymentDto(row);
      });
    },
    async markFailed(schoolId: string, paymentId: string, reason: string) {
      return withSchoolScope(db, schoolId, async (tx) => {
        await tx.$queryRaw`SELECT id FROM payments WHERE id = ${paymentId}::uuid AND school_id = ${schoolId}::uuid FOR UPDATE`;
        const payment = await tx.payment.findFirst({
          where: { id: paymentId, schoolId },
          include: paymentInclude,
        });
        if (!payment) throw errors.notFound('Paiement introuvable.');
        if (payment.status === 'FAILED') return paymentDto(payment);
        assertPaymentTransition(payment.status, 'FAILED');
        await tx.payment.update({
          where: { id: paymentId },
          data: { status: 'FAILED', statusReason: reason, providerStatusCheckedAt: new Date() },
        });
        await audit.log(
          {
            action: AuditAction.PAYMENT_FAILED,
            entityType: 'payment',
            entityId: paymentId,
            schoolId,
            after: { reason },
          },
          tx,
        );
        return paymentDto(
          await tx.payment.findUniqueOrThrow({ where: { id: paymentId }, include: paymentInclude }),
        );
      });
    },
    async list(
      schoolId: string,
      query: {
        page?: number | undefined;
        page_size?: number | undefined;
        status?: PaymentStatus | undefined;
        student_id?: string | undefined;
        academic_year_id?: string | undefined;
        class_id?: string | undefined;
        grade_level_id?: string | undefined;
        method?: string | undefined;
        provider?: string | undefined;
        from?: string | undefined;
        to?: string | undefined;
        min_amount?: number | undefined;
        max_amount?: number | undefined;
        sort?:
          'reference' | 'amount' | 'paidAt' | 'status' | 'paymentMethod' | 'provider' | undefined;
        order?: 'asc' | 'desc' | undefined;
      },
    ) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const page = query.page ?? 1;
        const size = query.page_size ?? 25;
        const where: Prisma.PaymentWhereInput = {
          schoolId,
          ...(query.status ? { status: query.status } : {}),
          ...(query.method
            ? { paymentMethod: query.method as Prisma.PaymentCreateInput['paymentMethod'] }
            : {}),
          ...(query.provider ? { provider: query.provider } : {}),
          ...(query.from || query.to
            ? {
                paidAt: {
                  ...(query.from ? { gte: new Date(query.from) } : {}),
                  ...(query.to ? { lte: new Date(query.to) } : {}),
                },
              }
            : {}),
          ...(query.min_amount !== undefined || query.max_amount !== undefined
            ? {
                amount: {
                  ...(query.min_amount !== undefined ? { gte: query.min_amount } : {}),
                  ...(query.max_amount !== undefined ? { lte: query.max_amount } : {}),
                },
              }
            : {}),
          ...(query.student_id || query.academic_year_id || query.class_id || query.grade_level_id
            ? {
                allocations: {
                  some: {
                    ...(query.student_id ? { studentId: query.student_id } : {}),
                    enrollment: {
                      ...(query.academic_year_id ? { academicYearId: query.academic_year_id } : {}),
                      ...(query.class_id ? { classId: query.class_id } : {}),
                      ...(query.grade_level_id
                        ? { class: { gradeLevelId: query.grade_level_id } }
                        : {}),
                    },
                  },
                },
              }
            : {}),
        };
        const sort = query.sort ?? 'paidAt';
        const order = query.order ?? 'desc';
        const [rows, total, aggregate] = await Promise.all([
          tx.payment.findMany({
            where,
            include: paymentInclude,
            orderBy: { [sort]: order },
            skip: (page - 1) * size,
            take: size,
          }),
          tx.payment.count({ where }),
          tx.payment.aggregate({ where, _sum: { amount: true } }),
        ]);
        return {
          data: rows.map(paymentDto),
          meta: {
            page,
            page_size: size,
            total,
            total_pages: Math.ceil(total / size),
            total_amount: Number(aggregate._sum.amount ?? 0n),
          },
        };
      });
    },
    async get(schoolId: string, id: string) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const row = await tx.payment.findFirst({
          where: { id, schoolId },
          include: paymentInclude,
        });
        if (!row) throw errors.notFound('Paiement introuvable.');
        return {
          ...paymentDto(row),
          allocations: row.allocations.map((item) => ({
            id: item.id,
            label: item.assignment.feeStructure.name,
            amount: n(item.amount),
            studentName: `${item.student.firstName} ${item.student.lastName}`,
          })),
        };
      });
    },
    async markSuccess(
      schoolId: string,
      actorId: string,
      paymentId: string,
      enrollmentIds: string[],
      manual?:
        | Array<{
            studentFeeAssignmentId: string;
            studentFeeInstallmentId?: string | null | undefined;
            amount: number;
          }>
        | undefined,
    ) {
      return withSchoolScope(db, schoolId, async (tx) => {
        await tx.$queryRaw`SELECT id FROM payments WHERE id = ${paymentId}::uuid AND school_id = ${schoolId}::uuid FOR UPDATE`;
        const payment = await tx.payment.findFirst({
          where: { id: paymentId, schoolId },
          include: paymentInclude,
        });
        if (!payment) throw errors.notFound('Paiement introuvable.');
        if (payment.status === 'SUCCESS') return paymentDto(payment);
        assertPaymentTransition(payment.status, 'SUCCESS');
        const locked = [...new Set(enrollmentIds)].sort();
        await tx.$queryRaw`SELECT id FROM enrollments WHERE id IN (${Prisma.join(locked.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR UPDATE`;
        const assignments = await tx.studentFeeAssignment.findMany({
          where: {
            schoolId,
            enrollmentId: { in: locked },
            status: { notIn: ['CANCELLED', 'WAIVED', 'PAID'] },
          },
          include: {
            feeType: true,
            feeStructure: true,
            installments: { orderBy: { orderIndex: 'asc' } },
          },
        });
        const targets: AllocationTarget[] = assignments.flatMap(
          (assignment): AllocationTarget[] => {
            if (!assignment.installments.length)
              return [
                {
                  assignmentId: assignment.id,
                  installmentId: null,
                  remainingAmount: assignment.finalAmount - assignment.paidAmount,
                  priority: assignment.feeType.priority,
                  dueDate: assignment.feeStructure.dueDate?.toISOString().slice(0, 10) ?? null,
                  name: assignment.feeStructure.name,
                  allowPartialPayment: assignment.feeStructure.allowPartialPayment,
                  enforceInstallmentOrder: false,
                  priorInstallmentOpen: false,
                  opensAt: assignment.feeStructure.opensAt?.toISOString().slice(0, 10) ?? null,
                },
              ];
            return assignment.installments.map((item, index) => ({
              assignmentId: assignment.id,
              installmentId: item.id,
              remainingAmount: item.amount - item.paidAmount,
              priority: assignment.feeType.priority,
              dueDate: item.dueDate.toISOString().slice(0, 10),
              name: `${assignment.feeStructure.name} ${item.name}`,
              allowPartialPayment: assignment.feeStructure.allowPartialPayment,
              enforceInstallmentOrder: assignment.feeStructure.enforceInstallmentOrder,
              priorInstallmentOpen: assignment.installments
                .slice(0, index)
                .some((prior) => prior.paidAmount < prior.amount),
              opensAt: assignment.feeStructure.opensAt?.toISOString().slice(0, 10) ?? null,
            }));
          },
        );
        const computed = manual
          ? validateManualAllocations(
              payment.amount,
              manual.map((item) => ({
                assignmentId: item.studentFeeAssignmentId,
                installmentId: item.studentFeeInstallmentId ?? null,
                amount: BigInt(item.amount),
              })),
              targets,
            )
          : computeAllocations(payment.amount, targets);
        const byAssignment = new Map<string, bigint>();
        for (const item of computed.allocations) {
          const assignment = assignments.find((candidate) => candidate.id === item.assignmentId);
          if (!assignment) throw errors.validation('Une affectation manuelle est invalide.');
          await tx.paymentAllocation.create({
            data: {
              paymentId,
              studentFeeAssignmentId: item.assignmentId,
              studentFeeInstallmentId: item.installmentId,
              studentId: assignment.studentId,
              enrollmentId: assignment.enrollmentId,
              schoolId,
              organizationalUnitId: assignment.organizationalUnitId,
              amount: item.amount,
              createdBy: actorId,
              isManual: Boolean(manual),
            },
          });
          if (item.installmentId)
            await tx.studentFeeInstallment.update({
              where: { id: item.installmentId },
              data: { paidAmount: { increment: item.amount } },
            });
          byAssignment.set(
            item.assignmentId,
            (byAssignment.get(item.assignmentId) ?? 0n) + item.amount,
          );
        }
        for (const [id, increment] of byAssignment) {
          const assignment = assignments.find((item) => item.id === id);
          if (!assignment) throw errors.validation('Une affectation de paiement est invalide.');
          const paid = assignment.paidAmount + increment;
          await tx.studentFeeAssignment.update({
            where: { id },
            data: {
              paidAmount: paid,
              status: paid >= assignment.finalAmount ? 'PAID' : 'PARTIALLY_PAID',
            },
          });
        }
        const paidAt = payment.paidAt ?? new Date();
        await tx.payment.update({
          where: { id: paymentId },
          data: {
            status: 'SUCCESS',
            paidAt,
            validatedAt: paidAt,
            validatedBy: actorId,
            unallocatedAmount: computed.unallocatedAmount,
          },
        });
        await tx.externalPaymentDeclaration.updateMany({
          where: { paymentId, status: { in: ['AWAITING_VALIDATION', 'CORRECTION_REQUESTED'] } },
          data: {
            status: 'VALIDATED',
            creditedAmount: payment.amount,
            decidedAt: new Date(),
            decidedBy: actorId,
          },
        });
        const first = await tx.enrollment.findFirstOrThrow({
          where: { id: { in: locked }, schoolId },
          include: { student: true, class: true, academicYear: true, school: true },
        });
        const sums = await tx.studentFeeAssignment.aggregate({
          where: { enrollmentId: { in: locked }, status: { not: 'CANCELLED' } },
          _sum: { finalAmount: true, paidAmount: true },
        });
        const organizationalUnitId = assignments[0]?.organizationalUnitId ?? null;
        const receiptNumber = organizationalUnitId
          ? await nextUnitReceipt(
              tx,
              schoolId,
              organizationalUnitId,
              String(paidAt.getUTCFullYear()),
            )
          : `CPL-RCT-${paidAt.getUTCFullYear()}-${(await nextNumber(tx, schoolId, 'RECEIPT', String(paidAt.getUTCFullYear()))).toString().padStart(6, '0')}`;
        const totalDue = n(sums._sum.finalAmount ?? 0n);
        const totalPaid = n(sums._sum.paidAmount ?? 0n);
        await tx.receipt.create({
          data: {
            schoolId,
            paymentId,
            receiptNumber,
            issuedBy: actorId,
            snapshot: {
              school: { name: first.school.name, address: first.school.address },
              receipt: { number: receiptNumber, issuedAt: paidAt.toISOString() },
              student: {
                fullName: `${first.student.firstName} ${first.student.lastName}`,
                studentNumber: first.student.studentNumber,
                className: first.class?.name ?? 'Non affecté',
                academicYear: first.academicYear.name,
              },
              payment: {
                reference: payment.reference,
                amount: n(payment.amount),
                method: payment.paymentMethod,
                provider: payment.provider,
                providerReference: payment.providerReference,
                paidAt: paidAt.toISOString(),
              },
              allocations: computed.allocations.map((item) => ({
                label:
                  targets.find(
                    (target) =>
                      target.assignmentId === item.assignmentId &&
                      target.installmentId === item.installmentId,
                  )?.name ?? 'Frais scolaire',
                amount: n(item.amount),
              })),
              balanceAfter: { totalDue, totalPaid, balance: totalDue - totalPaid },
              issuedBy: { userId: actorId },
            },
          },
        });
        await audit.log(
          {
            action: AuditAction.PAYMENT_SUCCEEDED,
            entityType: 'payment',
            entityId: paymentId,
            schoolId,
            after: {
              allocated: n(payment.amount - computed.unallocatedAmount),
              unallocated: n(computed.unallocatedAmount),
              receiptNumber,
            },
          },
          tx,
        );
        return paymentDto(
          await tx.payment.findUniqueOrThrow({ where: { id: paymentId }, include: paymentInclude }),
        );
      });
    },
    async reverse(schoolId: string, actorId: string, id: string, reason: string) {
      return withSchoolScope(db, schoolId, async (tx) => {
        await tx.$queryRaw`SELECT id FROM payments WHERE id = ${id}::uuid AND school_id = ${schoolId}::uuid FOR UPDATE`;
        const original = await tx.payment.findFirst({
          where: { id, schoolId },
          include: paymentInclude,
        });
        if (!original) throw errors.notFound('Paiement introuvable.');
        assertPaymentTransition(original.status, 'REVERSED');
        const now = new Date();
        const period = now.toISOString().slice(2, 10).replaceAll('-', '');
        const refSeq = await nextNumber(tx, schoolId, 'PAYMENT_REF', period);
        const reversal = await tx.payment.create({
          data: {
            schoolId,
            reference: `CPL-${period}-${refSeq.toString().padStart(6, '0')}`,
            amount: -original.amount,
            paymentMethod: original.paymentMethod,
            status: 'SUCCESS',
            statusReason: reason,
            channel: 'BACKOFFICE',
            reversalOfPaymentId: id,
            paidAt: now,
            validatedAt: now,
            validatedBy: actorId,
            createdBy: actorId,
          },
        });
        for (const allocation of original.allocations) {
          await tx.paymentAllocation.create({
            data: {
              paymentId: reversal.id,
              studentFeeAssignmentId: allocation.studentFeeAssignmentId,
              studentFeeInstallmentId: allocation.studentFeeInstallmentId,
              studentId: allocation.studentId,
              enrollmentId: allocation.enrollmentId,
              schoolId,
              organizationalUnitId: allocation.organizationalUnitId,
              amount: -allocation.amount,
              createdBy: actorId,
            },
          });
          await tx.studentFeeAssignment.update({
            where: { id: allocation.studentFeeAssignmentId },
            data: { paidAmount: { decrement: allocation.amount }, status: 'PENDING' },
          });
          if (allocation.studentFeeInstallmentId)
            await tx.studentFeeInstallment.update({
              where: { id: allocation.studentFeeInstallmentId },
              data: { paidAmount: { decrement: allocation.amount }, status: 'UPCOMING' },
            });
        }
        await tx.payment.update({
          where: { id },
          data: { status: 'REVERSED', statusReason: reason },
        });
        if (original.receipt)
          await tx.receipt.update({
            where: { id: original.receipt.id },
            data: { cancelledAt: now, cancelledReason: reason },
          });
        const receiptSeq = await nextNumber(tx, schoolId, 'RECEIPT', String(now.getUTCFullYear()));
        await tx.receipt.create({
          data: {
            schoolId,
            paymentId: reversal.id,
            receiptNumber: `CPL-RCT-${now.getUTCFullYear()}-${receiptSeq.toString().padStart(6, '0')}`,
            issuedBy: actorId,
            snapshot: {
              kind: 'CREDIT_NOTE',
              originalPayment: original.reference,
              reason,
              amount: n(-original.amount),
              receipt: {
                number: `CPL-RCT-${now.getUTCFullYear()}-${receiptSeq.toString().padStart(6, '0')}`,
                issuedAt: now.toISOString(),
              },
            },
          },
        });
        await audit.log(
          {
            action: AuditAction.PAYMENT_REVERSED,
            entityType: 'payment',
            entityId: id,
            schoolId,
            after: { reversalId: reversal.id, reason },
          },
          tx,
        );
        return paymentDto(
          await tx.payment.findUniqueOrThrow({
            where: { id: reversal.id },
            include: paymentInclude,
          }),
        );
      });
    },
    async reallocate(
      schoolId: string,
      actorId: string,
      paymentId: string,
      manual: Array<{
        studentFeeAssignmentId: string;
        studentFeeInstallmentId?: string | null | undefined;
        amount: number;
      }>,
    ) {
      return withSchoolScope(db, schoolId, async (tx) => {
        await tx.$queryRaw`SELECT id FROM payments WHERE id = ${paymentId}::uuid AND school_id = ${schoolId}::uuid FOR UPDATE`;
        const payment = await tx.payment.findFirst({
          where: { id: paymentId, schoolId },
          include: paymentInclude,
        });
        if (!payment) throw errors.notFound('Paiement introuvable.');
        if (payment.status !== 'SUCCESS' || payment.unallocatedAmount <= 0n)
          throw errors.conflict("Ce paiement n'a aucune avance réaffectable.");
        const ids = [...new Set(manual.map((item) => item.studentFeeAssignmentId))];
        const assignments = await tx.studentFeeAssignment.findMany({
          where: { id: { in: ids }, schoolId },
          include: {
            feeType: true,
            feeStructure: true,
            installments: { orderBy: { orderIndex: 'asc' } },
          },
        });
        const targets: AllocationTarget[] = assignments.flatMap((assignment): AllocationTarget[] =>
          assignment.installments.length
            ? assignment.installments.map((item, index) => ({
                assignmentId: assignment.id,
                installmentId: item.id,
                remainingAmount: item.amount - item.paidAmount,
                priority: assignment.feeType.priority,
                dueDate: item.dueDate.toISOString().slice(0, 10),
                name: `${assignment.feeStructure.name} ${item.name}`,
                allowPartialPayment: assignment.feeStructure.allowPartialPayment,
                enforceInstallmentOrder: assignment.feeStructure.enforceInstallmentOrder,
                priorInstallmentOpen: assignment.installments
                  .slice(0, index)
                  .some((prior) => prior.paidAmount < prior.amount),
              }))
            : [
                {
                  assignmentId: assignment.id,
                  installmentId: null,
                  remainingAmount: assignment.finalAmount - assignment.paidAmount,
                  priority: assignment.feeType.priority,
                  dueDate: assignment.feeStructure.dueDate?.toISOString().slice(0, 10) ?? null,
                  name: assignment.feeStructure.name,
                  allowPartialPayment: assignment.feeStructure.allowPartialPayment,
                  enforceInstallmentOrder: false,
                  priorInstallmentOpen: false,
                },
              ],
        );
        let computed;
        try {
          computed = validateManualAllocations(
            payment.unallocatedAmount,
            manual.map((item) => ({
              assignmentId: item.studentFeeAssignmentId,
              installmentId: item.studentFeeInstallmentId ?? null,
              amount: BigInt(item.amount),
            })),
            targets,
          );
        } catch (error) {
          throw errors.validation(
            error instanceof Error ? error.message : 'Réaffectation invalide.',
          );
        }
        for (const item of computed.allocations) {
          const assignment = assignments.find((candidate) => candidate.id === item.assignmentId);
          if (!assignment) throw errors.validation('Affectation hors périmètre.');
          await tx.paymentAllocation.create({
            data: {
              paymentId,
              studentFeeAssignmentId: item.assignmentId,
              studentFeeInstallmentId: item.installmentId,
              studentId: assignment.studentId,
              enrollmentId: assignment.enrollmentId,
              schoolId,
              organizationalUnitId: assignment.organizationalUnitId,
              amount: item.amount,
              createdBy: actorId,
              isManual: true,
            },
          });
          if (item.installmentId)
            await tx.studentFeeInstallment.update({
              where: { id: item.installmentId },
              data: { paidAmount: { increment: item.amount } },
            });
          const paidAmount = assignment.paidAmount + item.amount;
          await tx.studentFeeAssignment.update({
            where: { id: assignment.id },
            data: {
              paidAmount,
              status: paidAmount >= assignment.finalAmount ? 'PAID' : 'PARTIALLY_PAID',
            },
          });
          assignment.paidAmount = paidAmount;
        }
        await tx.payment.update({
          where: { id: paymentId },
          data: { unallocatedAmount: computed.unallocatedAmount },
        });
        await audit.log(
          {
            action: AuditAction.PAYMENT_REALLOCATED,
            entityType: 'payment',
            entityId: paymentId,
            schoolId,
            after: {
              allocated: n(payment.unallocatedAmount - computed.unallocatedAmount),
              remaining: n(computed.unallocatedAmount),
            },
          },
          tx,
        );
        return paymentDto(
          await tx.payment.findUniqueOrThrow({ where: { id: paymentId }, include: paymentInclude }),
        );
      });
    },
    async statement(schoolId: string, enrollmentId: string) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const enrollment = await tx.enrollment.findFirst({
          where: { id: enrollmentId, schoolId },
          include: { student: true, class: true, academicYear: true },
        });
        if (!enrollment) throw errors.notFound('Inscription introuvable.');
        const [fees, balanceRows, allocations] = await Promise.all([
          tx.studentFeeAssignment.findMany({
            where: { enrollmentId, schoolId },
            include: {
              feeType: true,
              feeStructure: true,
              installments: { orderBy: { orderIndex: 'asc' } },
            },
            orderBy: { feeType: { priority: 'asc' } },
          }),
          tx.$queryRaw<
            Array<{ total_due: bigint; total_paid: bigint; balance: bigint }>
          >`SELECT total_due, total_paid, balance FROM v_enrollment_balance WHERE enrollment_id = ${enrollmentId}::uuid`,
          tx.paymentAllocation.findMany({
            where: { enrollmentId, schoolId, payment: { status: { in: ['SUCCESS', 'REVERSED'] } } },
            include: { payment: { include: { receipt: true } } },
            orderBy: { createdAt: 'desc' },
          }),
        ]);
        const balance = balanceRows[0] ?? { total_due: 0n, total_paid: 0n, balance: 0n };
        return {
          enrollment: {
            id: enrollment.id,
            studentId: enrollment.studentId,
            studentName: `${enrollment.student.firstName} ${enrollment.student.lastName}`,
            className: enrollment.class?.name ?? null,
            academicYear: enrollment.academicYear.name,
          },
          balance: {
            totalDue: n(balance.total_due),
            totalPaid: n(balance.total_paid),
            balance: n(balance.balance),
          },
          fees: fees.map((item) => ({
            id: item.id,
            name: item.feeStructure.name,
            type: item.feeType.name,
            finalAmount: n(item.finalAmount),
            paidAmount: n(item.paidAmount),
            status: item.status,
            installments: item.installments.map((part) => ({
              name: part.name,
              dueDate: part.dueDate.toISOString().slice(0, 10),
              amount: n(part.amount),
              paidAmount: n(part.paidAmount),
              status: part.status,
            })),
          })),
          payments: allocations.map((item) => ({
            id: item.payment.id,
            reference: item.payment.reference,
            amount: n(item.amount),
            method: item.payment.paymentMethod,
            status: item.payment.status,
            paidAt: item.payment.paidAt?.toISOString() ?? null,
            receiptId: item.payment.receipt?.id ?? null,
          })),
        };
      });
    },
    async receipt(schoolId: string, id: string) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const row = await tx.receipt.findFirst({ where: { id, schoolId } });
        if (!row) throw errors.notFound('Reçu introuvable.');
        return {
          id: row.id,
          receiptNumber: row.receiptNumber,
          paymentId: row.paymentId,
          snapshot: row.snapshot as Record<string, unknown>,
          issuedAt: row.issuedAt.toISOString(),
          cancelledAt: row.cancelledAt?.toISOString() ?? null,
        };
      });
    },
    async receiptPdf(schoolId: string, id: string) {
      const receipt = await this.receipt(schoolId, id);
      return renderReceiptPdf(receipt.snapshot, Boolean(receipt.cancelledAt));
    },
    async reconciliation(schoolId: string) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const differences = await tx.$queryRaw<
          Array<{ enrollment_id: string; cached: bigint; audited: bigint }>
        >`SELECT c.enrollment_id, c.total_paid cached, a.total_paid audited FROM v_enrollment_balance c JOIN v_enrollment_balance_audit a USING (enrollment_id) WHERE c.school_id = ${schoolId}::uuid AND c.total_paid <> a.total_paid`;
        return {
          checkedAt: new Date().toISOString(),
          differences: differences.map((item) => ({
            enrollmentId: item.enrollment_id,
            cached: n(item.cached),
            audited: n(item.audited),
          })),
        };
      });
    },
  };
}

export type PaymentsService = ReturnType<typeof createPaymentsService>;
