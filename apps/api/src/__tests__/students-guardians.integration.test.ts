import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { PERMISSIONS } from '@cplan/contracts';
import { PDFDocument } from 'pdf-lib';
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
let schoolId: string;
let token: string;
let yearId: string;
let classId: string;
let levelId: string;

const headers = () => ({ authorization: `Bearer ${token}` });
const payload = (index = 1, overrides: Record<string, unknown> = {}) => ({
  student: {
    firstName: `Élève${index}`,
    lastName: 'Fotso',
    gender: index % 2 ? 'M' : 'F',
    ...overrides,
  },
  enrollment: {
    academicYearId: yearId,
    classId,
    enrollmentDate: '2026-09-01',
    enrollmentType: 'NEW',
    status: 'ACTIVE',
  },
  guardians: [],
  confirmDuplicate: false,
});

async function login(identifier: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { identifier, password: PASSWORD },
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
  const school = await db.school.create({
    data: { code: `P34-${Date.now()}`, name: 'Collège P34', settings: { create: {} } },
  });
  schoolId = school.id;
  for (const permission of PERMISSIONS.filter((item) => item.phase <= 4)) {
    await db.permission.upsert({
      where: { code: permission.code },
      update: {},
      create: {
        code: permission.code,
        description: permission.description,
        group: permission.group,
      },
    });
  }
  const role = await db.role.create({
    data: { code: `P34_ADMIN_${Date.now()}`, name: 'Admin P34', schoolId },
  });
  const permissions = await db.permission.findMany({
    where: { code: { in: PERMISSIONS.filter((item) => item.phase <= 4).map((item) => item.code) } },
  });
  await db.rolePermission.createMany({
    data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
  });
  const user = await db.user.create({
    data: {
      firstName: 'Admin',
      lastName: 'P34',
      phone: '+237699777111',
      email: `p34-${Date.now()}@test.local`,
      passwordHash: await hashPassword(PASSWORD),
      status: 'ACTIVE',
      phoneVerifiedAt: new Date(),
    },
  });
  await db.userRole.create({ data: { userId: user.id, roleId: role.id, schoolId } });
  await db.staffProfile.create({ data: { userId: user.id, schoolId } });
  if (!user.email) throw new Error('E-mail administrateur absent.');
  token = await login(user.email);
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
    data: { schoolId, name: '6e', code: '6E', orderIndex: 0, cycle: 'SECONDAIRE' },
  });
  levelId = level.id;
  classId = (
    await db.class.create({
      data: {
        schoolId,
        academicYearId: yearId,
        gradeLevelId: level.id,
        name: '6e A',
        capacity: 60,
      },
    })
  ).id;
});

afterAll(async () => {
  await app.close();
  await closeTestDatabase();
});

