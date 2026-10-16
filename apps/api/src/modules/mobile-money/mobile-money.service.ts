/* eslint-disable @typescript-eslint/no-non-null-assertion -- Prisma ne raffine pas les champs nullable après un filtre `not: null`. */
import { createHash } from 'node:crypto';
import { Prisma, type PaymentStatus } from '@prisma/client';
import type { InitiateMobileMoneyBody, MobileMoneyProviderCode } from '@cplan/contracts';
import type { Database } from '../../platform/db.js';
import type { AuditService } from '../../platform/audit.js';
import { AuditAction } from '../../platform/audit.js';
import { errors } from '../../platform/errors.js';
import { withPlatformScope, withSchoolScope } from '../../platform/school-scope.js';
import type { PaymentsService } from '../finance/payments.service.js';
import type { PaymentProviderRegistry } from './providers/registry.js';
import type { ProviderPaymentResult } from './providers/payment-provider.js';

const number = (value: bigint | null | undefined) => Number(value ?? 0n);
type PaymentResponse = {
  id: string;
  reference: string;
  provider: MobileMoneyProviderCode;
  providerReference: string | null;
  amount: number;
  status: PaymentStatus;
  statusReason: string | null;
  receiptId: string | null;
  balanceAfter: number | null;
  confirmedNoDebit: boolean;
  uncertain: boolean;
  trackingAbandonedAt: string | null;
};

