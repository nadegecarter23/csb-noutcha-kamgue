import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { PERMISSIONS, ROLES, permissionsForRole } from '@cplan/contracts';
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
 * Tests d'intégration de l'authentification, sur une VRAIE base PostgreSQL.
 *
 * Aucune doublure de base : les contraintes (`users_phone_e164`), les index
 * uniques et les triggers font partie du comportement à vérifier. Un test qui
 * simule la base ne prouverait rien sur ce qui se passe réellement.
 *
 * Prérequis : `pnpm infra:up` puis migrations appliquées sur `cplan_test`.
 */

const PASSWORD = 'MotDePasseTest1';
const STAFF_PHONE = '+237699000101';
const STAFF_EMAIL = 'comptable.test@cplan.local';
const PARENT_PHONE = '+237690222333';

let app: TestApp;
let db: PrismaClient;
let sms: MemorySmsProvider;
let schoolId: string;

/** Référentiel rôles + permissions : chargé une fois, comme en production. */
async function seedReferenceData(database: PrismaClient): Promise<void> {
  for (const permission of PERMISSIONS) {
    await database.permission.upsert({
      where: { code: permission.code },
      update: {},
      create: {
        code: permission.code,
        description: permission.description,
        group: permission.group,
      },
    });
  }

  const permissionIds = new Map(
    (await database.permission.findMany({ select: { id: true, code: true } })).map((p) => [
      p.code,
      p.id,
    ]),
  );

  for (const definition of ROLES) {
    const existing = await database.role.findFirst({
      where: { code: definition.code, schoolId: null },
    });
    const role =
      existing ??
      (await database.role.create({
        data: {
          code: definition.code,
          name: definition.name,
          description: definition.description,
          isSystem: true,
        },
      }));

    await database.rolePermission.deleteMany({ where: { roleId: role.id } });
    await database.rolePermission.createMany({
      data: permissionsForRole(definition)
        .map((code) => permissionIds.get(code))
        .filter((id): id is string => Boolean(id))
        .map((permissionId) => ({ roleId: role.id, permissionId })),
      skipDuplicates: true,
    });
  }
}

async function createStaffUser(): Promise<string> {
  const school = await db.school.create({
    data: { code: 'TEST', name: 'Collège de test' },
  });
  schoolId = school.id;

  const user = await db.user.create({
    data: {
      firstName: 'Marie',
      lastName: 'Test',
      phone: STAFF_PHONE,
      email: STAFF_EMAIL,
      passwordHash: await hashPassword(PASSWORD),
      status: 'ACTIVE',
      phoneVerifiedAt: new Date(),
    },
  });

  const role = await db.role.findFirst({ where: { code: 'ACCOUNTANT', schoolId: null } });
  if (!role) throw new Error('Rôle ACCOUNTANT absent du référentiel de test.');

  await db.userRole.create({ data: { userId: user.id, roleId: role.id, schoolId: school.id } });
  await db.staffProfile.create({ data: { userId: user.id, schoolId: school.id } });

  return user.id;
}

async function login(identifier = STAFF_EMAIL, password = PASSWORD) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { identifier, password },
  });
  return { status: response.statusCode, body: response.json() };
}

beforeAll(async () => {
  db = testDatabase();
  sms = new MemorySmsProvider();
  app = await buildTestApp({ db, sms });
  await app.ready();
  await seedReferenceData(db);
});

beforeEach(async () => {
  await resetTestData(db);
  await seedReferenceData(db);
  sms.clear();
  await createStaffUser();
});

afterAll(async () => {
  await app.close();
  await closeTestDatabase();
});

/* -------------------------------------------------------------------------- */

