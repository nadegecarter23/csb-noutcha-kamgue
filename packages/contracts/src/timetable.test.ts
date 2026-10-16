import { describe, expect, it } from 'vitest';
import { createTimetableEntryBodySchema } from './timetable.js';
import { findRole, permissionsForRole } from './roles.js';

const validEntry = {
  academicYearId: '01990000-0000-7000-8000-000000000001',
  teachingAssignmentId: '01990000-0000-7000-8000-000000000002',
  roomId: null,
  dayOfWeek: 1,
  startTime: '08:00',
  endTime: '09:00',
};

describe('contrats des emplois du temps', () => {
  it('accepte un créneau hebdomadaire valide', () => {
    expect(createTimetableEntryBodySchema.parse(validEntry)).toEqual(validEntry);
  });

  it('refuse une fin antérieure ou égale au début', () => {
    expect(() =>
      createTimetableEntryBodySchema.parse({ ...validEntry, endTime: '08:00' }),
    ).toThrow();
    expect(() =>
      createTimetableEntryBodySchema.parse({ ...validEntry, endTime: '07:30' }),
    ).toThrow();
  });

  it('donne la lecture aux enseignants sans droit de publication', () => {
    const teacher = findRole('TEACHER');
    expect(teacher).toBeDefined();
    if (!teacher) throw new Error('Le rôle TEACHER doit exister.');
    const permissions = permissionsForRole(teacher);
    expect(permissions).toContain('timetable.read');
    expect(permissions).not.toContain('timetable.manage');
    expect(permissions).not.toContain('timetable.publish');
  });
});