describe('élèves et inscriptions', () => {
  it('garde la classe, le niveau et l’année hors de la table students', async () => {
    const columns = await db.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'students'`;
    expect(columns.map((column) => column.column_name)).not.toEqual(
      expect.arrayContaining(['class_id', 'grade_level_id', 'academic_year_id']),
    );
  });

  it('génère vingt matricules distincts et consécutifs en concurrence', async () => {
    const responses = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        app.inject({
          method: 'POST',
          url: '/api/v1/students',
          headers: headers(),
          payload: payload(index + 1),
        }),
      ),
    );
    expect(responses.every((response) => response.statusCode === 201)).toBe(true);
    const numbers = responses
      .map((response) => response.json().student.studentNumber as string)
      .sort();
    expect(new Set(numbers).size).toBe(20);
    expect(numbers).toEqual(
      Array.from({ length: 20 }, (_, index) => `CPLAN-${String(index + 1).padStart(5, '0')}`),
    );
  });

  it('refuse une seconde inscription pour le même élève et la même année en base', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/students',
      headers: headers(),
      payload: payload(),
    });
    const studentId = created.json().student.id as string;
    await expect(
      db.enrollment.create({
        data: {
          schoolId,
          studentId,
          academicYearId: yearId,
          classId,
          enrollmentDate: new Date(),
          enrollmentType: 'NEW',
        },
      }),
    ).rejects.toThrow();
  });

  it('refuse une classe appartenant à une autre année', async () => {
    const otherYear = await db.academicYear.create({
      data: {
        schoolId,
        name: '2027/2028',
        startDate: new Date('2027-09-01'),
        endDate: new Date('2028-07-31'),
      },
    });
    const otherClass = await db.class.create({
      data: { schoolId, academicYearId: otherYear.id, gradeLevelId: levelId, name: '6e B' },
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/students',
      headers: headers(),
      payload: {
        ...payload(),
        enrollment: { ...payload().enrollment, classId: otherClass.id },
      },
    });
    expect(response.statusCode).toBe(400);
  });

  it('retrouve Fotso avec « fotsi » et le suffixe du matricule', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/students',
      headers: headers(),
      payload: payload(1, { firstName: 'Nathan', studentNumber: 'CPLAN-00342' }),
    });
    const typo = await app.inject({
      method: 'GET',
      url: '/api/v1/students?q=fotsi',
      headers: headers(),
    });
    const number = await app.inject({
      method: 'GET',
      url: '/api/v1/students?q=00342',
      headers: headers(),
    });
    expect(typo.json().meta.total).toBe(1);
    expect(number.json().data[0].studentNumber).toBe('CPLAN-00342');
  });

  it('journalise un changement de classe sans créer une nouvelle inscription', async () => {
    const second = await db.class.create({
      data: { schoolId, academicYearId: yearId, gradeLevelId: levelId, name: '6e B' },
    });
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/students',
      headers: headers(),
      payload: payload(),
    });
    const enrollmentId = created.json().enrollment.id as string;
    const transfer = await app.inject({
      method: 'POST',
      url: `/api/v1/enrollments/${enrollmentId}/transfer-class`,
      headers: headers(),
      payload: { toClassId: second.id, reason: 'Rééquilibrage des effectifs' },
    });
    expect(transfer.statusCode).toBe(200);
    expect(await db.studentClassChange.count({ where: { enrollmentId } })).toBe(1);
    expect(await db.enrollment.count({ where: { studentId: created.json().student.id } })).toBe(1);
  });

  it('supprime un élève sans historique et détaille le blocage avec inscription', async () => {
    const empty = await db.student.create({
      data: { schoolId, studentNumber: 'VIDE-1', firstName: 'Sans', lastName: 'Historique' },
    });
    const removed = await app.inject({
      method: 'DELETE',
      url: `/api/v1/students/${empty.id}`,
      headers: headers(),
      payload: { reason: 'Erreur de saisie' },
    });
    expect(removed.statusCode).toBe(204);
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/students',
      headers: headers(),
      payload: payload(),
    });
    const blocked = await app.inject({
      method: 'DELETE',
      url: `/api/v1/students/${created.json().student.id}`,
      headers: headers(),
      payload: { reason: 'Erreur de saisie' },
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error.message).toContain('1 inscription');
  });

  it('restitue une frise de trois années et des indicateurs exacts', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/students',
      headers: headers(),
      payload: payload(),
    });
    const studentId = created.json().student.id as string;
    for (const [name, start, end] of [
      ['2024/2025', '2024-09-01', '2025-07-31'],
      ['2025/2026', '2025-09-01', '2026-07-31'],
    ] as const) {
      const year = await db.academicYear.create({
        data: {
          schoolId,
          name,
          startDate: new Date(start),
          endDate: new Date(end),
          status: 'CLOSED',
        },
      });
      await db.enrollment.create({
        data: {
          schoolId,
          studentId,
          academicYearId: year.id,
          enrollmentDate: new Date(start),
          enrollmentType: 'RE_ENROLLMENT',
          status: 'COMPLETED',
        },
      });
    }
    const history = await app.inject({
      method: 'GET',
      url: `/api/v1/students/${studentId}/history`,
      headers: headers(),
    });
    expect(
      history.json().filter((item: { kind: string }) => item.kind === 'ENROLLMENT'),
    ).toHaveLength(3);
    const dashboard = await app.inject({
      method: 'GET',
      url: `/api/v1/dashboard/registrar?academic_year_id=${yearId}`,
      headers: headers(),
    });
    expect(dashboard.json()).toMatchObject({
      activeStudents: 1,
      newEnrollments: 1,
      unassignedStudents: 0,
    });
  });

  it('pagine 1 243 élèves en moins de 500 ms', async () => {
    await db.student.createMany({
      data: Array.from({ length: 1_243 }, (_, index) => ({
        schoolId,
        studentNumber: `PERF-${String(index).padStart(5, '0')}`,
        firstName: `Prénom${index}`,
        lastName: `Nom${String(index).padStart(5, '0')}`,
      })),
    });
    const startedAt = performance.now();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/students?page_size=25',
      headers: headers(),
    });
    const elapsed = performance.now() - startedAt;
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toHaveLength(25);
    expect(response.json().meta.total).toBe(1_243);
    expect(elapsed).toBeLessThan(500);
  });
});

describe('responsables et sécurité parent', () => {
  async function createParent(phone: string) {
    const user = await db.user.create({
      data: {
        firstName: 'Jean',
        lastName: 'Fotso',
        phone,
        email: `${phone.slice(-4)}@parent.test`,
        passwordHash: await hashPassword(PASSWORD),
        status: 'ACTIVE',
        phoneVerifiedAt: new Date(),
      },
    });
    let role = await db.role.findFirst({ where: { code: 'PARENT', schoolId: null } });
    role ??= await db.role.create({ data: { code: 'PARENT', name: 'Parent', isSystem: true } });
    await db.userRole.create({ data: { userId: user.id, roleId: role.id, schoolId: null } });
    if (!user.email) throw new Error('E-mail parent absent.');
    return { user, token: await login(user.email) };
  }

  it('réutilise le même guardian pour une fratrie et ne propose que PENDING', async () => {
    const parent = await createParent('+237699123456');
    for (const index of [1, 2, 3])
      await app.inject({
        method: 'POST',
        url: '/api/v1/students',
        headers: headers(),
        payload: {
          ...payload(index),
          guardians: [
            {
              firstName: 'Jean',
              lastName: 'Fotso',
              phone: parent.user.phone,
              relationship: 'PERE',
              isPrimary: true,
              isFinancialResponsible: true,
              canPay: true,
              canViewFinances: true,
              canReceiveNotifications: true,
            },
          ],
        },
      });
    expect(await db.guardian.count({ where: { schoolId, phone: parent.user.phone } })).toBe(1);
    const pending = await app.inject({
      method: 'GET',
      url: '/api/v1/parent/pending-links',
      headers: { authorization: `Bearer ${parent.token}` },
    });
    expect(pending.statusCode).toBe(200);
    expect(pending.json()).toHaveLength(3);
    const childrenBefore = await app.inject({
      method: 'GET',
      url: '/api/v1/parent/children',
      headers: { authorization: `Bearer ${parent.token}` },
    });
    expect(childrenBefore.json()).toHaveLength(0);
  });

  it('accepte deux liens, en rejette un et crée un litige', async () => {
    const parent = await createParent('+237699123457');
    for (const index of [1, 2, 3])
      await app.inject({
        method: 'POST',
        url: '/api/v1/students',
        headers: headers(),
        payload: {
          ...payload(index),
          guardians: [
            {
              firstName: 'Jean',
              lastName: 'Fotso',
              phone: parent.user.phone,
              relationship: 'PERE',
              isPrimary: true,
              isFinancialResponsible: true,
              canPay: true,
              canViewFinances: true,
              canReceiveNotifications: true,
            },
          ],
        },
      });
    const pending = (
      await app.inject({
        method: 'GET',
        url: '/api/v1/parent/pending-links',
        headers: { authorization: `Bearer ${parent.token}` },
      })
    ).json<Array<{ id: string }>>();
    for (const link of pending.slice(0, 2))
      await app.inject({
        method: 'POST',
        url: `/api/v1/parent/links/${link.id}/accept`,
        headers: { authorization: `Bearer ${parent.token}` },
      });
    const rejectedLink = pending[2];
    if (!rejectedLink) throw new Error('Troisième proposition absente.');
    await app.inject({
      method: 'POST',
      url: `/api/v1/parent/links/${rejectedLink.id}/reject`,
      headers: { authorization: `Bearer ${parent.token}` },
    });
    const children = await app.inject({
      method: 'GET',
      url: '/api/v1/parent/children',
      headers: { authorization: `Bearer ${parent.token}` },
    });
    expect(children.json()).toHaveLength(2);
    expect(await db.guardianLinkRequest.count({ where: { schoolId, kind: 'DISPUTE' } })).toBe(1);
  });

  it('consomme un QR opaque une seule fois et refuse les codes expirés', async () => {
    const parent = await createParent('+237699123458');
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/students',
      headers: headers(),
      payload: payload(),
    });
    const invitation = await app.inject({
      method: 'POST',
      url: `/api/v1/students/${created.json().student.id}/invites`,
      headers: headers(),
      payload: { type: 'QR_CODE', maxUses: 1 },
    });
    const tokenValue = (invitation.json().linkUrl as string).split('/').at(-1);
    if (!tokenValue) throw new Error('Token d’invitation absent.');
    expect(invitation.json().linkUrl).not.toContain(created.json().student.firstName);
    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/parent/links/redeem',
      headers: { authorization: `Bearer ${parent.token}` },
      payload: { token: tokenValue },
    });
    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/parent/links/redeem',
      headers: { authorization: `Bearer ${parent.token}` },
      payload: { token: tokenValue },
    });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(400);
    const expired = await db.guardianInvite.create({
      data: {
        schoolId,
        studentId: created.json().student.id,
        tokenHash: 'expired-hash',
        shortCode: 'ABCD-EFGH',
        type: 'CODE',
        createdAt: new Date(Date.now() - 172_800_000),
        expiresAt: new Date(Date.now() - 86_400_000),
      },
    });
    const expiredResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/parent/links/redeem',
      headers: { authorization: `Bearer ${parent.token}` },
      payload: { shortCode: expired.shortCode },
    });
    expect(expiredResponse.statusCode).toBe(400);
    expect(expiredResponse.json().error.message).toContain('expiré');
  });

  it('limite à cinq les tentatives de codes courts par parent et par heure', async () => {
    const parent = await createParent('+237699123459');
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/parent/links/redeem',
        headers: { authorization: `Bearer ${parent.token}` },
        payload: { shortCode: 'ZZZZ-ZZZZ' },
      });
      statuses.push(response.statusCode);
    }
    expect(statuses.slice(0, 5).every((status) => status === 404)).toBe(true);
    expect(statuses[5]).toBe(429);
  });

  it('coupe immédiatement l’accès après révocation et ne fuite aucun téléphone tiers', async () => {
    const parent = await createParent('+237699123460');
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/students',
      headers: headers(),
      payload: {
        ...payload(),
        guardians: [
          {
            firstName: 'Jean',
            lastName: 'Fotso',
            phone: parent.user.phone,
            relationship: 'PERE',
            isPrimary: true,
            isFinancialResponsible: true,
            canPay: true,
            canViewFinances: true,
            canReceiveNotifications: true,
          },
          {
            firstName: 'Marie',
            lastName: 'Fotso',
            phone: '+237699999999',
            relationship: 'MERE',
            isPrimary: false,
            isFinancialResponsible: false,
            canPay: false,
            canViewFinances: false,
            canReceiveNotifications: true,
          },
        ],
      },
    });
    const pending = (
      await app.inject({
        method: 'GET',
        url: '/api/v1/parent/pending-links',
        headers: { authorization: `Bearer ${parent.token}` },
      })
    ).json<Array<{ id: string }>>();
    const acceptedLink = pending[0];
    if (!acceptedLink) throw new Error('Proposition parent absente.');
    await app.inject({
      method: 'POST',
      url: `/api/v1/parent/links/${acceptedLink.id}/accept`,
      headers: { authorization: `Bearer ${parent.token}` },
    });
    const before = await app.inject({
      method: 'GET',
      url: '/api/v1/parent/children',
      headers: { authorization: `Bearer ${parent.token}` },
    });
    expect(before.json()).toHaveLength(1);
    expect(before.body).not.toContain('+237699999999');
    const links = await db.studentGuardian.findMany({
      where: { studentId: created.json().student.id },
      include: { guardian: true },
    });
    const parentLink = links.find((link) => link.guardian.phone === parent.user.phone);
    if (!parentLink) throw new Error('Association parent absente.');
    const revoked = await app.inject({
      method: 'POST',
      url: `/api/v1/student-guardians/${parentLink.id}/revoke`,
      headers: headers(),
      payload: { reason: 'Numéro attribué à un tiers' },
    });
    expect(revoked.statusCode).toBe(200);
    const after = await app.inject({
      method: 'GET',
      url: '/api/v1/parent/children',
      headers: { authorization: `Bearer ${parent.token}` },
    });
    expect(after.statusCode).toBe(401);
    expect(after.json<{ error: { code: string } }>().error.code).toBe('UNAUTHENTICATED');
  });

  it("génère les fiches PDF d'association en unitaire et en lot par classe", async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/students',
      headers: headers(),
      payload: payload(1),
    });
    await app.inject({
      method: 'POST',
      url: '/api/v1/students',
      headers: headers(),
      payload: payload(2),
    });

    const single = await app.inject({
      method: 'GET',
      url: `/api/v1/students/${first.json().student.id}/invites/print`,
      headers: headers(),
    });
    expect(single.statusCode).toBe(200);
    expect(single.headers['content-type']).toContain('application/pdf');
    const singlePdf = await PDFDocument.load(single.rawPayload);
    expect(singlePdf.getPageCount()).toBe(1);

    const batch = await app.inject({
      method: 'POST',
      url: `/api/v1/classes/${classId}/invites/print`,
      headers: headers(),
    });
    expect(batch.statusCode).toBe(200);
    expect(batch.headers['content-type']).toContain('application/pdf');
    const batchPdf = await PDFDocument.load(batch.rawPayload);
    expect(batchPdf.getPageCount()).toBe(2);
  });
});
