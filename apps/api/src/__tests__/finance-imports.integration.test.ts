import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createAuditService } from '../platform/audit.js';
import { createFinanceService } from '../modules/finance/finance.service.js';
import { createPaymentsService } from '../modules/finance/payments.service.js';
import { createImportsService } from '../modules/imports/imports.service.js';
import { closeTestDatabase, resetTestData, testDatabase } from './helpers/test-app.js';

let db: PrismaClient;
let schoolId: string;
let yearId: string;
let classId: string;
let actorId: string;

beforeAll(() => {
  db = testDatabase();
});
beforeEach(async () => {
  await resetTestData(db);
  const school = await db.school.create({
    data: {
      code: `P57-${Date.now()}`,
      name: 'school fees app',
      settings: { create: { discountApprovalThreshold: 20_000 } },
    },
  });
  schoolId = school.id;
  const year = await db.academicYear.create({
    data: {
      schoolId,
      name: '2026/2027',
      startDate: new Date('2026-09-01'),
      endDate: new Date('2027-07-31'),
      status: 'ACTIVE',
      isCurrent: true,
    },
  });
  yearId = year.id;
  const level = await db.gradeLevel.create({
    data: { schoolId, name: '6e', code: '6E', orderIndex: 0 },
  });
  classId = (
    await db.class.create({
      data: { schoolId, academicYearId: yearId, gradeLevelId: level.id, name: '6e A' },
    })
  ).id;
  actorId = (
    await db.user.create({
      data: { firstName: 'Marie', lastName: 'Comptable', phone: '+237699123123', status: 'ACTIVE' },
    })
  ).id;
});
afterAll(async () => closeTestDatabase());

async function configuredEnrollment() {
  const audit = createAuditService(db);
  const finance = createFinanceService(db, audit);
  const registration = await finance.createFeeType(schoolId, {
    code: 'INSCRIPTION',
    name: 'Inscription',
    priority: 10,
  });
  const tuition = await finance.createFeeType(schoolId, {
    code: 'PENSION',
    name: 'Pension',
    priority: 20,
  });
  const registrationStructure = await finance.createStructure(schoolId, {
    academicYearId: yearId,
    feeTypeId: registration.id,
    name: 'Inscription annuelle',
    amount: 25_000,
    isMandatory: true,
    allowPartialPayment: false,
    allowFullPayment: true,
    allowFreeAmount: false,
    enforceInstallmentOrder: false,
    installments: [],
    gradeLevelId: null,
    classId: null,
    studentCategoryId: null,
    opensAt: null,
    dueDate: '2026-09-30',
  });
  const tuitionStructure = await finance.createStructure(schoolId, {
    academicYearId: yearId,
    feeTypeId: tuition.id,
    name: 'Pension 6e',
    amount: 175_000,
    isMandatory: true,
    allowPartialPayment: true,
    allowFullPayment: true,
    allowFreeAmount: true,
    enforceInstallmentOrder: false,
    installments: [
      { name: 'T1', amount: 75_000, dueDate: '2026-09-30', orderIndex: 0 },
      { name: 'T2', amount: 60_000, dueDate: '2027-01-15', orderIndex: 1 },
      { name: 'T3', amount: 40_000, dueDate: '2027-03-31', orderIndex: 2 },
    ],
    gradeLevelId: null,
    classId: null,
    studentCategoryId: null,
    opensAt: null,
    dueDate: null,
  });
  await finance.setStructureStatus(schoolId, registrationStructure.id, 'ACTIVE');
  await finance.setStructureStatus(schoolId, tuitionStructure.id, 'ACTIVE');
  const student = await db.student.create({
    data: {
      schoolId,
      studentNumber: `CPLAN-${Date.now()}`,
      firstName: 'Nathan',
      lastName: 'Fotso',
      gender: 'M',
    },
  });
  const enrollment = await db.enrollment.create({
    data: {
      schoolId,
      studentId: student.id,
      academicYearId: yearId,
      classId,
      enrollmentDate: new Date(),
      enrollmentType: 'NEW',
    },
  });
  await finance.assignFees(schoolId, enrollment.id);
  return { audit, finance, student, enrollment };
}