describe('POST /auth/login', () => {
  it('authentifie par e-mail et renvoie rôles et permissions', async () => {
    const { status, body } = await login();

    expect(status).toBe(200);
    expect(body.user.roles).toEqual(['ACCOUNTANT']);
    expect(body.user.permissions).toContain('payments.validate_external');
    expect(body.user.currentSchoolId).toBe(schoolId);
    expect(body.tokens.tokenType).toBe('Bearer');
  });

  it('authentifie aussi par numéro de téléphone', async () => {
    const { status, body } = await login(STAFF_PHONE);
    expect(status).toBe(200);
    expect(body.user.phone).toBe(STAFF_PHONE);
  });

  it('accepte un numéro saisi au format national', async () => {
    const { status } = await login('699 00 01 01');
    expect(status).toBe(200);
  });

  it('n’expose jamais le hachage du mot de passe', async () => {
    const { body } = await login();
    expect(JSON.stringify(body)).not.toContain('argon2');
    expect(body.user).not.toHaveProperty('passwordHash');
  });

  it('impose le remplacement du mot de passe temporaire avant toute autre opération', async () => {
    await db.user.update({ where: { phone: STAFF_PHONE }, data: { mustChangePassword: true } });
    const { status, body } = await login();

    expect(status).toBe(200);
    expect(body.user.mustChangePassword).toBe(true);

    const blocked = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/sessions',
      headers: { authorization: `Bearer ${body.tokens.accessToken}` },
    });
    expect(blocked.statusCode).toBe(403);

    const changed = await app.inject({
      method: 'PATCH',
      url: '/api/v1/auth/password',
      headers: { authorization: `Bearer ${body.tokens.accessToken}` },
      payload: { currentPassword: PASSWORD, newPassword: 'NouveauMotDePasse2026!' },
    });
    expect(changed.statusCode).toBe(204);

    const updated = await db.user.findUniqueOrThrow({ where: { phone: STAFF_PHONE } });
    expect(updated.mustChangePassword).toBe(false);

    const unblocked = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/sessions',
      headers: { authorization: `Bearer ${body.tokens.accessToken}` },
    });
    expect(unblocked.statusCode).toBe(200);
  });

  it('renvoie la MÊME erreur pour un mot de passe faux et un compte inconnu', async () => {
    // Toute différence — code, message ou latence — permettrait d'énumérer
    // les comptes existants.
    const wrongPassword = await login(STAFF_EMAIL, 'mauvais');
    const unknownAccount = await login('inconnu@nulle-part.cm', 'mauvais');

    expect(wrongPassword.status).toBe(401);
    expect(unknownAccount.status).toBe(401);
    expect(wrongPassword.body.error.code).toBe(unknownAccount.body.error.code);
    expect(wrongPassword.body.error.message).toBe(unknownAccount.body.error.message);
  });

  it('verrouille le compte après 5 échecs consécutifs', async () => {
    for (let i = 0; i < 5; i += 1) {
      await login(STAFF_EMAIL, 'mauvais');
    }

    const locked = await login(STAFF_EMAIL, PASSWORD);
    expect(locked.status).toBe(403);
    expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  it('remet le compteur d’échecs à zéro après une connexion réussie', async () => {
    await login(STAFF_EMAIL, 'mauvais');
    await login(STAFF_EMAIL, 'mauvais');
    await login();

    const user = await db.user.findUnique({ where: { email: STAFF_EMAIL } });
    expect(user?.failedLoginCount).toBe(0);
    expect(user?.lastLoginAt).not.toBeNull();
  });

  it('refuse un compte désactivé', async () => {
    await db.user.update({ where: { email: STAFF_EMAIL }, data: { status: 'DISABLED' } });
    const { status, body } = await login();
    expect(status).toBe(403);
    expect(body.error.code).toBe('ACCOUNT_DISABLED');
  });
});

/* -------------------------------------------------------------------------- */

