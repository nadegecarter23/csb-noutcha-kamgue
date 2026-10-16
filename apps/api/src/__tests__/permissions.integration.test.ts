import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { PERMISSIONS, ROLES, permissionsForRole, type RoleCode } from '@cplan/contracts';
import {
  buildTestApp,
  closeTestDatabase,
  MemorySmsProvider,
  resetTestData,
  testDatabase,
  type TestApp,
} from './helpers/test-app.js';
import { hashPassword } from '../platform/crypto.js';

/**
 * MATRICE RÔLES × ROUTES.
 *
 * Deuxième garde-fou de la Phase 01, complémentaire du test d'architecture :
 * celui-ci vérifie que chaque route est protégée, celui-là vérifie qu'elle est
 * protégée par la BONNE permission.
 *
 * Il détecte le défaut le plus insidieux du RBAC : une permission accordée par
 * erreur dans la matrice de docs/05-RBAC-PERMISSIONS.md §4 — un caissier qui
 * pourrait contrepasser un paiement, une scolarité qui pourrait modifier les
 * tarifs. Rien ne planterait ; l'établissement le découvrirait trop tard.
 */

const PASSWORD = 'MotDePasseTest1';

let app: TestApp;
let db: PrismaClient;
let schoolId: string;

interface Actor {
  role: RoleCode;
  token: string;
}

const actors = new Map<RoleCode, Actor>();

async function seedReference(): Promise<void> {
  for (const permission of PERMISSIONS) {
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

  const ids = new Map(
    (await db.permission.findMany({ select: { id: true, code: true } })).map((p) => [p.code, p.id]),
  );

  for (const definition of ROLES) {
    const existing = await db.role.findFirst({
      where: { code: definition.code, schoolId: null },
    });
    const role =
      existing ??
      (await db.role.create({
        data: {
          code: definition.code,
          name: definition.name,
          description: definition.description,
          isSystem: true,
        },
      }));

    await db.rolePermission.deleteMany({ where: { roleId: role.id } });
    await db.rolePermission.createMany({
      data: permissionsForRole(definition)
        .map((code) => ids.get(code))
        .filter((id): id is string => Boolean(id))
        .map((permissionId) => ({ roleId: role.id, permissionId })),
      skipDuplicates: true,
    });
  }
}

/** Crée un compte par rôle et récupère son jeton d'accès. */
async function createActors(): Promise<void> {
  actors.clear();
  const passwordHash = await hashPassword(PASSWORD);
  let index = 0;

  for (const definition of ROLES) {
    index += 1;
    const phone = `+2376991000${String(index).padStart(2, '0')}`;
    const email = `${definition.code.toLowerCase()}@test.local`;

    const user = await db.user.create({
      data: {
        firstName: definition.code,
        lastName: 'Test',
        phone,
        email,
        passwordHash,
        status: 'ACTIVE',
        phoneVerifiedAt: new Date(),
      },
    });

    const role = await db.role.findFirstOrThrow({
      where: { code: definition.code, schoolId: null },
    });

    // Les rôles de plateforme (SUPER_ADMIN, PARENT) ne sont pas rattachés à un
    // établissement ; les autres le sont. C'est ce qui détermine si le
    // contexte d'établissement sera présent dans leur jeton.
    await db.userRole.create({
      data: {
        userId: user.id,
        roleId: role.id,
        schoolId: definition.isPlatformRole ? null : schoolId,
      },
    });

    if (!definition.isPlatformRole) {
      await db.staffProfile.create({ data: { userId: user.id, schoolId } });
    }

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { identifier: email, password: PASSWORD },
    });

    actors.set(definition.code, {
      role: definition.code,
      token: response.json().tokens.accessToken,
    });
  }
}

function tokenFor(role: RoleCode): string {
  const actor = actors.get(role);
  if (!actor) throw new Error(`Acteur manquant pour le rôle ${role}.`);
  return actor.token;
}

beforeAll(async () => {
  db = testDatabase();
  app = await buildTestApp({ db, sms: new MemorySmsProvider() });
  await app.ready();
});

beforeEach(async () => {
  await resetTestData(db);
  await seedReference();
  const school = await db.school.create({ data: { code: 'MATRIX', name: 'École matrice' } });
  schoolId = school.id;
  await createActors();
});

afterAll(async () => {
  await app.close();
  await closeTestDatabase();
});

/* -------------------------------------------------------------------------- */

/**
 * Chaque entrée décrit une route et les rôles censés y accéder.
 *
 * La liste `allowed` est la traduction directe de la matrice du doc 05 :
 * elle doit être relue avec le client, pas déduite du code.
 */
interface Case {
  label: string;
  method: 'GET' | 'POST' | 'PATCH';
  url: string;
  payload?: unknown;
  allowed: RoleCode[];
}

