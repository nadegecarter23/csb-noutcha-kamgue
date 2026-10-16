import { describe, expect, it } from 'vitest';
import {
  createLeaveBodySchema,
  createMealBodySchema,
  createSchoolEventBodySchema,
  inventoryMovementBodySchema,
  portalOverviewSchema,
  updateStaffBodySchema,
} from './index.js';
const id = '01990000-0000-7000-8000-000000000001';
describe('règles de gestion transverses', () => {
  it('refuse un congé dont la fin précède le début', () => {
    expect(
      createLeaveBodySchema.safeParse({
        staffProfileId: id,
        type: 'Congé',
        startsAt: '2026-10-10',
        endsAt: '2026-10-09',
        reason: 'Repos annuel',
      }).success,
    ).toBe(false);
  });
  it('refuse un contrat incohérent', () => {
    expect(
      updateStaffBodySchema.safeParse({ hiredAt: '2026-10-10', contractEnd: '2026-10-09' }).success,
    ).toBe(false);
  });
  it('refuse un événement sans durée positive', () => {
    expect(
      createSchoolEventBodySchema.safeParse({
        title: 'Réunion',
        audience: 'STAFF',
        startsAt: '2026-10-03T10:00:00.000Z',
        endsAt: '2026-10-03T09:00:00.000Z',
      }).success,
    ).toBe(false);
  });
  it('refuse plus de repas servis que planifiés', () => {
    expect(
      createMealBodySchema.safeParse({
        date: '2026-10-03',
        menu: 'Riz et poulet',
        planned: 20,
        served: 21,
      }).success,
    ).toBe(false);
  });
  it('refuse un mouvement de stock nul', () => {
    expect(
      inventoryMovementBodySchema.safeParse({ quantity: 0, reason: 'Ajustement' }).success,
    ).toBe(false);
  });
  it('valide un portail élève vide mais correctement borné', () => {
    expect(
      portalOverviewSchema.safeParse({
        mode: 'STUDENT',
        displayName: 'Élève Test',
        cards: [],
        schedule: [],
        learners: [],
        announcements: [],
        homework: [],
      }).success,
    ).toBe(true);
  });
});
