import { describe, expect, it } from 'vitest';
import { createAssessmentBodySchema, saveGradesBodySchema } from './assessments.js';

const id = '01990000-0000-7000-8000-000000000001';
describe('assessment contracts', () => {
  it('accepts a weighted assessment with competencies', () => {
    expect(
      createAssessmentBodySchema.parse({
        academicYearId: id,
        periodId: id,
        teachingAssignmentId: id,
        typeId: id,
        title: 'Devoir 1',
        date: '2026-10-01',
        maxScore: 20,
        weight: 2,
        competencyIds: [id],
      }).weight,
    ).toBe(2);
  });
  it('accepts a missing score only when represented explicitly', () => {
    expect(
      saveGradesBodySchema.parse({ grades: [{ enrollmentId: id, score: null, isAbsent: true }] })
        .grades[0]?.isAbsent,
    ).toBe(true);
  });
  it('rejects negative grades', () => {
    expect(
      saveGradesBodySchema.safeParse({ grades: [{ enrollmentId: id, score: -1, isAbsent: false }] })
        .success,
    ).toBe(false);
  });
  it('rejects duplicate enrollment rows', () => {
    expect(
      saveGradesBodySchema.safeParse({
        grades: [
          { enrollmentId: id, score: 10, isAbsent: false },
          { enrollmentId: id, score: 12, isAbsent: false },
        ],
      }).success,
    ).toBe(false);
  });
});
