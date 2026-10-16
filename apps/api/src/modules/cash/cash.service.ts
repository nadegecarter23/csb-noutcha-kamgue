import { createHash } from 'node:crypto';
import {
  Prisma,
  type PaymentChannel,
  type PaymentMethod,
  type PaymentStatus,
} from '@prisma/client';
import { computeAllocations, type AllocationTarget } from '@cplan/domain';
import type { CashPaymentBody } from '@cplan/contracts';
import type { Database } from '../../platform/db.js';
import type { AuditService } from '../../platform/audit.js';
import { AuditAction } from '../../platform/audit.js';
import { errors } from '../../platform/errors.js';
import { withSchoolScope } from '../../platform/school-scope.js';
import type { PaymentsService } from '../finance/payments.service.js';

const methods = ['CASH', 'BANK_TRANSFER', 'BANK_DEPOSIT', 'CHEQUE', 'OTHER'] as const;
type Tender = Record<(typeof methods)[number], number>;
const emptyTender = (): Tender => ({
  CASH: 0,
  BANK_TRANSFER: 0,
  BANK_DEPOSIT: 0,
  CHEQUE: 0,
  OTHER: 0,
});
const num = (value: bigint | null | undefined) => Number(value ?? 0n);

const paymentDto = (row: {
  id: string;
  reference: string;
  amount: bigint;
  paymentMethod: PaymentMethod;
  provider: string | null;
  providerReference: string | null;
  status: PaymentStatus;
  statusReason: string | null;
  channel: PaymentChannel;
  unallocatedAmount: bigint;
  paidAt: Date | null;
  receipt: { id: string; receiptNumber: string } | null;
  allocations: Array<{ student: { firstName: string; lastName: string } }>;
}) => ({
  id: row.id,
  reference: row.reference,
  amount: num(row.amount),
  paymentMethod: row.paymentMethod,
  provider: row.provider,
  providerReference: row.providerReference,
  status: row.status,
  statusReason: row.statusReason,
  channel: row.channel,
  unallocatedAmount: num(row.unallocatedAmount),
  paidAt: row.paidAt?.toISOString() ?? null,
  studentNames: [
    ...new Set(row.allocations.map((a) => `${a.student.firstName} ${a.student.lastName}`)),
  ],
  receiptId: row.receipt?.id ?? null,
  receiptNumber: row.receipt?.receiptNumber ?? null,
});

const includeSession = {
  cashier: true,
  movements: { orderBy: { createdAt: 'asc' as const } },
  payments: {
    include: { receipt: true, allocations: { include: { student: true } } },
    orderBy: { paidAt: 'desc' as const },
  },
} satisfies Prisma.CashSessionInclude;
type CashSessionRow = Prisma.CashSessionGetPayload<{ include: typeof includeSession }>;
type PaymentResult = ReturnType<typeof paymentDto>;
function sessionDto(row: CashSessionRow) {
  const successful = row.payments.filter((p) => p.status === 'SUCCESS');
  return {
    id: row.id,
    cashierUserId: row.cashierUserId,
    cashierName: `${row.cashier.firstName} ${row.cashier.lastName}`,
    status: row.status,
    openingFloat: num(row.openingFloat),
    openedAt: row.openedAt.toISOString(),
    closedAt: row.closedAt?.toISOString() ?? null,
    expectedAmounts: row.expectedAmounts as Tender | null,
    declaredAmounts: row.declaredAmounts as Tender | null,
    variance: row.variance === null ? null : num(row.variance),
    varianceReason: row.varianceReason,
    paymentCount: successful.length,
    collectedTotal: successful.reduce((sum, p) => sum + num(p.amount), 0),
    recentPayments: successful.slice(0, 10).map(paymentDto),
  };
}

