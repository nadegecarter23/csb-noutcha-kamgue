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
let schoolId: string;
let token: string;

async function authHeaders() {
  return { authorization: `Bearer ${token}` };
}

async function createYear(name = '2026/2027') {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/academic-years',
    headers: await authHeaders(),
    payload: { name, startDate: `${name.slice(0, 4)}-09-01`, endDate: `${name.slice(-4)}-07-31` },
  });
  expect(response.statusCode).toBe(201);
  return response.json<{ id: string }>();
}

async function createLevel(code = '6E') {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/grade-levels',
    headers: await authHeaders(),
    payload: { name: code === '6E' ? '6e' : code, code, orderIndex: 0, cycle: 'SECONDAIRE' },
  });
  expect(response.statusCode).toBe(201);
  return response.json<{ id: string }>();
}

async function createClass(yearId: string, levelId: string, name = '6e A') {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/classes',
    headers: await authHeaders(),
    payload: { classes: [{ academicYearId: yearId, gradeLevelId: levelId, name, capacity: 60 }] },
  });
  expect(response.statusCode).toBe(201);
  const created = response.json<Array<{ id: string }>>()[0];
  if (!created) throw new Error('La classe créée est absente de la réponse.');
  return created;
}

beforeAll(async () => {
  db = testDatabase();
  app = await buildTestApp({ db });
  await app.ready();
});

beforeEach(async () => {
  await resetTestData(db);
  schoolId = (
    await db.school.create({
      data: { code: 'ACADEMIC', name: 'École académique', settings: { create: {} } },
    })
  ).id;
  for (const permission of PERMISSIONS.filter((item) => item.phase <= 2)) {
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
    data: { code: `ACADEMIC_ADMIN_${Date.now()}`, name: 'Administrateur académique', schoolId },
  });
  const permissions = await db.permission.findMany({
    where: { code: { in: PERMISSIONS.filter((item) => item.phase <= 2).map((item) => item.code) } },
  });
  await db.rolePermission.createMany({
    data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
  });
  const user = await db.user.create({
    data: {
      firstName: 'Admin',
      lastName: 'Académique',
      phone: '+237699888777',
      email: 'academic@test.local',
      passwordHash: await hashPassword(PASSWORD),
      status: 'ACTIVE',
      phoneVerifiedAt: new Date(),
    },
  });
  await db.userRole.create({ data: { userId: user.id, roleId: role.id, schoolId } });
  await db.staffProfile.create({ data: { userId: user.id, schoolId } });
  const login = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { identifier: user.email, password: PASSWORD },
  });
  token = login.json().tokens.accessToken;
});

afterAll(async () => {
  await app.close();
  await closeTestDatabase();
});

describe('référentiel scolaire', () => {
  it('crée puis active une année avec un niveau et une classe', async () => {
    const year = await createYear();
    const level = await createLevel();
    await createClass(year.id, level.id);
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/academic-years/${year.id}/activate`,
      headers: await authHeaders(),
      payload: {},
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ACTIVE', isCurrent: true, classCount: 1 });
  });

  it('refuse d’activer une année vide', async () => {
    const year = await createYear();
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/academic-years/${year.id}/activate`,
      headers: await authHeaders(),
      payload: {},
    });
    expect(response.statusCode).toBe(400);
  });

  it('retire automatiquement le drapeau courant de l’ancienne année', async () => {
    const level = await createLevel();
    const first = await createYear('2026/2027');
    await createClass(first.id, level.id);
    await app.inject({
      method: 'POST',
      url: `/api/v1/academic-years/${first.id}/activate`,
      headers: await authHeaders(),
      payload: {},
    });
    const second = await createYear('2027/2028');
    await createClass(second.id, level.id, '6e B');
    await app.inject({
      method: 'POST',
      url: `/api/v1/academic-years/${second.id}/activate`,
      headers: await authHeaders(),
      payload: {},
    });
    const rows = await db.academicYear.findMany({ where: { schoolId }, orderBy: { name: 'asc' } });
    expect(rows.map((row) => [row.name, row.isCurrent])).toEqual([
      ['2026/2027', false],
      ['2027/2028', true],
    ]);
  });

  it('garantit en base qu’une seule année est courante', async () => {
    await db.academicYear.create({
      data: {
        schoolId,
        name: '2026/2027',
        startDate: new Date('2026-09-01'),
        endDate: new Date('2027-07-31'),
        status: 'ACTIVE',
        isCurrent: true,
      },
    });
    await expect(
      db.academicYear.create({
        data: {
          schoolId,
          name: '2027/2028',
          startDate: new Date('2027-09-01'),
          endDate: new Date('2028-07-31'),
          status: 'ACTIVE',
          isCurrent: true,
        },
      }),
    ).rejects.toThrow();
  });

  it('duplique les classes avec de nouveaux identifiants', async () => {
    const source = await createYear();
    const target = await createYear('2027/2028');
    const level = await createLevel();
    const original = await createClass(source.id, level.id);
    const preview = await app.inject({
      method: 'POST',
      url: `/api/v1/academic-years/${source.id}/duplicate-structure`,
      headers: await authHeaders(),
      payload: { targetYearId: target.id, preview: true },
    });
    expect(preview.json()).toMatchObject({ classes: 1, preview: true });
    await app.inject({
      method: 'POST',
      url: `/api/v1/academic-years/${source.id}/duplicate-structure`,
      headers: await authHeaders(),
      payload: { targetYearId: target.id, preview: false },
    });
    const copy = await db.class.findFirstOrThrow({ where: { academicYearId: target.id } });
    expect(copy.id).not.toBe(original.id);
  });

  it('refuse de désactiver un niveau portant une classe active', async () => {
    const year = await createYear();
    const level = await createLevel();
    await createClass(year.id, level.id);
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/grade-levels/${level.id}/deactivate`,
      headers: await authHeaders(),
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.message).toContain('classes actives');
  });

  it('persiste l’ordre pédagogique des niveaux', async () => {
    const first = await createLevel('6E');
    const second = await createLevel('5E');
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/grade-levels/reorder',
      headers: await authHeaders(),
      payload: { orderedIds: [second.id, first.id] },
    });
    expect(response.statusCode).toBe(204);
    const levels = await db.gradeLevel.findMany({
      where: { schoolId },
      orderBy: { orderIndex: 'asc' },
    });
    expect(levels.map((level) => level.id)).toEqual([second.id, first.id]);
  });

  it('rend une année clôturée non modifiable et audite la transition', async () => {
    const year = await createYear();
    const level = await createLevel();
    const classroom = await createClass(year.id, level.id);
    await app.inject({
      method: 'POST',
      url: `/api/v1/academic-years/${year.id}/activate`,
      headers: await authHeaders(),
      payload: {},
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/academic-years/${year.id}/close`,
      headers: await authHeaders(),
      payload: { reason: 'Fin des cours' },
    });
    const update = await app.inject({
      method: 'PATCH',
      url: `/api/v1/classes/${classroom.id}`,
      headers: await authHeaders(),
      payload: { capacity: 50 },
    });
    expect(update.statusCode).toBe(400);
    const deactivate = await app.inject({
      method: 'POST',
      url: `/api/v1/classes/${classroom.id}/deactivate`,
      headers: await authHeaders(),
    });
    expect(deactivate.statusCode).toBe(400);
    expect(await db.auditLog.count({ where: { schoolId, action: 'academic_year.close' } })).toBe(1);
  });
});
