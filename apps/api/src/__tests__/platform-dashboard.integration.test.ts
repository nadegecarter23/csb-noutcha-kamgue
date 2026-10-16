import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { PERMISSIONS } from '@cplan/contracts';
import { hashPassword } from '../platform/crypto.js';
import {
  buildTestApp,
  closeTestDatabase,
  resetTestData,
  testDatabase,
  type TestApp,
} from './helpers/test-app.js';

const PASSWORD = 'MotDePasseTest1';
let app: TestApp;
let db: PrismaClient;
let superToken: string;
let schoolToken: string;

async function createAccount(input: {
  roleCode: string;
  email: string;
  phone: string;
  schoolId: string | null;
  permissions: string[];
}) {
  const role = await db.role.create({
    data: {
      code: `${input.roleCode}-${Date.now()}-${Math.random()}`,
      name: input.roleCode,
      isSystem: true,
      schoolId: null,
    },
  });
  for (const code of input.permissions) {
    const definition = PERMISSIONS.find((permission) => permission.code === code);
    if (!definition) throw new Error(`Permission inconnue : ${code}`);
    const permission = await db.permission.upsert({
      where: { code },
      update: {},
      create: {
        code,
        description: definition.description,
        group: definition.group,
      },
    });
    await db.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
  }
  const user = await db.user.create({
    data: {
      firstName: 'Compte',
      lastName: input.roleCode,
      phone: input.phone,
      email: input.email,
      passwordHash: await hashPassword(PASSWORD),
      status: 'ACTIVE',
      phoneVerifiedAt: new Date(),
    },
  });
  await db.userRole.create({
    data: { userId: user.id, roleId: role.id, schoolId: input.schoolId },
  });
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { identifier: input.email, password: PASSWORD },
  });
  expect(response.statusCode).toBe(200);
  return response.json().tokens.accessToken as string;
}

beforeAll(async () => {
  db = testDatabase();
  app = await buildTestApp({ db });
  await app.ready();
});

beforeEach(async () => {
  await resetTestData(db);
  const first = await db.school.create({ data: { code: 'PLAT-A', name: 'École Active A' } });
  await db.school.create({
    data: { code: 'PLAT-B', name: 'École Suspendue B', status: 'SUSPENDED' },
  });
  const student = await db.student.create({
    data: {
      schoolId: first.id,
      studentNumber: 'PLAT-001',
      firstName: 'Élève',
      lastName: 'Actif',
      status: 'ACTIVE',
    },
  });
  const year = await db.academicYear.create({
    data: {
      schoolId: first.id,
      name: '2026/2027',
      startDate: new Date('2026-09-01'),
      endDate: new Date('2027-07-31'),
      status: 'ACTIVE',
      isCurrent: true,
    },
  });
  const unit = await db.organizationalUnit.findUniqueOrThrow({
    where: { schoolId_code: { schoolId: first.id, code: 'CRECHE' } },
  });
  const section = await db.languageSection.findUniqueOrThrow({
    where: {
      organizationalUnitId_code: {
        organizationalUnitId: unit.id,
        code: 'FRANCOPHONE',
      },
    },
  });
  const level = await db.gradeLevel.create({
    data: {
      schoolId: first.id,
      organizationalUnitId: unit.id,
      name: 'Petite crèche',
      code: 'CRE-PETITE',
      cycle: 'CRECHE',
      orderIndex: 1,
    },
  });
  const classroom = await db.class.create({
    data: {
      schoolId: first.id,
      academicYearId: year.id,
      organizationalUnitId: unit.id,
      languageSectionId: section.id,
      gradeLevelId: level.id,
      name: 'Petite crèche A',
      capacity: 25,
    },
  });
  const enrollment = await db.enrollment.create({
    data: {
      schoolId: first.id,
      academicYearId: year.id,
      classId: classroom.id,
      studentId: student.id,
      enrollmentDate: new Date('2026-09-01'),
      status: 'ACTIVE',
    },
  });
  const feeType = await db.feeType.create({
    data: { schoolId: first.id, code: 'PENSION', name: 'Pension' },
  });
  const feeStructure = await db.feeStructure.create({
    data: {
      schoolId: first.id,
      organizationalUnitId: unit.id,
      academicYearId: year.id,
      feeTypeId: feeType.id,
      name: 'Pension crèche',
      amount: 100_000,
      status: 'ACTIVE',
    },
  });
  await db.studentFeeAssignment.create({
    data: {
      schoolId: first.id,
      organizationalUnitId: unit.id,
      enrollmentId: enrollment.id,
      studentId: student.id,
      feeStructureId: feeStructure.id,
      feeTypeId: feeType.id,
      originalAmount: 100_000,
      finalAmount: 100_000,
      paidAmount: 75_000,
      status: 'PARTIALLY_PAID',
    },
  });
  await db.payment.create({
    data: {
      schoolId: first.id,
      reference: 'PLAT-PAY-001',
      amount: 75_000,
      paymentMethod: 'CASH',
      channel: 'BACKOFFICE',
      status: 'SUCCESS',
      paidAt: new Date(),
    },
  });
  await db.auditLog.create({
    data: { schoolId: first.id, action: 'platform.test', entityType: 'School', entityId: first.id },
  });
  superToken = await createAccount({
    roleCode: 'SUPER_ADMIN',
    email: 'super@test.local',
    phone: '+237699000090',
    schoolId: null,
    permissions: ['schools.manage'],
  });
  schoolToken = await createAccount({
    roleCode: 'SCHOOL_ADMIN',
    email: 'school@test.local',
    phone: '+237699000091',
    schoolId: first.id,
    permissions: ['academic_years.read'],
  });
});

afterAll(async () => {
  await app.close();
  await closeTestDatabase();
});

describe('console Super administrateur', () => {
  it('consolide les établissements, les utilisateurs, les élèves et les encaissements', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/platform/dashboard',
      headers: { authorization: `Bearer ${superToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.summary).toMatchObject({
      totalSchools: 2,
      activeSchools: 1,
      activeStudents: 1,
      confirmedPayments: 1,
      collectedAmount: 75_000,
      expectedAmount: 100_000,
      remainingAmount: 25_000,
      collectionRate: 75,
      totalCapacity: 25,
      priorityAlerts: 2,
    });
    expect(body.academicYear).toBe('2026/2027');
    expect(body.units).toContainEqual(
      expect.objectContaining({
        code: 'CRECHE',
        students: 1,
        capacity: 25,
        occupancyRate: 4,
        expectedAmount: 100_000,
        collectedAmount: 75_000,
        remainingAmount: 25_000,
        alerts: 2,
      }),
    );
    expect(body.dataQuality).toMatchObject({
      guardianCoverage: { complete: 0, total: 1, rate: 0 },
      classConfiguration: { complete: 1, total: 1, rate: 100 },
      teachingCoverage: { complete: 0, total: 1, rate: 0 },
      feeCoverage: { complete: 1, total: 1, rate: 100 },
    });
    expect(body.schools).toHaveLength(2);
    expect(body.recentActivity).toContainEqual(
      expect.objectContaining({
        action: 'platform.test',
        schoolName: 'École Active A',
      }),
    );
  });

  it('refuse un administrateur limité à son établissement', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/platform/dashboard',
      headers: { authorization: `Bearer ${schoolToken}` },
    });
    expect(response.statusCode).toBe(403);
  });
});
