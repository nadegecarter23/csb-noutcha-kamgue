import { describe, expect, it } from 'vitest';
import { findRole } from './roles.js';
import { openAttendanceSessionBodySchema, saveAttendanceBodySchema } from './attendance.js';

const id = '01990000-0000-7000-8000-000000000001';

describe('attendance contracts', () => {
  it('accepts a consistent attendance record', () => {
    expect(
      saveAttendanceBodySchema.parse({
        records: [{ enrollmentId: id, mark: 'LATE', minutesLate: 12 }],
      }).records[0],
    ).toMatchObject({ mark: 'LATE', minutesLate: 12 });
  });

  it('rejects invalid dates and excessive delays', () => {
    expect(
      openAttendanceSessionBodySchema.safeParse({ timetableEntryId: id, date: '02/10/2026' })
        .success,
    ).toBe(false);
    expect(
      saveAttendanceBodySchema.safeParse({
        records: [{ enrollmentId: id, mark: 'LATE', minutesLate: 900 }],
      }).success,
    ).toBe(false);
  });

  it('lets teachers take attendance without validating it', () => {
    const teacher = findRole('TEACHER');
    if (!teacher || teacher.permissions === '*') throw new Error('Le rôle TEACHER doit exister.');
    expect(teacher.permissions).toContain('attendance.take');
    expect(teacher.permissions).not.toContain('attendance.validate');
  });
});
