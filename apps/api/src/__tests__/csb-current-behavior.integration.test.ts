import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { Storage } from '../platform/storage.js';
import { createAuditService } from '../platform/audit.js';
import { createExportsService } from '../modules/exports/exports.service.js';
import { createPaymentsService } from '../modules/finance/payments.service.js';
import { createReportingService } from '../modules/reporting/reporting.service.js';
import { createStudentsService } from '../modules/students/students.service.js';
import { closeTestDatabase, resetTestData, testDatabase } from './helpers/test-app.js';

let db: PrismaClient;
let schoolId: string;
let userId: string;
let yearId: string;
let primaryClassId: string;
let secondaryClassId: string;
let primaryEnrollmentId: string;
let secondaryEnrollmentId: string;

beforeAll(async () => {
  db = testDatabase();
  await db.$connect();
});

beforeEach(async () => {
  await resetTestData(db);

  const school = await db.school.create({
    data: {
      code: `CSB-BASELINE-${Date.now()}`,
      name: 'CSB — référence avant cloisonnement',
      settings: { create: {} },
    },
  });
  schoolId = school.id;

  const actor = await db.user.create({
    data: {
      firstName: 'Aline',
      lastName: 'Gestionnaire',
      phone: `+23768${String(Date.now()).slice(-7)}`,
      status: 'ACTIVE',
    },
  });
  userId = actor.id;

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

  const [primaryLevel, secondaryLevel] = await Promise.all([
    db.gradeLevel.create({
      data: {
        schoolId,
        name: 'CM2',
        code: 'CM2',
        orderIndex: 1,
        cycle: 'PRIMAIRE',
      },
    }),
    db.gradeLevel.create({
      data: {
        schoolId,
        name: '6e',
        code: '6E',
        orderIndex: 2,
        cycle: 'SECONDAIRE',
      },
    }),
  ]);

  const [primaryClass, secondaryClass] = await Promise.all([
    db.class.create({
      data: {
        schoolId,
        academicYearId: yearId,
        gradeLevelId: primaryLevel.id,
        name: 'CM2 A',
      },
    }),
    db.class.create({
      data: {
        schoolId,
        academicYearId: yearId,
        gradeLevelId: secondaryLevel.id,
        name: '6e A',
      },
    }),
  ]);
  primaryClassId = primaryClass.id;
  secondaryClassId = secondaryClass.id;

  const feeType = await db.feeType.create({
    data: { schoolId, code: 'PENSION', name: 'Pension' },
  });
  const feeStructure = await db.feeStructure.create({
    data: {
      schoolId,
      academicYearId: yearId,
      feeTypeId: feeType.id,
      name: 'Pension annuelle',
      amount: 100_000,
      status: 'ACTIVE',
    },
  });

  const fixtures = [
    {
      number: 'CSB-PRI-001',
      firstName: 'Grâce',
      lastName: 'Primaire',
      classId: primaryClassId,
      paidAmount: 40_000,
    },
    {
      number: 'CSB-SEC-001',
      firstName: 'Marc',
      lastName: 'Secondaire',
      classId: secondaryClassId,
      paidAmount: 60_000,
    },
  ];

  const enrollmentIds: string[] = [];
  for (const fixture of fixtures) {
    const student = await db.student.create({
      data: {
        schoolId,
        studentNumber: fixture.number,
        firstName: fixture.firstName,
        lastName: fixture.lastName,
      },
    });
    const enrollment = await db.enrollment.create({
      data: {
        schoolId,
        studentId: student.id,
        academicYearId: yearId,
        classId: fixture.classId,
        enrollmentDate: new Date('2026-09-01'),
        status: 'ACTIVE',
      },
    });
    enrollmentIds.push(enrollment.id);
    await db.studentFeeAssignment.create({
      data: {
        schoolId,
        enrollmentId: enrollment.id,
        studentId: student.id,
        feeStructureId: feeStructure.id,
        feeTypeId: feeType.id,
        originalAmount: 100_000,
        finalAmount: 100_000,
        paidAmount: fixture.paidAmount,
        status: 'PARTIALLY_PAID',
      },
    });
  }

  const [primaryEnrollment, secondaryEnrollment] = enrollmentIds;
  if (!primaryEnrollment || !secondaryEnrollment) {
    throw new Error('Les inscriptions de référence CSB sont incomplètes.');
  }
  primaryEnrollmentId = primaryEnrollment;
  secondaryEnrollmentId = secondaryEnrollment;
});

afterAll(async () => {
  await closeTestDatabase();
});

describe('CSB-06 — consolidation autorisée et comptabilité cloisonnée', () => {
  it('retourne par défaut les élèves de tous les cycles de l’établissement', async () => {
    const service = createStudentsService(db, createAuditService(db));

    const schoolWide = await service.list(schoolId, { page: 1, page_size: 25 });
    const primaryOnly = await service.list(schoolId, {
      page: 1,
      page_size: 25,
      class_id: primaryClassId,
    });

    expect(schoolWide.meta.total).toBe(2);
    expect(schoolWide.data.map((student) => student.studentNumber).sort()).toEqual([
      'CSB-PRI-001',
      'CSB-SEC-001',
    ]);
    expect(primaryOnly.data.map((student) => student.studentNumber)).toEqual(['CSB-PRI-001']);
  });

  it('consolide les montants de tous les cycles dans les dashboards actuels', async () => {
    const service = createReportingService(db, null, createAuditService(db));

    const dashboard = await service.accountantDashboard(schoolId, yearId);
    const byClass = await service.collection(schoolId, yearId, 'class');
    const byLevel = await service.collection(schoolId, yearId, 'level');

    expect(dashboard).toMatchObject({
      students: 2,
      expected: 200_000,
      collected: 100_000,
      balance: 100_000,
      collectionRate: 50,
    });
    expect(byClass.map((row) => row.name).sort()).toEqual(['6e A', 'CM2 A']);
    expect(byLevel.map((row) => row.name).sort()).toEqual(['6e', 'CM2']);
    expect(byClass.reduce((sum, row) => sum + row.collected, 0)).toBe(dashboard.collected);
  });

  it('inclut tous les cycles dans la recherche et les exports globaux actuels', async () => {
    const audit = createAuditService(db);
    const reports = createReportingService(db, null, audit);
    const exports = createExportsService(db, {} as Storage, audit, reports);

    const search = await reports.search(schoolId, 'CSB-', ['students']);
    const globalExport = await exports.dataset(schoolId, userId, 'STUDENTS_LIST', {
      academic_year_id: yearId,
    });
    const classExport = await exports.dataset(schoolId, userId, 'STUDENTS_BY_CLASS', {
      academic_year_id: yearId,
      class_id: primaryClassId,
    });

    expect(search.students.map((student) => student.subtitle).sort()).toEqual([
      'CSB-PRI-001',
      'CSB-SEC-001',
    ]);
    expect(globalExport.rows).toHaveLength(2);
    expect(classExport.rows).toHaveLength(1);
    expect(classExport.rows[0]).toMatchObject({
      studentNumber: 'CSB-PRI-001',
      className: 'CM2 A',
    });
  });

  it('refuse un paiement unique visant deux cycles différents', async () => {
    const service = createPaymentsService(db, createAuditService(db));
    await expect(
      service.create(schoolId, userId, {
        enrollmentIds: [primaryEnrollmentId, secondaryEnrollmentId],
        amount: 100_000,
        paymentMethod: 'BANK_TRANSFER',
        channel: 'BACKOFFICE',
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
