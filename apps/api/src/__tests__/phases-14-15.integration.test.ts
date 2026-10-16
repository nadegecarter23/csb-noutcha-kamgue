import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createAuditService } from '../platform/audit.js';
import { createReportingService } from '../modules/reporting/reporting.service.js';
import { closeTestDatabase, resetTestData, testDatabase } from './helpers/test-app.js';

const db = testDatabase();
let schoolId: string;
let userId: string;
let yearId: string;
let classId: string;
beforeAll(async () => {
  await db.$connect();
});
afterAll(closeTestDatabase);
beforeEach(async () => {
  await resetTestData(db);
  const school = await db.school.create({
    data: { code: `P1415-${Date.now()}`, name: 'Collège Reporting', settings: { create: {} } },
  });
  schoolId = school.id;
  const user = await db.user.create({
    data: {
      firstName: 'Marie',
      lastName: 'Ngo',
      phone: `+23769${String(Date.now()).slice(-7)}`,
      status: 'ACTIVE',
    },
  });
  userId = user.id;
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
  yearId = year.id;
  const level = await db.gradeLevel.create({
    data: { schoolId, name: '6e', code: '6E', orderIndex: 1 },
  });
  const klass = await db.class.create({
    data: { schoolId, academicYearId: year.id, gradeLevelId: level.id, name: '6e A' },
  });
  classId = klass.id;
  const feeType = await db.feeType.create({ data: { schoolId, code: 'PENSION', name: 'Pension' } });
  const structure = await db.feeStructure.create({
    data: {
      schoolId,
      academicYearId: year.id,
      feeTypeId: feeType.id,
      name: 'Pension',
      amount: 100000,
      status: 'ACTIVE',
    },
  });
  for (const [index, paid] of [100000, 0].entries()) {
    const student = await db.student.create({
      data: {
        schoolId,
        studentNumber: `R-${index + 1}`,
        firstName: index ? 'Marc' : 'Sarah',
        lastName: index ? 'Belinga' : 'Ngo',
      },
    });
    const enrollment = await db.enrollment.create({
      data: {
        schoolId,
        studentId: student.id,
        academicYearId: year.id,
        classId: klass.id,
        enrollmentDate: new Date(),
        status: 'ACTIVE',
      },
    });
    const assignment = await db.studentFeeAssignment.create({
      data: {
        schoolId,
        enrollmentId: enrollment.id,
        studentId: student.id,
        feeStructureId: structure.id,
        feeTypeId: feeType.id,
        originalAmount: 100000,
        finalAmount: 100000,
        paidAmount: paid,
        status: paid ? 'PAID' : 'PENDING',
      },
    });
    await db.studentFeeInstallment.create({
      data: {
        studentFeeAssignmentId: assignment.id,
        name: 'Tranche 1',
        amount: 100000,
        paidAmount: paid,
        dueDate: new Date('2020-01-01'),
        orderIndex: 0,
        status: paid ? 'PAID' : 'OVERDUE',
      },
    });
  }
});
const subject = () => createReportingService(db, null, createAuditService(db));
describe('phases 14 et 15 — reporting cohérent', () => {
  it('produit les mêmes totaux au dashboard et par classe', async () => {
    const service = subject();
    const dashboard = await service.accountantDashboard(schoolId, yearId);
    const classes = await service.collection(schoolId, yearId, 'class');
    expect(dashboard).toMatchObject({
      students: 2,
      expected: 200000,
      collected: 100000,
      balance: 100000,
      collectionRate: 50,
    });
    expect(classes.reduce((sum, row) => sum + row.collected, 0)).toBe(dashboard.collected);
  });
  it('applique une définition unique des situations de paiement', async () => {
    const result = await subject().classPaymentStatus(schoolId, classId);
    expect(result.data.map((row) => row.situation).sort()).toEqual(['ON_TRACK', 'OVERDUE']);
    expect(result.totals).toMatchObject({
      students: 2,
      expected: 200000,
      collected: 100000,
      balance: 100000,
    });
  });
  it('enregistre une requête favorite et recherche une référence opérateur', async () => {
    const service = subject();
    await service.saveQuery(schoolId, userId, {
      name: 'Impayés importants',
      criteria: { min_amount: 50000 },
    });
    expect(await service.savedQueries(schoolId, userId)).toHaveLength(1);
    await db.payment.create({
      data: {
        schoolId,
        reference: 'CPL-SEARCH-1',
        amount: 10000,
        paymentMethod: 'MOBILE_MONEY',
        provider: 'MTN_MOMO',
        providerReference: 'MOMO-ABC-123',
        status: 'SUCCESS',
        channel: 'BACKOFFICE',
        paidAt: new Date(),
      },
    });
    const result = await service.search(schoolId, 'ABC-123', ['payments']);
    expect(result.payments[0]?.subtitle).toBe('MOMO-ABC-123');
  });
});