describe('phases 5 à 7', () => {
  it('fige la dette, applique une remise au prorata et conserve une somme exacte', async () => {
    const { finance, enrollment } = await configuredEnrollment();
    const fees = await finance.enrollmentFees(schoolId, enrollment.id);
    expect(fees.map((item) => item.originalAmount).sort((a, b) => a - b)).toEqual([
      25_000, 175_000,
    ]);
    const pension = fees.find((item) => item.feeTypeName === 'Pension');
    if (!pension) throw new Error('Pension absente.');
    await finance.createDiscount(schoolId, actorId, {
      studentFeeAssignmentId: pension.id,
      type: 'FIXED_AMOUNT',
      value: 20_000,
      reason: 'Bourse scolaire',
      category: 'BOURSE',
    });
    const discounted = (await finance.enrollmentFees(schoolId, enrollment.id)).find(
      (item) => item.id === pension.id,
    );
    expect(discounted?.finalAmount).toBe(155_000);
    expect(discounted?.installments.reduce((sum, item) => sum + item.amount, 0)).toBe(155_000);
    expect(discounted?.installments.map((item) => item.amount)).toEqual([66_429, 53_143, 35_428]);
  });

  it('impose un second valideur pour une remise au-dessus du seuil', async () => {
    const { finance, enrollment } = await configuredEnrollment();
    const pension = (await finance.enrollmentFees(schoolId, enrollment.id)).find(
      (item) => item.feeTypeName === 'Pension',
    );
    if (!pension) throw new Error('Pension absente.');
    const discount = await finance.createDiscount(schoolId, actorId, {
      studentFeeAssignmentId: pension.id,
      type: 'FIXED_AMOUNT',
      value: 30_000,
      reason: 'Remise exceptionnelle',
      category: 'BOURSE',
    });
    expect(discount.status).toBe('PENDING_APPROVAL');
    await expect(finance.decideDiscount(schoolId, actorId, discount.id, true)).rejects.toThrow(
      /ne peut pas l’approuver/,
    );
    const approverId = (
      await db.user.create({
        data: {
          firstName: 'Paul',
          lastName: 'Direction',
          phone: '+237699123124',
          status: 'ACTIVE',
        },
      })
    ).id;
    await finance.decideDiscount(schoolId, approverId, discount.id, true);
    const fees = await finance.enrollmentFees(schoolId, enrollment.id);
    expect(fees.find((item) => item.id === pension.id)?.finalAmount).toBe(145_000);
    await expect(finance.decideDiscount(schoolId, approverId, discount.id, false)).rejects.toThrow(
      /n’attend pas de décision/,
    );
  });

  it('alloue 100 000 en priorité, rapproche les vues, produit un reçu puis contrepassse', async () => {
    const { audit, finance, enrollment } = await configuredEnrollment();
    const payments = createPaymentsService(db, audit);
    expect((await finance.balance(schoolId, enrollment.id)).balance).toBe(200_000);
    const payment = await payments.create(schoolId, actorId, {
      enrollmentIds: [enrollment.id],
      amount: 100_000,
      paymentMethod: 'CASH',
      channel: 'BACKOFFICE',
    });
    const success = await payments.markSuccess(schoolId, actorId, payment.id, [enrollment.id]);
    expect(success.status).toBe('SUCCESS');
    expect(
      (await payments.get(schoolId, payment.id)).allocations
        .map((item) => item.amount)
        .sort((a, b) => a - b),
    ).toEqual([25_000, 75_000]);
    expect((await finance.balance(schoolId, enrollment.id)).balance).toBe(100_000);
    expect((await payments.reconciliation(schoolId)).differences).toEqual([]);
    if (!success.receiptId) throw new Error('Reçu absent.');
    expect((await payments.receiptPdf(schoolId, success.receiptId)).byteLength).toBeGreaterThan(
      500,
    );
    await payments.reverse(schoolId, actorId, payment.id, 'Erreur de saisie caisse');
    expect((await finance.balance(schoolId, enrollment.id)).balance).toBe(200_000);
    expect((await payments.receipt(schoolId, success.receiptId)).cancelledAt).not.toBeNull();
  });

  it('valide et reprend un import en dédupliquant le responsable par téléphone', async () => {
    const audit = createAuditService(db);
    const imports = createImportsService(db, audit);
    const rows = [1, 2].map((index) => ({
      lastName: `Élève ${index}`,
      firstName: 'Importé',
      gender: index === 1 ? 'M' : 'F',
      className: '6e A',
      guardian1FirstName: 'Jean',
      guardian1LastName: 'Fotso',
      guardian1Phone: '+237699888777',
      guardian1Relationship: 'PERE',
    }));
    const batch = await imports.create(schoolId, actorId, yearId, rows);
    const validated = await imports.validate(schoolId, actorId, batch.id);
    expect(validated.validRows).toBe(2);
    const completed = await imports.execute(schoolId, actorId, batch.id);
    expect(completed.importedRows).toBe(2);
    expect(await db.guardian.count({ where: { schoolId, phone: '+237699888777' } })).toBe(1);
    expect(
      await db.studentGuardian.count({
        where: { guardian: { schoolId, phone: '+237699888777' }, status: 'PENDING' },
      }),
    ).toBe(2);
  });
});
