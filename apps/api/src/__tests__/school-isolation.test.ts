import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { closeTestDatabase, resetTestData, testDatabase } from './helpers/test-app.js';
import { withPlatformScope, withSchoolScope } from '../platform/school-scope.js';

/**
 * Isolation multi-établissement (ADR-011, §85 du cahier).
 *
 * Ces tests vérifient la SECONDE barrière — la Row Level Security PostgreSQL.
 * Ils tournent avec le rôle applicatif `cplan_app`, car le rôle propriétaire
 * utilisé par les migrations contourne la RLS : tester avec lui ne prouverait
 * rien.
 *
 * Enjeu : school fees app démarre avec un seul établissement mais doit pouvoir en
 * accueillir d'autres. Une fuite entre écoles serait la faille la plus grave
 * imaginable pour un produit qui vise le SaaS.
 */

const APP_ROLE_URL =
  process.env.DATABASE_TEST_APP_URL ??
  'postgresql://cplan_app:cplan_dev_password@localhost:5442/cplan_test?schema=public';

let owner: PrismaClient;
let appRole: PrismaClient;
let schoolA: string;
let schoolB: string;

beforeAll(() => {
  owner = testDatabase();
  appRole = new PrismaClient({ datasources: { db: { url: APP_ROLE_URL } }, log: [] });
});

beforeEach(async () => {
  await resetTestData(owner);

  const a = await owner.school.create({ data: { code: 'ECOLE-A', name: 'École A' } });
  const b = await owner.school.create({ data: { code: 'ECOLE-B', name: 'École B' } });
  schoolA = a.id;
  schoolB = b.id;

  // Une donnée portant school_id dans chaque école.
  await owner.file.createMany({
    data: [
      {
        schoolId: schoolA,
        storageKey: 'a/logo.png',
        mimeType: 'image/png',
        sizeBytes: 10,
        kind: 'SCHOOL_LOGO',
      },
      {
        schoolId: schoolB,
        storageKey: 'b/logo.png',
        mimeType: 'image/png',
        sizeBytes: 10,
        kind: 'SCHOOL_LOGO',
      },
    ],
  });
  await owner.academicYear.createMany({
    data: [
      {
        schoolId: schoolA,
        name: '2026/2027',
        startDate: new Date('2026-09-01'),
        endDate: new Date('2027-07-31'),
      },
      {
        schoolId: schoolB,
        name: '2026/2027',
        startDate: new Date('2026-09-01'),
        endDate: new Date('2027-07-31'),
      },
    ],
  });
  const [studentA, studentB] = await Promise.all([
    owner.student.create({
      data: { schoolId: schoolA, studentNumber: 'A-1', firstName: 'Alice', lastName: 'A' },
    }),
    owner.student.create({
      data: { schoolId: schoolB, studentNumber: 'B-1', firstName: 'Bob', lastName: 'B' },
    }),
  ]);
  const [guardianA, guardianB] = await Promise.all([
    owner.guardian.create({
      data: { schoolId: schoolA, firstName: 'Parent', lastName: 'A', phone: '+237699111111' },
    }),
    owner.guardian.create({
      data: { schoolId: schoolB, firstName: 'Parent', lastName: 'B', phone: '+237699222222' },
    }),
  ]);
  await owner.studentGuardian.createMany({
    data: [
      { studentId: studentA.id, guardianId: guardianA.id, relationship: 'PERE' },
      { studentId: studentB.id, guardianId: guardianB.id, relationship: 'MERE' },
    ],
  });
});

afterAll(async () => {
  await appRole.$disconnect();
  await closeTestDatabase();
});

describe('Row Level Security', () => {
  it('isole aussi le référentiel scolaire de la Phase 2', async () => {
    const yearsA = await withSchoolScope(appRole, schoolA, (tx) => tx.academicYear.findMany());
    const yearsB = await withSchoolScope(appRole, schoolB, (tx) => tx.academicYear.findMany());
    expect(yearsA).toHaveLength(1);
    expect(yearsB).toHaveLength(1);
    expect(yearsA[0]?.schoolId).toBe(schoolA);
    expect(yearsB[0]?.schoolId).toBe(schoolB);
  });
  it('isole les élèves, responsables et leurs relations des Phases 3–4', async () => {
    const result = await withSchoolScope(appRole, schoolA, async (tx) =>
      Promise.all([tx.student.findMany(), tx.guardian.findMany(), tx.studentGuardian.findMany()]),
    );
    expect(result[0].map((row) => row.studentNumber)).toEqual(['A-1']);
    expect(result[1].map((row) => row.phone)).toEqual(['+237699111111']);
    expect(result[2]).toHaveLength(1);
  });
  it('ne montre que les données de l’établissement du contexte', async () => {
    const filesA = await withSchoolScope(appRole, schoolA, (tx) => tx.file.findMany());
    const filesB = await withSchoolScope(appRole, schoolB, (tx) => tx.file.findMany());

    expect(filesA).toHaveLength(1);
    expect(filesA[0]?.storageKey).toBe('a/logo.png');

    expect(filesB).toHaveLength(1);
    expect(filesB[0]?.storageKey).toBe('b/logo.png');
  });

  it('masque une ligne d’un autre établissement même interrogée par son identifiant', async () => {
    const fileB = await owner.file.findFirstOrThrow({ where: { schoolId: schoolB } });

    // Le pire scénario : un identifiant fuité et un filtre applicatif oublié.
    const leaked = await withSchoolScope(appRole, schoolA, (tx) =>
      tx.file.findUnique({ where: { id: fileB.id } }),
    );

    expect(leaked).toBeNull();
  });

  it('empêche d’écrire une donnée dans un autre établissement', async () => {
    await expect(
      withSchoolScope(appRole, schoolA, (tx) =>
        tx.file.create({
          data: {
            schoolId: schoolB,
            storageKey: 'intrusion.png',
            mimeType: 'image/png',
            sizeBytes: 1,
            kind: 'SCHOOL_LOGO',
          },
        }),
      ),
    ).rejects.toThrow();

    expect(await owner.file.count({ where: { storageKey: 'intrusion.png' } })).toBe(0);
  });

  it('empêche de modifier une donnée d’un autre établissement', async () => {
    const fileB = await owner.file.findFirstOrThrow({ where: { schoolId: schoolB } });

    const result = await withSchoolScope(appRole, schoolA, (tx) =>
      tx.file.updateMany({ where: { id: fileB.id }, data: { originalName: 'pirate' } }),
    );

    // La ligne est invisible : la mise à jour ne touche rien.
    expect(result.count).toBe(0);
    const unchanged = await owner.file.findUniqueOrThrow({ where: { id: fileB.id } });
    expect(unchanged.originalName).toBeNull();
  });

  it('ne laisse pas le contexte fuir d’une transaction à la suivante', async () => {
    // SET LOCAL est limité à la transaction : sur un pool de connexions, une
    // fuite ici ferait voir les données de l'école précédente à la requête
    // suivante, de façon intermittente et très difficile à diagnostiquer.
    await withSchoolScope(appRole, schoolA, (tx) => tx.file.findMany());

    const withoutScope = await appRole.file.findMany();
    expect(withoutScope.length).toBeGreaterThanOrEqual(2);
  });

  it('donne accès à tout en contexte plateforme', async () => {
    const all = await withPlatformScope(appRole, (tx) => tx.file.findMany());
    expect(all).toHaveLength(2);
  });
});
