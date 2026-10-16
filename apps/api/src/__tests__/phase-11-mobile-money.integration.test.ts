/* eslint-disable @typescript-eslint/no-non-null-assertion -- le fournisseur factice garantit une référence après initiation. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createAuditService } from '../platform/audit.js';
import { createFinanceService } from '../modules/finance/finance.service.js';
import { createPaymentsService } from '../modules/finance/payments.service.js';
import { createPaymentProviderRegistry } from '../modules/mobile-money/providers/registry.js';
import { createMobileMoneyService } from '../modules/mobile-money/mobile-money.service.js';
import { closeTestDatabase, resetTestData, testConfig, testDatabase } from './helpers/test-app.js';

let db: PrismaClient;
let schoolId: string;
let parentId: string;
let studentId: string;
let enrollmentId: string;
beforeAll(() => {
  db = testDatabase();
});
afterAll(async () => closeTestDatabase());
beforeEach(async () => {
  await resetTestData(db);
  const school = await db.school.create({
    data: {
      code: `P11-${Date.now()}`,
      name: 'École Mobile Money',
      settings: { create: { allowOverpayment: false } },
    },
  });
  schoolId = school.id;
  parentId = (
    await db.user.create({
      data: { firstName: 'Parent', lastName: 'Payeur', phone: '+237699111111', status: 'ACTIVE' },
    })
  ).id;
  const year = await db.academicYear.create({
    data: {
      schoolId,
      name: '2026/2027',
      startDate: new Date('2026-09-01'),
      endDate: new Date('2027-07-01'),
      status: 'ACTIVE',
      isCurrent: true,
    },
  });
  const level = await db.gradeLevel.create({
    data: { schoolId, name: '6e', code: '6E', orderIndex: 1 },
  });
  const klass = await db.class.create({
    data: { schoolId, academicYearId: year.id, gradeLevelId: level.id, name: '6e A' },
  });
  const audit = createAuditService(db);
  const finance = createFinanceService(db, audit);
  const feeType = await finance.createFeeType(schoolId, {
    code: 'PENSION',
    name: 'Pension',
    priority: 1,
  });
  const structure = await finance.createStructure(schoolId, {
    academicYearId: year.id,
    feeTypeId: feeType.id,
    name: 'Pension',
    amount: 100000,
    isMandatory: true,
    allowPartialPayment: true,
    allowFullPayment: true,
    allowFreeAmount: true,
    enforceInstallmentOrder: false,
    installments: [],
    gradeLevelId: null,
    classId: null,
    studentCategoryId: null,
    opensAt: null,
    dueDate: null,
  });
  await finance.setStructureStatus(schoolId, structure.id, 'ACTIVE');
  const student = await db.student.create({
    data: { schoolId, studentNumber: 'P11-001', firstName: 'Amina', lastName: 'Test' },
  });
  studentId = student.id;
  const enrollment = await db.enrollment.create({
    data: {
      schoolId,
      studentId,
      academicYearId: year.id,
      classId: klass.id,
      enrollmentDate: new Date(),
      status: 'ACTIVE',
    },
  });
  enrollmentId = enrollment.id;
  await finance.assignFees(schoolId, enrollmentId);
  const guardian = await db.guardian.create({
    data: {
      schoolId,
      userId: parentId,
      firstName: 'Parent',
      lastName: 'Payeur',
      phone: '+237699111111',
    },
  });
  await db.studentGuardian.create({
    data: {
      studentId,
      guardianId: guardian.id,
      relationship: 'PERE',
      status: 'ACCEPTED',
      acceptedAt: new Date(),
      canViewFinances: true,
      canPay: true,
      canReceiveNotifications: true,
    },
  });
});
function subject() {
  const audit = createAuditService(db);
  const payments = createPaymentsService(db, audit);
  const registry = createPaymentProviderRegistry(testConfig());
  return {
    service: createMobileMoneyService(db, audit, payments, registry, 'http://localhost/webhooks'),
    registry,
  };
}
const input = (phone = '+237699111111') => ({
  studentId,
  enrollmentId,
  amount: 25000,
  provider: 'MTN_MOMO' as const,
  payerPhone: phone,
});

describe('phase 11 — Mobile Money', () => {
  it('simule, initie une seule fois et bloque un second paiement concurrent', async () => {
    const { service } = subject();
    expect((await service.simulate(parentId, enrollmentId, 25000)).balanceAfter).toBe(75000);
    const first = await service.initiate(parentId, 'phase11-idem-0001', input());
    const replay = await service.initiate(parentId, 'phase11-idem-0001', input());
    expect(replay.id).toBe(first.id);
    await expect(service.initiate(parentId, 'phase11-idem-0002', input())).rejects.toThrow(
      'déjà en cours',
    );
    expect(await db.payment.count()).toBe(1);
  });
  it('ne crédite jamais un webhook non signé et déduplique les événements', async () => {
    const { service, registry } = subject();
    const payment = await service.initiate(parentId, 'phase11-webhook-1', input());
    registry.fake.settle(payment.providerReference!, 'SUCCESS');
    const invalid = JSON.stringify({
      eventId: 'event-11-invalid',
      paymentId: payment.id,
      providerReference: payment.providerReference,
      status: 'SUCCESS',
      amount: 25000,
    });
    await service.webhook('MTN_MOMO', invalid, { 'x-cplan-signature': 'invalid' });
    expect((await db.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe(
      'PROCESSING',
    );
    const raw = JSON.stringify({
      eventId: 'event-11-1',
      paymentId: payment.id,
      providerReference: payment.providerReference,
      status: 'SUCCESS',
      amount: 25000,
    });
    const signature = registry.fake.sign(raw);
    for (let attempt = 0; attempt < 10; attempt++)
      await service.webhook('MTN_MOMO', raw, { 'x-cplan-signature': signature });
    expect(
      (
        await db.payment.findUniqueOrThrow({
          where: { id: payment.id },
          include: { allocations: true },
        })
      ).allocations,
    ).toHaveLength(1);
    expect(await db.paymentProviderEvent.count({ where: { eventId: 'event-11-1' } })).toBe(1);
  });
  it('place un écart de montant en investigation sans reçu', async () => {
    const { service, registry } = subject();
    const payment = await service.initiate(parentId, 'phase11-mismatch', input());
    registry.fake.settle(payment.providerReference!, 'SUCCESS', 24000);
    const checked = await service.forceCheck(payment.id);
    expect(checked.status).toBe('PENDING_INVESTIGATION');
    expect(checked.receiptId).toBeNull();
    expect(
      await db.mobileMoneyReconciliation.count({
        where: { paymentId: payment.id, status: 'AMOUNT_MISMATCH' },
      }),
    ).toBe(1);
  });
  it('distingue rejet confirmé et indisponibilité incertaine', async () => {
    const rejected = subject();
    const failed = await rejected.service.initiate(
      parentId,
      'phase11-failed',
      input('+237699111000'),
    );
    expect(failed.status).toBe('FAILED');
    expect(failed.confirmedNoDebit).toBe(true);
    const unavailable = subject();
    const uncertain = await unavailable.service.initiate(
      parentId,
      'phase11-timeout',
      input('+237699111002'),
    );
    expect(uncertain.status).toBe('PENDING_INVESTIGATION');
    expect(uncertain.uncertain).toBe(true);
    expect(uncertain.confirmedNoDebit).toBe(false);
  });
  it('continue à traiter un succès tardif après abandon du suivi', async () => {
    const { service, registry } = subject();
    const payment = await service.initiate(parentId, 'phase11-late', input());
    await service.abandon(parentId, payment.id);
    registry.fake.settle(payment.providerReference!, 'SUCCESS');
    const success = await service.forceCheck(payment.id);
    expect(success.status).toBe('SUCCESS');
    expect(success.receiptId).toBeTruthy();
    expect(
      await db.notification.count({ where: { userId: parentId, type: 'PAYMENT_SUCCESS' } }),
    ).toBe(1);
  });
  it('rapproche sans corriger automatiquement une anomalie locale', async () => {
    const { service } = subject();
    const payment = await service.initiate(parentId, 'phase11-reconcile', input());
    await db.payment.update({ where: { id: payment.id }, data: { amount: 26000n } });
    const result = await service.reconcile(schoolId);
    expect(result.anomalies).toBeGreaterThan(0);
    expect((await db.payment.findUniqueOrThrow({ where: { id: payment.id } })).amount).toBe(26000n);
  });
});