export function createCashService(db: Database, audit: AuditService, payments: PaymentsService) {
  return {
    async registers(schoolId: string) {
      return withSchoolScope(db, schoolId, async (tx) =>
        (
          await tx.cashRegister.findMany({
            where: { schoolId, status: 'ACTIVE' },
            include: { organizationalUnit: { select: { name: true } } },
            orderBy: { code: 'asc' },
          })
        ).map((x) => ({
          id: x.id,
          organizationalUnitId: x.organizationalUnitId,
          unitName: x.organizationalUnit.name,
          code: x.code,
          name: x.name,
          status: x.status,
        })),
      );
    },
    async dashboard(schoolId: string) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const units = await tx.organizationalUnit.findMany({
          where: { schoolId, status: 'ACTIVE' },
          orderBy: { orderIndex: 'asc' },
        });
        const [collections, expenses, sessions] = await Promise.all([
          tx.paymentAllocation.groupBy({
            by: ['organizationalUnitId'],
            where: {
              schoolId,
              payment: { status: 'SUCCESS' },
              organizationalUnitId: { not: null },
            },
            _sum: { amount: true },
          }),
          tx.expense.groupBy({
            by: ['organizationalUnitId'],
            where: {
              schoolId,
              status: { in: ['APPROVED', 'PARTIALLY_PAID', 'PAID'] },
              organizationalUnitId: { not: null },
            },
            _sum: { amount: true },
          }),
          tx.cashSession.groupBy({
            by: ['organizationalUnitId'],
            where: { schoolId, status: 'OPEN', organizationalUnitId: { not: null } },
            _count: { _all: true },
          }),
        ]);
        const collected = new Map(
          collections.map((x) => [x.organizationalUnitId, Number(x._sum.amount ?? 0n)]),
        );
        const spent = new Map(
          expenses.map((x) => [x.organizationalUnitId, Number(x._sum.amount ?? 0n)]),
        );
        const opened = new Map(sessions.map((x) => [x.organizationalUnitId, x._count._all]));
        const rows = units.map((x) => {
          const income = collected.get(x.id) ?? 0;
          const expense = spent.get(x.id) ?? 0;
          return {
            organizationalUnitId: x.id,
            unitName: x.name,
            collected: income,
            expenses: expense,
            net: income - expense,
            openCashSessions: opened.get(x.id) ?? 0,
          };
        });
        return {
          totalCollected: rows.reduce((s, x) => s + x.collected, 0),
          totalExpenses: rows.reduce((s, x) => s + x.expenses, 0),
          net: rows.reduce((s, x) => s + x.net, 0),
          units: rows,
        };
      });
    },
    async open(
      schoolId: string,
      actorId: string,
      input: {
        openingFloat: number;
        cashRegisterId?: string | undefined;
        notes?: string | undefined;
      },
    ) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const existing = await tx.cashSession.findFirst({
          where: { schoolId, cashierUserId: actorId, status: 'OPEN' },
        });
        if (existing) throw errors.conflict('Vous avez déjà une session de caisse ouverte.');
        try {
          const register = input.cashRegisterId
            ? await tx.cashRegister.findFirst({
                where: { id: input.cashRegisterId, schoolId, status: 'ACTIVE' },
              })
            : await tx.cashRegister.findFirst({
                where: { schoolId, status: 'ACTIVE' },
                orderBy: { code: 'asc' },
              });
          if (!register) throw errors.conflict('Aucune caisse active n’est accessible.');
          const row = await tx.cashSession.create({
            data: {
              schoolId,
              organizationalUnitId: register.organizationalUnitId,
              cashRegisterId: register.id,
              cashierUserId: actorId,
              openingFloat: BigInt(input.openingFloat),
              notes: input.notes ?? null,
              ...(input.openingFloat
                ? {
                    movements: {
                      create: {
                        schoolId,
                        type: 'OPENING_FLOAT' as const,
                        amount: BigInt(input.openingFloat),
                        createdBy: actorId,
                      },
                    },
                  }
                : {}),
            },
            include: includeSession,
          });
          await audit.log(
            {
              action: AuditAction.CASH_SESSION_OPENED,
              entityType: 'cash_session',
              entityId: row.id,
              schoolId,
              after: { openingFloat: input.openingFloat },
            },
            tx,
          );
          return sessionDto(row);
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
            throw errors.conflict('Vous avez déjà une session de caisse ouverte.');
          throw error;
        }
      });
    },
    async current(schoolId: string, actorId: string) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const row = await tx.cashSession.findFirst({
          where: { schoolId, cashierUserId: actorId, status: 'OPEN' },
          include: includeSession,
        });
        return row ? sessionDto(row) : null;
      });
    },
    async list(schoolId: string) {
      return withSchoolScope(db, schoolId, async (tx) =>
        (
          await tx.cashSession.findMany({
            where: { schoolId },
            include: includeSession,
            orderBy: { openedAt: 'desc' },
            take: 100,
          })
        ).map(sessionDto),
      );
    },
    async get(schoolId: string, actorId: string, id: string, canReadAll: boolean) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const row = await tx.cashSession.findFirst({
          where: { id, schoolId, ...(canReadAll ? {} : { cashierUserId: actorId }) },
          include: includeSession,
        });
        if (!row) throw errors.notFound('Session introuvable.');
        return sessionDto(row);
      });
    },
    async close(
      schoolId: string,
      actorId: string,
      id: string,
      input: { declaredAmounts: Tender; varianceReason?: string | undefined },
    ) {
      return withSchoolScope(db, schoolId, async (tx) => {
        await tx.$queryRaw`SELECT id FROM cash_sessions WHERE id = ${id}::uuid AND school_id = ${schoolId}::uuid FOR UPDATE`;
        const row = await tx.cashSession.findFirst({
          where: { id, schoolId, cashierUserId: actorId, status: 'OPEN' },
          include: includeSession,
        });
        if (!row) throw errors.notFound('Session de caisse ouverte introuvable.');
        const expected = emptyTender();
        expected.CASH = num(row.openingFloat);
        for (const payment of row.payments.filter((p) => p.status === 'SUCCESS'))
          if (methods.includes(payment.paymentMethod as keyof Tender))
            expected[payment.paymentMethod as keyof Tender] += num(payment.amount);
        for (const movement of row.movements) {
          if (movement.type === 'CASH_IN') expected.CASH += num(movement.amount);
          if (movement.type === 'CASH_OUT') expected.CASH -= num(movement.amount);
        }
        const declaredTotal = methods.reduce(
          (sum, method) => sum + input.declaredAmounts[method],
          0,
        );
        const expectedTotal = methods.reduce((sum, method) => sum + expected[method], 0);
        const variance = declaredTotal - expectedTotal;
        if (variance !== 0 && !input.varianceReason?.trim())
          throw errors.validation('Le motif de l’écart de caisse est obligatoire.');
        const updated = await tx.cashSession.update({
          where: { id },
          data: {
            status: 'CLOSED',
            closedAt: new Date(),
            expectedAmounts: expected,
            declaredAmounts: input.declaredAmounts,
            variance: BigInt(variance),
            varianceReason: input.varianceReason ?? null,
          },
          include: includeSession,
        });
        await audit.log(
          {
            action: AuditAction.CASH_SESSION_CLOSED,
            entityType: 'cash_session',
            entityId: id,
            schoolId,
            after: { expected, declared: input.declaredAmounts, variance },
          },
          tx,
        );
        return sessionDto(updated);
      });
    },
    async reconcile(schoolId: string, actorId: string, id: string) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const row = await tx.cashSession.findFirst({ where: { id, schoolId, status: 'CLOSED' } });
        if (!row) throw errors.notFound('Session clôturée introuvable.');
        const updated = await tx.cashSession.update({
          where: { id },
          data: { status: 'RECONCILED', reconciledAt: new Date(), reconciledBy: actorId },
          include: includeSession,
        });
        await audit.log(
          {
            action: AuditAction.CASH_SESSION_RECONCILED,
            entityType: 'cash_session',
            entityId: id,
            schoolId,
          },
          tx,
        );
        return sessionDto(updated);
      });
    },
    async quickSearch(schoolId: string, q: string) {
      const term = q.trim();
      if (term.length < 2) return [];
      return withSchoolScope(db, schoolId, async (tx) => {
        const students = await tx.student.findMany({
          where: {
            schoolId,
            status: 'ACTIVE',
            OR: [
              { firstName: { contains: term, mode: 'insensitive' } },
              { lastName: { contains: term, mode: 'insensitive' } },
              { studentNumber: { contains: term, mode: 'insensitive' } },
              { guardianLinks: { some: { guardian: { phone: { contains: term } } } } },
            ],
          },
          include: {
            guardianLinks: { include: { guardian: true } },
            enrollments: {
              where: { academicYear: { isCurrent: true } },
              include: { class: true },
              take: 1,
            },
          },
          take: 12,
        });
        const ids = students.flatMap((s) => s.enrollments.map((e) => e.id));
        const balances = ids.length
          ? await tx.$queryRaw<
              Array<{
                enrollment_id: string;
                total_due: bigint;
                total_paid: bigint;
                balance: bigint;
              }>
            >`SELECT enrollment_id,total_due,total_paid,balance FROM v_enrollment_balance WHERE enrollment_id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})`
          : [];
        const byId = new Map(balances.map((b) => [b.enrollment_id, b]));
        return students.flatMap((s) =>
          s.enrollments.map((e) => {
            const b = byId.get(e.id);
            return {
              studentId: s.id,
              enrollmentId: e.id,
              studentNumber: s.studentNumber,
              fullName: `${s.firstName} ${s.lastName}`,
              className: e.class?.name ?? null,
              guardianPhones: s.guardianLinks.map((g) => g.guardian.phone),
              balance: {
                totalDue: num(b?.total_due),
                totalPaid: num(b?.total_paid),
                balance: num(b?.balance),
              },
            };
          }),
        );
      });
    },
    async simulate(schoolId: string, enrollmentId: string, amount: number) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const assignments = await tx.studentFeeAssignment.findMany({
          where: { schoolId, enrollmentId, status: { notIn: ['CANCELLED', 'WAIVED', 'PAID'] } },
          include: {
            feeType: true,
            feeStructure: true,
            installments: { orderBy: { orderIndex: 'asc' } },
          },
        });
        if (
          !assignments.length &&
          !(await tx.enrollment.count({ where: { id: enrollmentId, schoolId } }))
        )
          throw errors.notFound('Inscription introuvable.');
        const targets: AllocationTarget[] = assignments.flatMap((a): AllocationTarget[] =>
          a.installments.length
            ? a.installments.map((i, index) => ({
                assignmentId: a.id,
                installmentId: i.id,
                remainingAmount: i.amount - i.paidAmount,
                priority: a.feeType.priority,
                dueDate: i.dueDate.toISOString().slice(0, 10),
                name: `${a.feeStructure.name} ${i.name}`,
                allowPartialPayment: a.feeStructure.allowPartialPayment,
                enforceInstallmentOrder: a.feeStructure.enforceInstallmentOrder,
                priorInstallmentOpen: a.installments
                  .slice(0, index)
                  .some((p) => p.paidAmount < p.amount),
                opensAt: a.feeStructure.opensAt?.toISOString().slice(0, 10) ?? null,
              }))
            : [
                {
                  assignmentId: a.id,
                  installmentId: null,
                  remainingAmount: a.finalAmount - a.paidAmount,
                  priority: a.feeType.priority,
                  dueDate: a.feeStructure.dueDate?.toISOString().slice(0, 10) ?? null,
                  name: a.feeStructure.name,
                  allowPartialPayment: a.feeStructure.allowPartialPayment,
                  enforceInstallmentOrder: false,
                  priorInstallmentOpen: false,
                  opensAt: a.feeStructure.opensAt?.toISOString().slice(0, 10) ?? null,
                },
              ],
        );
        const result = computeAllocations(BigInt(amount), targets);
        return {
          allocations: result.allocations.map((a) => ({
            studentFeeAssignmentId: a.assignmentId,
            studentFeeInstallmentId: a.installmentId,
            label:
              targets.find(
                (t) => t.assignmentId === a.assignmentId && t.installmentId === a.installmentId,
              )?.name ?? 'Frais scolaire',
            amount: num(a.amount),
          })),
          unallocatedAmount: num(result.unallocatedAmount),
        };
      });
    },
    async collect(
      schoolId: string,
      actorId: string,
      key: string,
      input: CashPaymentBody,
    ): Promise<PaymentResult> {
      const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
      const previous = await withSchoolScope(db, schoolId, (tx) =>
        tx.idempotencyKey.findUnique({ where: { key } }),
      );
      if (previous) {
        if (previous.userId !== actorId || previous.requestHash !== hash)
          throw errors.conflict(
            'Cette clé d’idempotence a déjà été utilisée avec une autre requête.',
          );
        if (previous.responseBody) return previous.responseBody as unknown as PaymentResult;
        throw errors.conflict('Ce paiement est déjà en cours de traitement.');
      }
      await withSchoolScope(db, schoolId, (tx) =>
        tx.idempotencyKey.create({
          data: {
            key,
            userId: actorId,
            endpoint: '/payments/cash',
            requestHash: hash,
            expiresAt: new Date(Date.now() + 86_400_000),
          },
        }),
      );
      try {
        const check = await withSchoolScope(db, schoolId, async (tx) => {
          const session = await tx.cashSession.findFirst({
            where: { schoolId, cashierUserId: actorId, status: 'OPEN' },
          });
          if (!session) throw errors.conflict('Ouvrez une session de caisse avant d’encaisser.');
          if (input.paidAt && new Date(input.paidAt) > new Date())
            throw errors.validation('La date de paiement ne peut pas être future.');
          const [balance] = await tx.$queryRaw<
            Array<{ balance: bigint }>
          >`SELECT balance FROM v_enrollment_balance WHERE enrollment_id = ${input.enrollmentId}::uuid AND school_id = ${schoolId}::uuid`;
          if (!balance) throw errors.notFound('Inscription introuvable.');
          const settings = await tx.schoolSettings.findUnique({ where: { schoolId } });
          if (
            input.amount > num(balance.balance) &&
            (!settings?.allowOverpayment || !input.confirmOverpayment)
          )
            throw errors.validation(
              'Ce montant dépasse le solde. Confirmez explicitement le trop-perçu.',
            );
          return session;
        });
        const created = await payments.create(schoolId, actorId, {
          enrollmentIds: [input.enrollmentId],
          amount: input.amount,
          paymentMethod: input.paymentMethod,
          externalReference: input.externalReference,
          channel: 'CASHIER',
          cashSessionId: check.id,
          note: input.note,
          paidAt: input.paidAt ? new Date(input.paidAt) : null,
        });
        const result = await payments.markSuccess(
          schoolId,
          actorId,
          created.id,
          [input.enrollmentId],
          input.allocations,
        );
        await withSchoolScope(db, schoolId, async (tx) => {
          await tx.cashSessionMovement.create({
            data: {
              schoolId,
              sessionId: check.id,
              paymentId: created.id,
              type: 'PAYMENT',
              amount: BigInt(input.amount),
              note: input.note ?? null,
              createdBy: actorId,
            },
          });
          const links = await tx.studentGuardian.findMany({
            where: {
              student: { enrollments: { some: { id: input.enrollmentId } } },
              status: 'ACCEPTED',
              canReceiveNotifications: true,
              guardian: { userId: { not: null } },
            },
            select: { guardian: { select: { userId: true } } },
          });
          const userIds = [
            ...new Set(links.flatMap((l) => (l.guardian.userId ? [l.guardian.userId] : []))),
          ];
          if (userIds.length)
            await tx.notification.createMany({
              data: userIds.map((userId) => ({
                userId,
                schoolId,
                type: 'PAYMENT_RECEIVED',
                title: 'Paiement enregistré',
                body: `Un paiement de ${input.amount.toLocaleString('fr-FR')} FCFA a été enregistré.`,
                data: { paymentId: result.id, receiptId: result.receiptId },
              })),
            });
          await tx.idempotencyKey.update({
            where: { key },
            data: { responseStatus: 201, responseBody: result as Prisma.InputJsonValue },
          });
        });
        return result;
      } catch (error) {
        await withSchoolScope(db, schoolId, (tx) =>
          tx.idempotencyKey.deleteMany({ where: { key, responseBody: { equals: Prisma.DbNull } } }),
        ).catch(() => undefined);
        throw error;
      }
    },
  };
}
export type CashService = ReturnType<typeof createCashService>;