export function createMobileMoneyService(
  db: Database,
  audit: AuditService,
  payments: PaymentsService,
  providers: PaymentProviderRegistry,
  webhookBaseUrl: string,
) {
  async function response(paymentId: string, userId?: string): Promise<PaymentResponse> {
    return withPlatformScope(db, async (tx) => {
      const row = await tx.payment.findUnique({
        where: { id: paymentId },
        include: { receipt: true, targets: true },
      });
      if (!row || (userId && row.payerUserId !== userId))
        throw errors.notFound('Paiement introuvable.');
      const enrollmentId = row.targets[0]?.enrollmentId;
      const balances = enrollmentId
        ? await tx.$queryRaw<
            Array<{ balance: bigint }>
          >`SELECT balance FROM v_enrollment_balance WHERE enrollment_id = ${enrollmentId}::uuid`
        : [];
      return {
        id: row.id,
        reference: row.reference,
        provider: row.provider as MobileMoneyProviderCode,
        providerReference: row.providerReference,
        amount: number(row.amount),
        status: row.status,
        statusReason: row.statusReason,
        receiptId: row.receipt?.id ?? null,
        balanceAfter: balances[0] ? number(balances[0].balance) : null,
        confirmedNoDebit: row.status === 'FAILED',
        uncertain: ['PROCESSING', 'PENDING_INVESTIGATION'].includes(row.status),
        trackingAbandonedAt: row.trackingAbandonedAt?.toISOString() ?? null,
      };
    });
  }

  async function notify(paymentId: string, type: string, title: string, body: string) {
    await withPlatformScope(db, async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        include: { receipt: true },
      });
      if (payment?.payerUserId)
        await tx.notification.create({
          data: {
            userId: payment.payerUserId,
            schoolId: payment.schoolId,
            type,
            title,
            body,
            data: { paymentId, receiptId: payment.receipt?.id ?? null },
          },
        });
    });
  }

  async function investigate(paymentId: string, reason: string) {
    const changed = await withPlatformScope(db, async (tx) => {
      await tx.$queryRaw`SELECT id FROM payments WHERE id = ${paymentId}::uuid FOR UPDATE`;
      const row = await tx.payment.findUnique({ where: { id: paymentId } });
      if (!row || ['SUCCESS', 'FAILED'].includes(row.status)) return false;
      await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: 'PENDING_INVESTIGATION',
          statusReason: reason,
          investigationAt: new Date(),
          providerStatusCheckedAt: new Date(),
        },
      });
      await audit.log(
        {
          action: AuditAction.PAYMENT_INVESTIGATION,
          entityType: 'payment',
          entityId: paymentId,
          schoolId: row.schoolId,
          after: { reason },
        },
        tx,
      );
      return true;
    });
    if (changed)
      await notify(
        paymentId,
        'PAYMENT_INVESTIGATION',
        'Paiement en vérification',
        'Le statut opérateur reste incertain. Aucun échec ni débit n’est affirmé pendant la vérification.',
      );
  }

  async function applyProviderResult(paymentId: string, result: ProviderPaymentResult) {
    const row = await withPlatformScope(db, (tx) =>
      tx.payment.findUnique({ where: { id: paymentId }, include: { targets: true } }),
    );
    if (!row) throw errors.notFound('Paiement introuvable.');
    if (row.status === 'SUCCESS' || row.status === 'FAILED') return response(paymentId);
    const operatorAmount = result.amount;
    if (operatorAmount !== undefined && operatorAmount !== number(row.amount)) {
      await withPlatformScope(db, (tx) =>
        tx.mobileMoneyReconciliation.create({
          data: {
            schoolId: row.schoolId,
            paymentId,
            provider: row.provider ?? 'UNKNOWN',
            providerReference: result.providerReference,
            status: 'AMOUNT_MISMATCH',
            operatorAmount: BigInt(operatorAmount),
            localAmount: row.amount,
            details: { source: 'provider_status' },
          },
        }),
      );
      await investigate(paymentId, 'AMOUNT_MISMATCH');
      return response(paymentId);
    }
    if (result.status === 'SUCCESS') {
      await withPlatformScope(db, (tx) =>
        tx.payment.update({
          where: { id: paymentId },
          data: {
            ...(result.financialId ? { providerFinancialId: result.financialId } : {}),
            providerStatusCheckedAt: new Date(),
          },
        }),
      );
      await payments.markSuccess(
        row.schoolId,
        row.payerUserId ?? row.createdBy ?? row.id,
        paymentId,
        row.targets.map((target) => target.enrollmentId),
      );
      await notify(
        paymentId,
        'PAYMENT_SUCCESS',
        'Paiement confirmé',
        `Votre paiement de ${number(row.amount).toLocaleString('fr-FR')} FCFA est confirmé.`,
      );
    } else if (result.status === 'FAILED' && result.confirmedNoDebit) {
      await payments.markFailed(row.schoolId, paymentId, result.reason ?? 'OPERATOR_REJECTED');
      await notify(
        paymentId,
        'PAYMENT_FAILED',
        'Paiement non abouti',
        'L’opérateur confirme que le paiement n’a pas été débité.',
      );
    } else if (result.status === 'UNKNOWN')
      await investigate(paymentId, result.reason ?? 'PROVIDER_STATUS_UNKNOWN');
    else
      await withPlatformScope(db, (tx) =>
        tx.payment.update({
          where: { id: paymentId },
          data: { providerStatusCheckedAt: new Date() },
        }),
      );
    return response(paymentId);
  }

  return {
    async simulate(userId: string, enrollmentId: string, amount: number) {
      return withPlatformScope(db, async (tx) => {
        const link = await tx.studentGuardian.findFirst({
          where: {
            status: 'ACCEPTED',
            canViewFinances: true,
            guardian: { userId, status: 'ACTIVE' },
            student: {
              enrollments: {
                some: { id: enrollmentId, status: 'ACTIVE', academicYear: { isCurrent: true } },
              },
            },
          },
        });
        if (!link) throw errors.notFound('Inscription introuvable.');
        const rows = await tx.$queryRaw<
          Array<{ balance: bigint }>
        >`SELECT balance FROM v_enrollment_balance WHERE enrollment_id = ${enrollmentId}::uuid`;
        const balance = number(rows[0]?.balance);
        const allocated = Math.min(amount, balance);
        return {
          amount,
          balanceBefore: balance,
          allocated,
          unallocated: amount - allocated,
          balanceAfter: Math.max(0, balance - allocated),
        };
      });
    },
    async initiate(userId: string, key: string, input: InitiateMobileMoneyBody) {
      const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
      const previous = await withPlatformScope(db, (tx) =>
        tx.idempotencyKey.findUnique({ where: { key } }),
      );
      if (previous) {
        if (previous.userId !== userId || previous.requestHash !== hash)
          throw errors.conflict(
            'Cette clé d’idempotence est déjà utilisée pour une autre requête.',
          );
        if (previous.responseBody) return previous.responseBody as unknown as PaymentResponse;
        throw errors.conflict('Ce paiement est déjà en cours de traitement.');
      }
      await withPlatformScope(db, (tx) =>
        tx.idempotencyKey.create({
          data: {
            key,
            userId,
            endpoint: '/parent/payments',
            requestHash: hash,
            expiresAt: new Date(Date.now() + 86_400_000),
          },
        }),
      );
      try {
        const context = await withPlatformScope(db, async (tx) => {
          const link = await tx.studentGuardian.findFirst({
            where: {
              studentId: input.studentId,
              status: 'ACCEPTED',
              canPay: true,
              canViewFinances: true,
              guardian: { userId, status: 'ACTIVE' },
            },
          });
          const enrollment = await tx.enrollment.findFirst({
            where: {
              id: input.enrollmentId,
              studentId: input.studentId,
              status: 'ACTIVE',
              academicYear: { isCurrent: true, status: 'ACTIVE' },
            },
          });
          if (!link || !enrollment)
            throw errors.notFound('Élève ou inscription payable introuvable.');
          const existing = await tx.payment.findFirst({
            where: {
              payerUserId: userId,
              status: { in: ['PROCESSING', 'PENDING_INVESTIGATION'] },
              targets: { some: { studentId: input.studentId } },
            },
          });
          if (existing)
            throw errors.conflict('Un paiement Mobile Money est déjà en cours pour cet élève.');
          const rows = await tx.$queryRaw<
            Array<{ balance: bigint }>
          >`SELECT balance FROM v_enrollment_balance WHERE enrollment_id = ${input.enrollmentId}::uuid`;
          const debt = number(rows[0]?.balance);
          if (debt <= 0)
            throw errors.validation('Cette inscription ne présente aucun solde à payer.');
          const settings = await tx.schoolSettings.findUnique({
            where: { schoolId: enrollment.schoolId },
          });
          if (input.amount > debt && !settings?.allowOverpayment)
            throw errors.validation('Le montant dépasse le solde restant.');
          return { schoolId: enrollment.schoolId };
        });
        const created = await payments.create(context.schoolId, userId, {
          enrollmentIds: [input.enrollmentId],
          amount: input.amount,
          paymentMethod: 'MOBILE_MONEY',
          provider: input.provider,
          payerUserId: userId,
          payerPhone: input.payerPhone,
          channel: 'PARENT_APP',
        });
        const provider = providers.get(input.provider);
        let providerResult: ProviderPaymentResult;
        try {
          providerResult = await provider.initiate({
            paymentId: created.id,
            reference: created.reference,
            amount: input.amount,
            currency: 'XAF',
            payerPhone: input.payerPhone,
            callbackUrl: `${webhookBaseUrl}/${input.provider === 'ORANGE_MONEY' ? 'orange-money' : 'mtn-momo'}`,
          });
        } catch {
          await investigate(created.id, 'PROVIDER_UNAVAILABLE');
          const uncertain = await response(created.id, userId);
          await withPlatformScope(db, (tx) =>
            tx.idempotencyKey.update({
              where: { key },
              data: { responseStatus: 201, responseBody: uncertain as Prisma.InputJsonValue },
            }),
          );
          return uncertain;
        }
        await withSchoolScope(db, context.schoolId, (tx) =>
          tx.payment.update({
            where: { id: created.id },
            data: {
              status: 'PROCESSING',
              providerReference: providerResult.providerReference,
              ...(providerResult.financialId
                ? { providerFinancialId: providerResult.financialId }
                : {}),
            },
          }),
        );
        const result =
          providerResult.status === 'PENDING'
            ? await response(created.id, userId)
            : await applyProviderResult(created.id, providerResult);
        await withPlatformScope(db, (tx) =>
          tx.idempotencyKey.update({
            where: { key },
            data: { responseStatus: 201, responseBody: result as Prisma.InputJsonValue },
          }),
        );
        return result;
      } catch (error) {
        await withPlatformScope(db, (tx) =>
          tx.idempotencyKey.deleteMany({ where: { key, responseBody: { equals: Prisma.DbNull } } }),
        ).catch(() => undefined);
        throw error;
      }
    },
    async status(userId: string, paymentId: string) {
      const current = await response(paymentId, userId);
      if (
        !['PROCESSING', 'PENDING_INVESTIGATION'].includes(current.status) ||
        !current.providerReference
      )
        return current;
      const provider = providers.get(current.provider);
      try {
        return await applyProviderResult(
          paymentId,
          await provider.getStatus(current.providerReference),
        );
      } catch {
        return current;
      }
    },
    async abandon(userId: string, paymentId: string) {
      await withPlatformScope(db, async (tx) => {
        const result = await tx.payment.updateMany({
          where: {
            id: paymentId,
            payerUserId: userId,
            status: { in: ['PROCESSING', 'PENDING_INVESTIGATION'] },
          },
          data: { trackingAbandonedAt: new Date() },
        });
        if (!result.count) throw errors.notFound('Paiement en cours introuvable.');
      });
      return response(paymentId, userId);
    },
    async webhook(
      code: MobileMoneyProviderCode,
      rawBody: string,
      headers: Record<string, string | undefined>,
    ) {
      const provider = providers.get(code);
      let parsed;
      try {
        parsed = provider.parseWebhook(rawBody, headers);
      } catch {
        return { accepted: true };
      }
      let eventId: string | null = null;
      try {
        const raw = JSON.parse(rawBody) as Prisma.InputJsonValue;
        const event = await withPlatformScope(db, (tx) =>
          tx.paymentProviderEvent.create({
            data: {
              provider: code,
              eventId: parsed.eventId,
              rawPayload: raw,
              headers: headers as Prisma.InputJsonValue,
              amount: parsed.amount === undefined ? null : BigInt(parsed.amount),
            },
          }),
        );
        eventId = event.id;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
          return { accepted: true, duplicate: true };
        return { accepted: true };
      }
      if (!eventId) return { accepted: true };
      const valid = provider.verifyWebhook(rawBody, headers);
      if (!valid) {
        await withPlatformScope(db, (tx) =>
          tx.paymentProviderEvent.update({
            where: { id: eventId },
            data: { status: 'INVALID_SIGNATURE', signatureValid: false, processedAt: new Date() },
          }),
        );
        return { accepted: true };
      }
      const identifiers: Prisma.PaymentWhereInput[] = [
        ...(parsed.paymentId ? [{ id: parsed.paymentId }] : []),
        ...(parsed.providerReference ? [{ providerReference: parsed.providerReference }] : []),
      ];
      const payment = identifiers.length
        ? await withPlatformScope(db, (tx) =>
            tx.payment.findFirst({ where: { provider: code, OR: identifiers } }),
          )
        : null;
      if (!payment) {
        await withPlatformScope(db, (tx) =>
          tx.paymentProviderEvent.update({
            where: { id: eventId },
            data: { status: 'ORPHAN', signatureValid: true, processedAt: new Date() },
          }),
        );
        return { accepted: true };
      }
      let verified: ProviderPaymentResult;
      try {
        verified = payment.providerReference
          ? await provider.getStatus(payment.providerReference)
          : { ...parsed, providerReference: parsed.providerReference ?? payment.id };
      } catch {
        verified = {
          ...parsed,
          providerReference: parsed.providerReference ?? payment.id,
          status: 'UNKNOWN',
        };
      }
      const result = await applyProviderResult(payment.id, verified);
      await withPlatformScope(db, (tx) =>
        tx.paymentProviderEvent.update({
          where: { id: eventId },
          data: {
            schoolId: payment.schoolId,
            paymentId: payment.id,
            signatureValid: true,
            status:
              result.status === 'PENDING_INVESTIGATION' && parsed.amount !== number(payment.amount)
                ? 'AMOUNT_MISMATCH'
                : 'PROCESSED',
            processedAt: new Date(),
          },
        }),
      );
      return { accepted: true };
    },
    async forceCheck(paymentId: string) {
      const current = await response(paymentId);
      if (!current.providerReference) return current;
      return applyProviderResult(
        paymentId,
        await providers.get(current.provider).getStatus(current.providerReference),
      );
    },
    async pollPending() {
      const cutoff = new Date(Date.now() - 60_000);
      const stale = new Date(Date.now() - 30 * 60_000);
      const rows = await withPlatformScope(db, (tx) =>
        tx.payment.findMany({
          where: {
            paymentMethod: 'MOBILE_MONEY',
            status: 'PROCESSING',
            initiatedAt: { lt: cutoff },
            providerReference: { not: null },
          },
          select: { id: true, provider: true, providerReference: true, initiatedAt: true },
        }),
      );
      for (const row of rows) {
        const reference = row.providerReference;
        if (!reference) continue;
        try {
          const result = await providers
            .get(row.provider as MobileMoneyProviderCode)
            .getStatus(reference);
          if (result.status === 'PENDING' && row.initiatedAt < stale)
            await investigate(row.id, 'PROVIDER_TIMEOUT_30_MINUTES');
          else await applyProviderResult(row.id, result);
        } catch {
          if (row.initiatedAt < stale) await investigate(row.id, 'PROVIDER_UNAVAILABLE_30_MINUTES');
        }
      }
      return { checked: rows.length };
    },
    async pendingInvestigations(schoolId: string) {
      return withSchoolScope(db, schoolId, async (tx) =>
        (
          await tx.payment.findMany({
            where: { schoolId, status: 'PENDING_INVESTIGATION' },
            include: { targets: { include: { student: true } } },
            orderBy: { investigationAt: 'asc' },
          })
        ).map((p) => ({
          id: p.id,
          reference: p.reference,
          provider: p.provider,
          providerReference: p.providerReference,
          amount: number(p.amount),
          status: p.status,
          statusReason: p.statusReason,
          studentName: p.targets[0]
            ? `${p.targets[0].student.firstName} ${p.targets[0].student.lastName}`
            : null,
          investigationAt: p.investigationAt?.toISOString() ?? null,
        })),
      );
    },
    async events(schoolId: string) {
      return withSchoolScope(db, schoolId, async (tx) =>
        (
          await tx.paymentProviderEvent.findMany({
            where: { OR: [{ schoolId }, { schoolId: null }] },
            orderBy: { receivedAt: 'desc' },
            take: 200,
          })
        ).map((e) => ({
          id: e.id,
          provider: e.provider,
          eventId: e.eventId,
          paymentId: e.paymentId,
          status: e.status,
          signatureValid: e.signatureValid,
          amount: e.amount === null ? null : number(e.amount),
          reason: e.reason,
          receivedAt: e.receivedAt.toISOString(),
          processedAt: e.processedAt?.toISOString() ?? null,
        })),
      );
    },
    async reconcile(schoolId: string) {
      const from = new Date(Date.now() - 86_400_000);
      const to = new Date();
      let detected = 0;
      for (const [code, provider] of providers.entries()) {
        if (!provider.listTransactions) continue;
        const operator = await provider.listTransactions(from, to);
        const local = await withSchoolScope(db, schoolId, (tx) =>
          tx.payment.findMany({
            where: { schoolId, provider: code, initiatedAt: { gte: from, lte: to } },
          }),
        );
        const byRef = new Map(
          local.filter((p) => p.providerReference).map((p) => [p.providerReference!, p]),
        );
        for (const remote of operator) {
          const row = byRef.get(remote.providerReference);
          const status = !row
            ? 'OPERATOR_ONLY'
            : number(row.amount) !== remote.amount
              ? 'AMOUNT_MISMATCH'
              : 'MATCHED';
          if (status !== 'MATCHED') {
            await withSchoolScope(db, schoolId, (tx) =>
              tx.mobileMoneyReconciliation.create({
                data: {
                  schoolId,
                  paymentId: row?.id ?? null,
                  provider: code,
                  providerReference: remote.providerReference,
                  status,
                  operatorAmount: BigInt(remote.amount),
                  localAmount: row?.amount ?? null,
                  details: { remoteStatus: remote.status },
                },
              }),
            );
            detected++;
          }
          byRef.delete(remote.providerReference);
        }
        for (const row of byRef.values()) {
          await withSchoolScope(db, schoolId, (tx) =>
            tx.mobileMoneyReconciliation.create({
              data: {
                schoolId,
                paymentId: row.id,
                provider: code,
                providerReference: row.providerReference,
                status: 'LOCAL_ONLY',
                localAmount: row.amount,
              },
            }),
          );
          detected++;
        }
      }
      return { checkedAt: to.toISOString(), anomalies: detected };
    },
  };
}
export type MobileMoneyService = ReturnType<typeof createMobileMoneyService>;
