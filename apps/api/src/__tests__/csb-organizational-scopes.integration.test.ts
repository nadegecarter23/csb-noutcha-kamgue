import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  buildTestApp,
  closeTestDatabase,
  resetTestData,
  testDatabase,
} from './helpers/test-app.js';
import { hashPassword } from '../platform/crypto.js';
import { assertRuntimeRoleIsRestricted } from '../platform/runtime-role.js';
import type { AppConfig } from '../platform/config.js';
import type { Logger } from 'pino';
import { runWithContext, type AccessScopeContext } from '../platform/request-context.js';
import { withSchoolScope } from '../platform/school-scope.js';

const APP_ROLE_URL =
  process.env.DATABASE_TEST_APP_URL ??
  'postgresql://cplan_app:cplan_dev_password@localhost:5442/cplan_test?schema=public';

let owner: PrismaClient;
let appRole: PrismaClient;
let schoolId: string;
let restrictedUserId: string;
let globalUserId: string;
let primaryUnitId: string;
let secondaryUnitId: string;
let primaryClassId: string;
let secondaryClassId: string;

beforeAll(() => {
  owner = testDatabase();
  appRole = new PrismaClient({ datasources: { db: { url: APP_ROLE_URL } }, log: [] });
});

beforeEach(async () => {
  await resetTestData(owner);
  schoolId = (await owner.school.create({ data: { code: 'CSB-SCOPE', name: 'CSB Scope' } })).id;
  const units = await owner.organizationalUnit.findMany({ where: { schoolId } });
  const primary = units.find((unit) => unit.code === 'PRIMAIRE');
  const secondary = units.find((unit) => unit.code === 'SECONDAIRE');
  if (!primary || !secondary) throw new Error('Référentiel organisationnel incomplet.');
  primaryUnitId = primary.id;
  secondaryUnitId = secondary.id;
  const [primarySection, secondarySection, secondaryTrack] = await Promise.all([
    owner.languageSection.findFirstOrThrow({
      where: { organizationalUnitId: primary.id, code: 'FRANCOPHONE' },
    }),
    owner.languageSection.findFirstOrThrow({
      where: { organizationalUnitId: secondary.id, code: 'FRANCOPHONE' },
    }),
    owner.educationTrack.findFirstOrThrow({
      where: { organizationalUnitId: secondary.id, code: 'GENERAL' },
    }),
  ]);
  const year = await owner.academicYear.create({
    data: {
      schoolId,
      name: '2026/2027',
      startDate: new Date('2026-09-01'),
      endDate: new Date('2027-07-31'),
    },
  });
  const [primaryLevel, secondaryLevel] = await Promise.all([
    owner.gradeLevel.create({
      data: {
        schoolId,
        name: 'CM2',
        code: 'CM2',
        orderIndex: 1,
        cycle: 'PRIMAIRE',
        organizationalUnitId: primary.id,
      },
    }),
    owner.gradeLevel.create({
      data: {
        schoolId,
        name: '6e',
        code: '6E',
        orderIndex: 2,
        cycle: 'SECONDAIRE',
        organizationalUnitId: secondary.id,
      },
    }),
  ]);
  const [primaryClass, secondaryClass] = await Promise.all([
    owner.class.create({
      data: {
        schoolId,
        academicYearId: year.id,
        gradeLevelId: primaryLevel.id,
        organizationalUnitId: primary.id,
        languageSectionId: primarySection.id,
        name: 'CM2 A',
      },
    }),
    owner.class.create({
      data: {
        schoolId,
        academicYearId: year.id,
        gradeLevelId: secondaryLevel.id,
        organizationalUnitId: secondary.id,
        languageSectionId: secondarySection.id,
        educationTrackId: secondaryTrack.id,
        name: '6e A',
      },
    }),
  ]);
  primaryClassId = primaryClass.id;
  secondaryClassId = secondaryClass.id;
  for (const [index, classId] of [primaryClass.id, secondaryClass.id].entries()) {
    const student = await owner.student.create({
      data: { schoolId, studentNumber: `S-${index}`, firstName: 'Elève', lastName: String(index) },
    });
    await owner.enrollment.create({
      data: {
        schoolId,
        studentId: student.id,
        academicYearId: year.id,
        classId,
        enrollmentDate: new Date('2026-09-01'),
      },
    });
  }
  const [restricted, global] = await Promise.all([
    owner.user.create({
      data: { firstName: 'Unité', lastName: 'Primaire', phone: '+237699310001', status: 'ACTIVE' },
    }),
    owner.user.create({
      data: {
        firstName: 'Direction',
        lastName: 'Globale',
        phone: '+237699310002',
        status: 'ACTIVE',
      },
    }),
  ]);
  restrictedUserId = restricted.id;
  globalUserId = global.id;
  await owner.userAccessScope.createMany({
    data: [
      { schoolId, userId: restricted.id, scopeType: 'UNIT', organizationalUnitId: primary.id },
      { schoolId, userId: global.id, scopeType: 'SCHOOL' },
    ],
  });
});

afterAll(async () => {
  await appRole.$disconnect();
  await closeTestDatabase();
});

const scoped = <T>(
  userId: string,
  work: Parameters<typeof withSchoolScope<T>>[2],
  activeScope: AccessScopeContext | null = null,
) =>
  runWithContext({ requestId: `test-${userId}`, userId, schoolId, activeScope }, () =>
    withSchoolScope(appRole, schoolId, work),
  );

