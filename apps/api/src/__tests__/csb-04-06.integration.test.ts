import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeTestDatabase, resetTestData, testDatabase } from './helpers/test-app.js';

const db = testDatabase();
let schoolId: string;
beforeAll(() => db.$connect());
afterAll(closeTestDatabase);
beforeEach(async () => {
  await resetTestData(db);
  schoolId = (
    await db.school.create({
      data: { code: `OPS-${Date.now()}`, name: 'Complexe CSB', settings: { create: {} } },
    })
  ).id;
});

describe('CSB-04 à CSB-06 — référentiels opérationnels', () => {
  it('amorce un organigramme complet et une caisse indépendante par cycle', async () => {
    const [departments, positions, units, registers] = await Promise.all([
      db.staffDepartment.findMany({ where: { schoolId } }),
      db.staffPosition.findMany({ where: { schoolId } }),
      db.organizationalUnit.findMany({ where: { schoolId } }),
      db.cashRegister.findMany({ where: { schoolId } }),
    ]);
    expect(departments.map((x) => x.code)).toEqual(
      expect.arrayContaining([
        'DIRECTION',
        'FINANCES',
        'RESSOURCES_HUMAINES',
        'INFORMATIQUE',
        'COMMUNICATION',
      ]),
    );
    expect(positions.map((x) => x.code)).toEqual(
      expect.arrayContaining([
        'PROMOTEUR',
        'PRINCIPAL',
        'PREFET_ETUDES',
        'SURVEILLANT_GENERAL',
        'RESP_ANGLOPHONE',
        'ECONOME',
      ]),
    );
    expect(registers).toHaveLength(units.length);
    expect(new Set(registers.map((x) => x.organizationalUnitId)).size).toBe(units.length);
  });

  it('refuse une matière dont la section ou la filière sort de son cycle', async () => {
    const primary = await db.organizationalUnit.findFirstOrThrow({
        where: { schoolId, code: 'PRIMAIRE' },
      }),
      secondary = await db.organizationalUnit.findFirstOrThrow({
        where: { schoolId, code: 'SECONDAIRE' },
      });
    const section = await db.languageSection.findFirstOrThrow({
        where: { schoolId, organizationalUnitId: primary.id, code: 'FRANCOPHONE' },
      }),
      track = await db.educationTrack.findFirstOrThrow({
        where: { schoolId, organizationalUnitId: secondary.id, code: 'TECHNIQUE' },
      });
    await expect(
      db.subject.create({
        data: {
          schoolId,
          code: 'TECH',
          name: 'Technologie',
          organizationalUnitId: primary.id,
          languageSectionId: section.id,
          educationTrackId: track.id,
        },
      }),
    ).rejects.toThrow(/invalid subject track scope/);
  });

  it('maintient des séquences de reçus non collisionnelles par caisse et période', async () => {
    const registers = await db.cashRegister.findMany({
      where: { schoolId },
      orderBy: { code: 'asc' },
      take: 2,
    });
    const [first, second] = registers;
    if (!first || !second) throw new Error('Caisses de test absentes.');
    const period = '2026';
    const one = await db.receiptSequence.upsert({
      where: {
        schoolId_organizationalUnitId_cashRegisterId_period: {
          schoolId,
          organizationalUnitId: first.organizationalUnitId,
          cashRegisterId: first.id,
          period,
        },
      },
      create: {
        schoolId,
        organizationalUnitId: first.organizationalUnitId,
        cashRegisterId: first.id,
        period,
        currentValue: 1,
      },
      update: { currentValue: { increment: 1 } },
    });
    const two = await db.receiptSequence.upsert({
      where: {
        schoolId_organizationalUnitId_cashRegisterId_period: {
          schoolId,
          organizationalUnitId: second.organizationalUnitId,
          cashRegisterId: second.id,
          period,
        },
      },
      create: {
        schoolId,
        organizationalUnitId: second.organizationalUnitId,
        cashRegisterId: second.id,
        period,
        currentValue: 1,
      },
      update: { currentValue: { increment: 1 } },
    });
    expect(one.currentValue).toBe(1n);
    expect(two.currentValue).toBe(1n);
    expect(`${first.code}-RCT-${period}-000001`).not.toBe(`${second.code}-RCT-${period}-000001`);
  });
});