const CASES: Case[] = [
  {
    label: 'lister les comptes',
    method: 'GET',
    url: '/api/v1/users',
    allowed: ['SCHOOL_ADMIN'],
  },
  {
    label: 'créer un compte',
    method: 'POST',
    url: '/api/v1/users',
    payload: {
      firstName: 'Nouveau',
      lastName: 'Compte',
      phone: '+237699777888',
      roles: ['CASHIER'],
      sendInvitation: false,
    },
    allowed: ['SCHOOL_ADMIN'],
  },
  {
    label: 'lister les rôles',
    method: 'GET',
    url: '/api/v1/roles',
    allowed: ['SCHOOL_ADMIN'],
  },
  {
    label: 'consulter le catalogue de permissions',
    method: 'GET',
    url: '/api/v1/permissions',
    allowed: ['SUPER_ADMIN', 'SCHOOL_ADMIN'],
  },
];

describe('matrice rôles × routes', () => {
  for (const testCase of CASES) {
    describe(testCase.label, () => {
      for (const definition of ROLES) {
        const role = definition.code;
        const shouldAllow = testCase.allowed.includes(role);

        it(`${role} : ${shouldAllow ? 'autorisé' : 'refusé'}`, async () => {
          const response = await app.inject({
            method: testCase.method,
            url: testCase.url,
            headers: { authorization: `Bearer ${tokenFor(role)}` },
            ...(testCase.payload ? { payload: testCase.payload } : {}),
          });

          if (shouldAllow) {
            expect(
              response.statusCode,
              `${role} devrait accéder à ${testCase.url} — reçu ${response.statusCode} ${response.body.slice(0, 200)}`,
            ).toBeLessThan(400);
          } else {
            expect(
              response.statusCode,
              `${role} NE devrait PAS accéder à ${testCase.url} — reçu ${response.statusCode}`,
            ).toBe(403);
          }
        });
      }
    });
  }

  it('refuse toute route protégée sans jeton', async () => {
    for (const testCase of CASES) {
      const response = await app.inject({
        method: testCase.method,
        url: testCase.url,
        ...(testCase.payload ? { payload: testCase.payload } : {}),
      });
      expect(response.statusCode, `${testCase.method} ${testCase.url}`).toBe(401);
    }
  });
});

/* -------------------------------------------------------------------------- */

describe('cohérence de la matrice de rôles', () => {
  it('ne référence que des permissions existant au catalogue', () => {
    const catalogue = new Set(PERMISSIONS.map((p) => p.code));
    for (const definition of ROLES) {
      for (const code of permissionsForRole(definition)) {
        expect(catalogue.has(code), `${definition.code} référence « ${code} », inconnu`).toBe(true);
      }
    }
  });

  it('le caissier ne peut ni contrepasser, ni valider un paiement externe', () => {
    // Règle métier explicite de la Phase 08 §8 : une erreur de caisse se
    // corrige par un comptable, jamais par le caissier lui-même.
    const cashier = ROLES.find((role) => role.code === 'CASHIER');
    const permissions = cashier ? permissionsForRole(cashier) : [];

    expect(permissions).not.toContain('payments.reverse');
    expect(permissions).not.toContain('payments.validate_external');
    expect(permissions).not.toContain('fee_structures.manage');
    expect(permissions).not.toContain('discounts.approve');
  });

  it('la scolarité ne peut pas toucher à la configuration financière', () => {
    const registrar = ROLES.find((role) => role.code === 'REGISTRAR');
    const permissions = registrar ? permissionsForRole(registrar) : [];

    expect(permissions).toContain('student_fees.read'); // lecture seule (§56)
    expect(permissions).not.toContain('fee_structures.manage');
    expect(permissions).not.toContain('payments.create_cash');
    expect(permissions).not.toContain('discounts.create');
  });

  it('limite l’enseignant aux opérations pédagogiques prévues', () => {
    const teacher = ROLES.find((role) => role.code === 'TEACHER');
    const permissions = teacher ? permissionsForRole(teacher) : [];
    expect(permissions).toEqual(
      expect.arrayContaining([
        'assessments.read',
        'assessments.grade',
        'report_cards.read',
        'report_cards.comment',
      ]),
    );
    for (const forbidden of [
      'subjects.manage',
      'assessments.manage',
      'assessments.publish',
      'report_cards.publish',
    ])
      expect(permissions).not.toContain(forbidden);
  });

  it('le parent n’a aucune permission d’administration', () => {
    const parent = ROLES.find((role) => role.code === 'PARENT');
    const permissions = parent ? permissionsForRole(parent) : [];

    expect(
      permissions.every(
        (code) => code.endsWith('_own') || code.startsWith('payments.') || code === 'portal.read',
      ),
    ).toBe(true);
    expect(permissions).not.toContain('students.read');
    expect(permissions).not.toContain('payments.read');
  });
});