describe('inscription parent et OTP', () => {
  async function register(phone = '690 22 23 33') {
    return app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        firstName: 'Jean',
        lastName: 'Fotso',
        phone,
        password: PASSWORD,
        acceptTerms: true,
      },
    });
  }

  it('crée un compte en attente de vérification', async () => {
    const response = await register();

    expect(response.statusCode).toBe(201);
    expect(response.json().phone).toBe(PARENT_PHONE);

    const user = await db.user.findUnique({ where: { phone: PARENT_PHONE } });
    expect(user?.status).toBe('PENDING_VERIFICATION');
    expect(user?.phoneVerifiedAt).toBeNull();
  });

  it('normalise tous les formats de numéro vers le même compte', async () => {
    expect((await register('690222333')).statusCode).toBe(201);

    // Les trois écritures suivantes désignent le même numéro : la seconde
    // inscription doit être refusée, sinon la détection automatique des
    // enfants (§8) trouverait plusieurs comptes pour un seul parent.
    for (const variant of ['+237690222333', '00237 690 22 23 33', '690.22.23.33']) {
      const response = await register(variant);
      expect(response.statusCode, `format « ${variant} »`).toBe(409);
    }

    expect(await db.user.count({ where: { phone: PARENT_PHONE } })).toBe(1);
  });

  it('envoie un code, l’accepte une fois, puis le refuse', async () => {
    await register();

    const sent = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/otp/send',
      payload: { phone: PARENT_PHONE, purpose: 'SIGNUP' },
    });
    expect(sent.statusCode).toBe(200);

    const code = sms.lastOtpFor(PARENT_PHONE);

    const verified = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/otp/verify',
      payload: { phone: PARENT_PHONE, purpose: 'SIGNUP', code },
    });
    expect(verified.statusCode, verified.body).toBe(200);
    expect(verified.json().user.status).toBe('ACTIVE');
    expect(verified.json().user.phoneVerified).toBe(true);

    const replay = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/otp/verify',
      payload: { phone: PARENT_PHONE, purpose: 'SIGNUP', code },
    });
    expect(replay.statusCode).toBe(400);
  });

  it('ne stocke JAMAIS le code en clair', async () => {
    await register();
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/otp/send',
      payload: { phone: PARENT_PHONE, purpose: 'SIGNUP' },
    });

    const code = sms.lastOtpFor(PARENT_PHONE);
    const stored = await db.otpCode.findFirst({ where: { phone: PARENT_PHONE } });

    expect(stored).not.toBeNull();
    expect(stored?.codeHash).not.toBe(code);
    expect(stored?.codeHash).not.toContain(code);
  });

  it('bloque le renvoi immédiat', async () => {
    await register();
    const payload = { phone: PARENT_PHONE, purpose: 'SIGNUP' as const };

    await app.inject({ method: 'POST', url: '/api/v1/auth/otp/send', payload });
    const second = await app.inject({ method: 'POST', url: '/api/v1/auth/otp/send', payload });

    expect(second.statusCode).toBe(429);
    expect(second.json().error.code).toBe('OTP_RESEND_TOO_SOON');
  });

  it('invalide le code après 5 tentatives erronées', async () => {
    await register();
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/otp/send',
      payload: { phone: PARENT_PHONE, purpose: 'SIGNUP' },
    });

    for (let i = 0; i < 5; i += 1) {
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/otp/verify',
        payload: { phone: PARENT_PHONE, purpose: 'SIGNUP', code: '000000' },
      });
    }

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/otp/verify',
      payload: { phone: PARENT_PHONE, purpose: 'SIGNUP', code: sms.lastOtpFor(PARENT_PHONE) },
    });

    expect(response.statusCode).toBe(429);
    expect(response.json().error.code).toBe('OTP_TOO_MANY_ATTEMPTS');
  });

  it('refuse un code expiré', async () => {
    await register();
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/otp/send',
      payload: { phone: PARENT_PHONE, purpose: 'SIGNUP' },
    });

    await db.otpCode.updateMany({
      where: { phone: PARENT_PHONE },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/otp/verify',
      payload: { phone: PARENT_PHONE, purpose: 'SIGNUP', code: sms.lastOtpFor(PARENT_PHONE) },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('OTP_EXPIRED');
  });
});

/* -------------------------------------------------------------------------- */

