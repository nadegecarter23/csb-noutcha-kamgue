import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createAuditService } from '../platform/audit.js';
import { createFinanceService } from '../modules/finance/finance.service.js';
import { createPaymentsService } from '../modules/finance/payments.service.js';
import { createCashService } from '../modules/cash/cash.service.js';
import { createParentService } from '../modules/parent/parent.service.js';
import { closeTestDatabase, resetTestData, testDatabase } from './helpers/test-app.js';

let db: PrismaClient;
let schoolId: string;
let cashierId: string;
let parentId: string;
let enrollmentId: string;
let studentId: string;
beforeAll(() => {
  db = testDatabase();
});
afterAll(async () => closeTestDatabase());
beforeEach(async () => {
  await resetTestData(db);
  const school = await db.school.create({
    data: {
      code: `P810-${Date.now()}`,
      name: 'school fees app',
      settings: { create: { allowOverpayment: true } },
    },
  });
  schoolId = school.id;
  cashierId = (
    await db.user.create({
      data: { firstName: 'Alice', lastName: 'Caisse', phone: '+237699000810', status: 'ACTIVE' },
    })
  ).id;
  parentId = (
    await db.user.create({
      data: { firstName: 'Paul', lastName: 'Parent', phone: '+237699000910', status: 'ACTIVE' },
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
  const type = await finance.createFeeType(schoolId, {
    code: 'PENSION',
    name: 'Pension',
    priority: 10,
  });
  const structure = await finance.createStructure(schoolId, {
    academicYearId: year.id,
    feeTypeId: type.id,
    name: 'Pension annuelle',
    amount: 100_000,
    isMandatory: true,
    allowPartialPayment: true,
    allowFullPayment: true,
    allowFreeAmount: true,
    enforceInstallmentOrder: false,
    installments: [
      { name: 'T1', amount: 25_000, dueDate: '2026-09-30', orderIndex: 0 },
      { name: 'T2', amount: 75_000, dueDate: '2027-01-15', orderIndex: 1 },
    ],
    gradeLevelId: null,
    classId: null,
    studentCategoryId: null,
    opensAt: null,
    dueDate: null,
  });
  await finance.setStructureStatus(schoolId, structure.id, 'ACTIVE');
  const student = await db.student.create({
    data: { schoolId, studentNumber: 'CPLAN-810', firstName: 'Nadia', lastName: 'Fotso' },
  });
  studentId = student.id;
  const enrollment = await db.enrollment.create({
    data: {
      schoolId,
      studentId,
      academicYearId: year.id,
      classId: klass.id,
      enrollmentDate: new Date(),
      enrollmentType: 'NEW',
    },
  });
  enrollmentId = enrollment.id;
  await finance.assignFees(schoolId, enrollmentId);
  const guardian = await db.guardian.create({
    data: {
      schoolId,
      userId: parentId,
      firstName: 'Paul',
      lastName: 'Parent',
      phone: '+237699000910',
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
      canReceiveNotifications: true,
    },
  });
});

describe('phases 8 à 10', () => {
  it('impose une session, alloue, déduplique et rapproche la caisse', async () => {
    const audit = createAuditService(db);
    const payments = createPaymentsService(db, audit);
    const cash = createCashService(db, audit, payments);
    await expect(
      cash.collect(schoolId, cashierId, 'key-without-session', {
        enrollmentId,
        amount: 40_000,
        paymentMethod: 'CASH',
        confirmOverpayment: false,
      }),
    ).rejects.toThrow('session de caisse');
    const opened = await cash.open(schoolId, cashierId, { openingFloat: 10_000 });
    await expect(cash.open(schoolId, cashierId, { openingFloat: 0 })).rejects.toThrow('déjà');
    const preview = await cash.simulate(schoolId, enrollmentId, 40_000);
    expect(preview.allocations.map((a) => a.amount)).toEqual([25_000, 15_000]);
    const first = await cash.collect(schoolId, cashierId, 'cash-idempotency-810', {
      enrollmentId,
      amount: 40_000,
      paymentMethod: 'CASH',
      confirmOverpayment: false,
    });
    const repeated = await cash.collect(schoolId, cashierId, 'cash-idempotency-810', {
      enrollmentId,
      amount: 40_000,
      paymentMethod: 'CASH',
      confirmOverpayment: false,
    });
    expect(repeated.id).toBe(first.id);
    expect(await db.payment.count({ where: { cashSessionId: opened.id } })).toBe(1);
    await expect(
      cash.close(schoolId, cashierId, opened.id, {
        declaredAmounts: { CASH: 49_000, BANK_TRANSFER: 0, BANK_DEPOSIT: 0, CHEQUE: 0, OTHER: 0 },
      }),
    ).rejects.toThrow('motif');
    const closed = await cash.close(schoolId, cashierId, opened.id, {
      declaredAmounts: { CASH: 50_000, BANK_TRANSFER: 0, BANK_DEPOSIT: 0, CHEQUE: 0, OTHER: 0 },
    });
    expect(closed.variance).toBe(0);
    expect((await cash.reconcile(schoolId, cashierId, opened.id)).status).toBe('RECONCILED');
  });
  it('agrège le tableau parent sans exposer le payeur et notifie', async () => {
    const audit = createAuditService(db);
    const payments = createPaymentsService(db, audit);
    const cash = createCashService(db, audit, payments);
    const parent = createParentService(db, payments);
    await cash.open(schoolId, cashierId, { openingFloat: 0 });
    const payment = await cash.collect(schoolId, cashierId, 'cash-parent-810', {
      enrollmentId,
      amount: 30_000,
      paymentMethod: 'CASH',
      confirmOverpayment: false,
    });
    const dashboard = await parent.dashboard(parentId);
    expect(dashboard.children[0]?.balance?.balance).toBe(70_000);
    expect(dashboard.recentPayments[0]).not.toHaveProperty('payerName');
    expect(dashboard.unreadNotifications).toBe(1);
    expect((await parent.listPayments(parentId, studentId))[0]?.payerLabel).toBe('Payeur autorisé');
    const receiptId = payment.receiptId as string;
    expect((await parent.receiptPdf(parentId, receiptId)).byteLength).toBeGreaterThan(500);
    await expect(parent.child(cashierId, studentId)).rejects.toThrow('introuvable');
    const device = await parent.registerDevice(parentId, {
      pushToken: 'ExponentPushToken[phase810]',
      platform: 'ANDROID',
      deviceLabel: 'Téléphone test',
    });
    expect((await parent.devices(parentId))[0]?.id).toBe(device.id);
    await parent.revokeDevice(parentId, device.id);
    expect((await parent.devices(parentId))[0]?.status).toBe('REVOKED');
  });
});