describe('CSB-01 à CSB-03 — organisation et cloisonnement interne', () => {
  it('crée les quatre unités, deux sections par unité et les filières seulement au secondaire', async () => {
    const units = await owner.organizationalUnit.findMany({
      where: { schoolId },
      include: { languageSections: true, educationTracks: true },
    });
    expect(units.map((unit) => unit.code).sort()).toEqual([
      'CRECHE',
      'MATERNELLE',
      'PRIMAIRE',
      'SECONDAIRE',
    ]);
    expect(units.every((unit) => unit.languageSections.length === 2)).toBe(true);
    expect(
      units.filter((unit) => unit.educationTracks.length > 0).map((unit) => unit.code),
    ).toEqual(['SECONDAIRE']);
  });

  it('refuse une filière technique hors du secondaire', async () => {
    await expect(
      owner.educationTrack.create({
        data: {
          schoolId,
          organizationalUnitId: primaryUnitId,
          code: 'TECHNIQUE',
          name: 'Technique primaire',
        },
      }),
    ).rejects.toThrow();
  });

  it('filtre listes, recherches par identifiant et compteurs selon le périmètre', async () => {
    const result = await scoped(restrictedUserId, async (tx) => ({
      classes: await tx.class.findMany({ orderBy: { name: 'asc' } }),
      students: await tx.student.findMany(),
      enrollments: await tx.enrollment.count(),
      forbidden: await tx.class.findUnique({ where: { id: secondaryClassId } }),
    }));
    expect(result.classes.map((row) => row.id)).toEqual([primaryClassId]);
    expect(result.students).toHaveLength(1);
    expect(result.enrollments).toBe(1);
    expect(result.forbidden).toBeNull();
  });

  it('applique réellement le périmètre actif choisi dans l’interface', async () => {
    const focused = { type: 'UNIT' as const, organizationalUnitId: primaryUnitId };
    // Profil global concentré sur le primaire : la classe du secondaire disparaît.
    const [classes, students, forbidden] = await scoped(
      globalUserId,
      (tx) =>
        Promise.all([
          tx.class.findMany(),
          tx.student.count(),
          tx.class.findUnique({ where: { id: secondaryClassId } }),
        ]),
      focused,
    );
    expect(classes.map((row) => row.id)).toEqual([primaryClassId]);
    expect(students).toBe(1);
    expect(forbidden).toBeNull();
    // Le choix ne donne aucun droit : un profil limité au primaire qui demande
    // le secondaire ne voit rien.
    const outside = await scoped(restrictedUserId, (tx) => tx.class.count(), {
      type: 'UNIT',
      organizationalUnitId: secondaryUnitId,
    });
    expect(outside).toBe(0);
  });

  it('applique droits et périmètre actif sur une vraie requête HTTP', async () => {
    // Régression : l'identité posée à l'authentification n'atteignait pas la
    // base (contexte perdu), si bien que la RLS laissait tout voir via l'API.
    const permission = await owner.permission.upsert({
      where: { code: 'classes.read' },
      update: {},
      create: { code: 'classes.read', description: 'Consulter les classes', group: 'academic' },
    });
    const role = await owner.role.create({
      data: { code: 'TEST_CLASSES', name: 'Lecture des classes', schoolId },
    });
    await owner.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    const passwordHash = await hashPassword('MotDePasseTest1');
    for (const userId of [restrictedUserId, globalUserId]) {
      await owner.user.update({
        where: { id: userId },
        data: { passwordHash, phoneVerifiedAt: new Date() },
      });
      await owner.userRole.create({ data: { userId, roleId: role.id, schoolId } });
    }
    const app = await buildTestApp({ db: appRole });
    try {
      const token = async (phone: string) =>
        (
          await app.inject({
            method: 'POST',
            url: '/api/v1/auth/login',
            payload: { identifier: phone, password: 'MotDePasseTest1' },
          })
        ).json().tokens.accessToken as string;
      const year = await owner.academicYear.findFirstOrThrow({ where: { schoolId } });
      const classes = async (accessToken: string, headers: Record<string, string> = {}) =>
        (
          await app.inject({
            method: 'GET',
            url: `/api/v1/classes?academic_year_id=${year.id}`,
            headers: { authorization: `Bearer ${accessToken}`, ...headers },
          })
        )
          .json()
          .map((row: { id: string }) => row.id)
          .sort();

      expect(await classes(await token('+237699310001'))).toEqual([primaryClassId]);
      const global = await token('+237699310002');
      expect(await classes(global)).toEqual([primaryClassId, secondaryClassId].sort());
      expect(
        await classes(global, {
          'x-active-scope-type': 'UNIT',
          'x-organizational-unit-id': primaryUnitId,
        }),
      ).toEqual([primaryClassId]);
    } finally {
      await app.close();
    }
  });

  it('refuse de démarrer en production avec un compte qui contourne la RLS', async () => {
    const production = { isProduction: true } as AppConfig;
    const logger = { warn: () => undefined } as unknown as Logger;
    await expect(assertRuntimeRoleIsRestricted(owner, production, logger)).rejects.toThrow(
      /contourne la RLS/,
    );
    await expect(
      assertRuntimeRoleIsRestricted(appRole, production, logger),
    ).resolves.toBeUndefined();
  });

  it('la portée établissement conserve la vision complète', async () => {
    const [classes, students] = await scoped(globalUserId, (tx) =>
      Promise.all([tx.class.count(), tx.student.count()]),
    );
    expect(classes).toBe(2);
    expect(students).toBe(2);
  });
});