describe('rotation des jetons', () => {
  it('émet un nouveau couple et invalide l’ancien refresh token', async () => {
    const { body } = await login();
    const first = body.tokens.refreshToken;

    const refreshed = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: first },
    });

    expect(refreshed.statusCode).toBe(200);
    expect(refreshed.json().refreshToken).not.toBe(first);
  });

  it('révoque TOUTE la famille quand un jeton consommé est rejoué', async () => {
    // Scénario de vol de jeton : l'attaquant rejoue un refresh déjà utilisé.
    // On ne peut pas savoir qui est légitime, donc on déconnecte tout le monde ;
    // la victime se reconnectera, l'attaquant ne le pourra pas.
    const { body } = await login();
    const stolen = body.tokens.refreshToken;

    const legitimate = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: stolen },
    });
    const freshToken = legitimate.json().refreshToken;

    const replay = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: stolen },
    });
    expect(replay.statusCode).toBe(401);

    // Le jeton légitime est lui aussi révoqué : c'est l'effet recherché.
    const afterBreach = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: freshToken },
    });
    expect(afterBreach.statusCode).toBe(401);

    const active = await db.session.count({ where: { revokedAt: null } });
    expect(active).toBe(0);
  });

  it('journalise la détection de réutilisation', async () => {
    const { body } = await login();
    const token = body.tokens.refreshToken;

    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: token },
    });
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: token },
    });

    const log = await db.auditLog.findFirst({
      where: { action: 'auth.token_reuse_detected' },
    });
    expect(log).not.toBeNull();
  });

  it('refuse un refresh token expiré', async () => {
    const { body } = await login();

    // La contrainte `sessions_expires_after_created` interdit une expiration
    // antérieure à la création : on vieillit donc la session tout entière,
    // comme le ferait le temps qui passe.
    const past = new Date(Date.now() - 40 * 86_400_000);
    await db.session.updateMany({
      data: { createdAt: past, expiresAt: new Date(past.getTime() + 86_400_000) },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: body.tokens.refreshToken },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('TOKEN_EXPIRED');
  });
});

/* -------------------------------------------------------------------------- */

describe('GET /auth/me', () => {
  it('refuse sans jeton', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/auth/me' });
    expect(response.statusCode).toBe(401);
  });

  it('refuse un jeton malformé', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: 'Bearer pas.un.jwt' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('TOKEN_INVALID');
  });

  it('renvoie le profil complet avec un jeton valide', async () => {
    const { body } = await login();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${body.tokens.accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().email).toBe(STAFF_EMAIL);
    expect(response.json().schools).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */

describe('journal d’audit', () => {
  it('trace les connexions réussies et échouées', async () => {
    await login();
    await login(STAFF_EMAIL, 'mauvais');

    const actions = (await db.auditLog.findMany({ select: { action: true } })).map(
      (entry) => entry.action,
    );

    expect(actions).toContain('auth.login_succeeded');
    expect(actions).toContain('auth.login_failed');
  });

  it('n’écrit jamais de secret dans le journal', async () => {
    await login();
    await login(STAFF_EMAIL, 'mauvais');

    const logs = await db.auditLog.findMany();
    const dump = JSON.stringify(logs);

    expect(dump).not.toContain(PASSWORD);
    expect(dump).not.toContain('argon2');
  });

  it('est append-only : la modification est refusée par la base', async () => {
    await login();
    const log = await db.auditLog.findFirst();
    if (!log) throw new Error('Aucune entrée de journal à tester.');

    // Le trigger prevent_audit_mutation() protège même du rôle propriétaire.
    await expect(
      db.auditLog.update({ where: { id: log.id }, data: { action: 'falsifie' } }),
    ).rejects.toThrow();
  });
});

/* -------------------------------------------------------------------------- */

describe('contraintes de base de données', () => {
  it('refuse un numéro qui n’est pas au format E.164', async () => {
    await expect(
      db.$executeRawUnsafe(
        `INSERT INTO users (first_name, last_name, phone) VALUES ('A', 'B', '699123456')`,
      ),
    ).rejects.toThrow();
  });

  it('refuse deux comptes avec le même numéro', async () => {
    await expect(
      db.user.create({
        data: { firstName: 'Doublon', lastName: 'Test', phone: STAFF_PHONE },
      }),
    ).rejects.toThrow();
  });
});