/* -------------------------------------------------------------------------- */

describe('administration des comptes', () => {
  async function asAdmin(method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown) {
    return app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${tokenFor('SCHOOL_ADMIN')}` },
      ...(payload ? { payload } : {}),
    });
  }

  it('crée un compte sans mot de passe, en attente de vérification', async () => {
    const response = await asAdmin('POST', '/api/v1/users', {
      firstName: 'Nouveau',
      lastName: 'Caissier',
      phone: '699 77 78 88',
      roles: ['CASHIER'],
      sendInvitation: false,
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().status).toBe('PENDING_VERIFICATION');
    expect(response.json().roles).toEqual(['CASHIER']);

    const created = await db.user.findUnique({ where: { phone: '+237699777888' } });
    // L'établissement ne choisit jamais le mot de passe d'un employé.
    expect(created?.passwordHash).toBeNull();
  });

  it('refuse un doublon de numéro dans le même établissement', async () => {
    const payload = {
      firstName: 'Doublon',
      lastName: 'Test',
      phone: '+237699777999',
      roles: ['CASHIER'],
      sendInvitation: false,
    };

    expect((await asAdmin('POST', '/api/v1/users', payload)).statusCode).toBe(201);
    expect((await asAdmin('POST', '/api/v1/users', payload)).statusCode).toBe(409);
  });

  it('révoque les sessions actives lors d’un changement de rôle', async () => {
    const target = await db.user.findFirstOrThrow({ where: { email: 'cashier@test.local' } });
    expect(await db.session.count({ where: { userId: target.id, revokedAt: null } })).toBe(1);

    const response = await asAdmin('POST', `/api/v1/users/${target.id}/roles`, {
      roles: ['REGISTRAR'],
      reason: 'Changement de poste',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().roles).toEqual(['REGISTRAR']);

    // Sans cette révocation, l'ancien jeton resterait valable 15 minutes avec
    // les anciennes permissions.
    expect(await db.session.count({ where: { userId: target.id, revokedAt: null } })).toBe(0);
  });

  it('empêche un administrateur de modifier ses propres rôles', async () => {
    const me = await db.user.findFirstOrThrow({ where: { email: 'school_admin@test.local' } });
    const response = await asAdmin('POST', `/api/v1/users/${me.id}/roles`, { roles: ['CASHIER'] });

    // Se retirer soi-même ses droits verrouillerait l'établissement hors de
    // son propre outil.
    expect(response.statusCode).toBe(400);
  });

  it('désactive un compte sans le supprimer et coupe ses sessions', async () => {
    const target = await db.user.findFirstOrThrow({ where: { email: 'registrar@test.local' } });

    const response = await asAdmin('POST', `/api/v1/users/${target.id}/deactivate`, {
      reason: 'Départ de l’établissement',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('DISABLED');
    expect(await db.user.count({ where: { id: target.id } })).toBe(1);
    expect(await db.session.count({ where: { userId: target.id, revokedAt: null } })).toBe(0);

    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { identifier: 'registrar@test.local', password: PASSWORD },
    });
    expect(login.statusCode).toBe(403);
  });

  it('journalise la désactivation avec son motif', async () => {
    const target = await db.user.findFirstOrThrow({ where: { email: 'director@test.local' } });
    await asAdmin('POST', `/api/v1/users/${target.id}/deactivate`, { reason: 'Retraite' });

    const log = await db.auditLog.findFirst({
      where: { action: 'user.deactivate', entityId: target.id },
    });
    expect(log).not.toBeNull();
    expect(JSON.stringify(log?.metadata)).toContain('Retraite');
  });

  it('n’expose pas les comptes d’un autre établissement', async () => {
    const other = await db.school.create({ data: { code: 'AUTRE', name: 'Autre école' } });
    const role = await db.role.findFirstOrThrow({ where: { code: 'CASHIER', schoolId: null } });
    const stranger = await db.user.create({
      data: { firstName: 'Etranger', lastName: 'Test', phone: '+237699888777', status: 'ACTIVE' },
    });
    await db.userRole.create({
      data: { userId: stranger.id, roleId: role.id, schoolId: other.id },
    });

    const list = await asAdmin('GET', '/api/v1/users');
    const ids = list.json().data.map((user: { id: string }) => user.id);
    expect(ids).not.toContain(stranger.id);

    // Même avec l'identifiant en main : 404, et non 403, pour ne pas révéler
    // l'existence du compte.
    const direct = await asAdmin('GET', `/api/v1/users/${stranger.id}`);
    expect(direct.statusCode).toBe(404);
  });
});
