import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createAuditService } from '../platform/audit.js';
import { createLogger } from '../platform/logger.js';
import type { Storage } from '../platform/storage.js';
import { createFinanceService } from '../modules/finance/finance.service.js';
import { createPaymentsService } from '../modules/finance/payments.service.js';
import { createNotificationsService } from '../modules/notifications/notifications.service.js';
import { createExternalPaymentsService } from '../modules/external-payments/external-payments.service.js';
import {
  closeTestDatabase,
  MemorySmsProvider,
  resetTestData,
  testConfig,
  testDatabase,
} from './helpers/test-app.js';

let db: PrismaClient;
let schoolId: string;
let parentId: string;
let accountantId: string;
let enrollmentId: string;
const objects = new Map<string, Uint8Array>();
const storage: Storage = {
  bucket: 'test',
  async putObject(input) {
    objects.set(input.key, typeof input.body === 'string' ? Buffer.from(input.body) : input.body);
  },
  async getDownloadUrl(key) {
    return `https://private.test/${key}?expires=300`;
  },
  async getUploadUrl({ key }) {
    return `https://upload.test/${key}`;
  },
  async deleteObject(key) {
    objects.delete(key);
  },
  async ping() {},
};
beforeAll(() => {
  db = testDatabase();
});
afterAll(async () => closeTestDatabase());
beforeEach(async () => {
  objects.clear();
  await resetTestData(db);
  const school = await db.school.create({
    data: {
      code: `P1213-${Date.now()}`,
      name: 'École Notifications',
      settings: {
        create: {
          allowOverpayment: false,
          smsEnabled: true,
          smsAllowedTypes: ['EXTERNAL_PAYMENT_VALIDATED', 'EXTERNAL_PAYMENT_REJECTED'],
        },
      },
    },
  });
  schoolId = school.id;
  parentId = (
    await db.user.create({
      data: { firstName: 'Parent', lastName: 'Test', phone: '+237699121300', status: 'ACTIVE' },
    })
  ).id;
  accountantId = (
    await db.user.create({
      data: { firstName: 'Comptable', lastName: 'Test', phone: '+237699121301', status: 'ACTIVE' },
    })
  ).id;
  const year = await db.academicYear.create({
    data: {
      schoolId,
      name: '2026',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
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
    data: { schoolId, studentNumber: 'P12-001', firstName: 'Amina', lastName: 'Test' },
  });
  const enrollment = await db.enrollment.create({
    data: {
      schoolId,
      studentId: student.id,
      academicYearId: year.id,
      classId: klass.id,
      enrollmentDate: new Date('2026-01-02'),
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
      lastName: 'Test',
      phone: '+237699121300',
    },
  });
  await db.studentGuardian.create({
    data: {
      studentId: student.id,
      guardianId: guardian.id,
      relationship: 'MERE',
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
  const notifications = createNotificationsService(
    db,
    new MemorySmsProvider(),
    createLogger(testConfig()),
  );
  return {
    notifications,
    external: createExternalPaymentsService(db, audit, payments, storage, notifications),
  };
}
describe('phases 12 et 13', () => {
  it('conserve la preuve privée sans crédit puis valide via le noyau financier', async () => {
    const { external } = subject();
    const declared = await external.declare(
      parentId,
      {
        enrollmentId,
        amount: 25000,
        paymentMethod: 'BANK_TRANSFER',
        bankName: 'Afriland',
        paymentDate: '2026-08-20',
        externalReference: 'VIR-1213',
      },
      [{ filename: 'preuve.jpg', mimeType: 'image/jpeg', body: Buffer.from('preuve') }],
    );
    expect((await db.payment.findUniqueOrThrow({ where: { id: declared.paymentId } })).status).toBe(
      'AWAITING_VALIDATION',
    );
    expect(await db.paymentAllocation.count({ where: { paymentId: declared.paymentId } })).toBe(0);
    expect((await external.parentProof(parentId, declared.paymentId)).proofs[0]?.url).toContain(
      'expires=300',
    );
    await external.validate(schoolId, accountantId, declared.id, { creditedAmount: 24000 });
    const payment = await db.payment.findUniqueOrThrow({
      where: { id: declared.paymentId },
      include: { allocations: true, receipt: true, externalDeclaration: true },
    });
    expect(payment.status).toBe('SUCCESS');
    expect(payment.amount).toBe(24000n);
    expect(payment.allocations).toHaveLength(1);
    expect(payment.receipt).toBeTruthy();
    expect(payment.externalDeclaration?.status).toBe('VALIDATED');
  });
  it('applique préférences, canaux persistants et retries observables', async () => {
    const { notifications } = subject();
    await notifications.registerDevice(parentId, {
      token: 'ExponentPushToken[test-1213]',
      platform: 'ANDROID',
      app_version: '1.0.0',
    });
    await notifications.updatePreferences(parentId, { emailEnabled: false });
    await notifications.emit({
      schoolId,
      userIds: [parentId],
      type: 'EXTERNAL_PAYMENT_REJECTED',
      variables: { reference: 'VIR-X', reason: 'Pièce illisible' },
      data: { screen: 'external-payment' },
      critical: true,
    });
    expect(await db.notification.count({ where: { userId: parentId } })).toBe(1);
    expect(
      await db.notificationDelivery.count({
        where: { channel: { in: ['IN_APP', 'PUSH', 'SMS'] } },
      }),
    ).toBe(3);
    await notifications.processPending();
    expect(await db.notificationDelivery.count({ where: { status: 'DELIVERED' } })).toBe(3);
  });
});
