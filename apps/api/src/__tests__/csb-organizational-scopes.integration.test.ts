import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { closeTestDatabase, resetTestData, testDatabase } from './helpers/test-app.js';
import { runWithContext } from '../platform/request-context.js';
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

const scoped = <T>(userId: string, work: Parameters<typeof withSchoolScope<T>>[2]) =>
  runWithContext({ requestId: `test-${userId}`, userId, schoolId }, () =>
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

  it('la portée établissement conserve la vision complète', async () => {
    const [classes, students] = await scoped(globalUserId, (tx) =>
      Promise.all([tx.class.count(), tx.student.count()]),
    );
    expect(classes).toBe(2);
    expect(students).toBe(2);
  });
});
