import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createAuditService } from '../platform/audit.js';
import { createPedagogyService } from '../modules/pedagogy/pedagogy.service.js';
import { createAssessmentsService } from '../modules/assessments/assessments.service.js';
import { createReportCardsService } from '../modules/report-cards/report-cards.service.js';
import { createPortalService } from '../modules/portal/portal.service.js';
import { closeTestDatabase, resetTestData, testDatabase } from './helpers/test-app.js';

const db = testDatabase();
const audit = createAuditService(db);
const pedagogy = createPedagogyService(db, audit);
const assessments = createAssessmentsService(db, audit);
const reportCards = createReportCardsService(db, audit);

let schoolId: string;
let yearId: string;
let classId: string;
let periodId: string;
let typeId: string;
let mathAssignmentId: string;
let frenchAssignmentId: string;
let enrollmentIds: string[];
let studentIds: string[];

beforeAll(async () => {
  await db.$connect();
});
afterAll(closeTestDatabase);

beforeEach(async () => {
  await resetTestData(db);
  const school = await db.school.create({
    data: { code: `PED-${Date.now()}`, name: 'Collège Pédagogie', settings: { create: {} } },
  });
  schoolId = school.id;
  const year = await db.academicYear.create({
    data: {
      schoolId,
      name: '2026/2027',
      startDate: new Date('2026-09-01'),
      endDate: new Date('2027-07-01'),
      status: 'ACTIVE',
      isCurrent: true,
    },
  });
  yearId = year.id;
  const level = await db.gradeLevel.create({
    data: { schoolId, name: 'Sixième', code: '6E', cycle: 'SECONDAIRE', orderIndex: 1 },
  });
  const classRoom = await db.class.create({
    data: { schoolId, academicYearId: yearId, gradeLevelId: level.id, name: '6e A' },
  });
  classId = classRoom.id;

  enrollmentIds = [];
  studentIds = [];
  for (const [index, firstName] of ['Alice', 'Boris'].entries()) {
    const student = await db.student.create({
      data: { schoolId, studentNumber: `PED-${index + 1}`, firstName, lastName: 'Test' },
    });
    studentIds.push(student.id);
    const enrollment = await db.enrollment.create({
      data: {
        schoolId,
        studentId: student.id,
        academicYearId: yearId,
        classId,
        enrollmentDate: new Date('2026-09-01'),
        status: 'ACTIVE',
      },
    });
    enrollmentIds.push(enrollment.id);
  }

  const math = await pedagogy.createSubject(schoolId, {
    code: 'MATH',
    name: 'Mathématiques',
    color: '#2563EB',
  });
  const french = await pedagogy.createSubject(schoolId, {
    code: 'FR',
    name: 'Français',
    color: '#DC2626',
  });
  mathAssignmentId = (
    await pedagogy.createAssignment(schoolId, {
      academicYearId: yearId,
      classId,
      subjectId: math.id,
      teacherUserId: null,
      weeklyHours: 5,
      coefficient: 4,
    })
  ).id;
  frenchAssignmentId = (
    await pedagogy.createAssignment(schoolId, {
      academicYearId: yearId,
      classId,
      subjectId: french.id,
      teacherUserId: null,
      weeklyHours: 4,
      coefficient: 2,
    })
  ).id;

  const period = await assessments.createPeriod(schoolId, {
    academicYearId: yearId,
    name: 'Trimestre 1',
    orderIndex: 1,
    startDate: '2026-09-01',
    endDate: '2026-12-20',
  });
  periodId = period.id;
  await assessments.updatePeriodStatus(schoolId, periodId, { status: 'OPEN' });
  typeId = (
    await assessments.createType(schoolId, { code: 'DEV', name: 'Devoir', defaultWeight: 2 })
  ).id;
});

async function createGradedAssessment(input: {
  assignmentId: string;
  title: string;
  date: string;
  maxScore: number;
  weight?: number;
  scores: Array<number | 'ABSENT'>;
}) {
  const created = await assessments.createAssessment(schoolId, {
    academicYearId: yearId,
    periodId,
    teachingAssignmentId: input.assignmentId,
    typeId,
    title: input.title,
    date: input.date,
    maxScore: input.maxScore,
    ...(input.weight !== undefined && { weight: input.weight }),
    competencyIds: [],
  });
  await assessments.saveGrades(schoolId, created.id, {
    grades: created.grades.map((grade, index) => ({
      enrollmentId: grade.enrollmentId,
      score: input.scores[index] === 'ABSENT' ? null : (input.scores[index] ?? null),
      isAbsent: input.scores[index] === 'ABSENT',
      comment: null,
    })),
  });
  await assessments.publish(schoolId, created.id, false);
  return assessments.publish(schoolId, created.id, true);
}

describe('matières, évaluations et bulletins', () => {
  it('applique les coefficients, les pondérations, l’arrondi et les rangs', async () => {
    await assessments.createPolicy(schoolId, {
      academicYearId: yearId,
      cycle: 'SECONDAIRE',
      roundingDigits: 2,
      weightingMode: 'WEIGHTED_AVERAGE',
      absenceHandling: 'EXCLUDE',
      rankingEnabled: true,
    });
    const defaulted = await createGradedAssessment({
      assignmentId: mathAssignmentId,
      title: 'Math 1',
      date: '2026-10-01',
      maxScore: 20,
      scores: [10, 20],
    });
    expect(defaulted.weight).toBe(2);
    await createGradedAssessment({
      assignmentId: mathAssignmentId,
      title: 'Math 2',
      date: '2026-10-15',
      maxScore: 20,
      weight: 6,
      scores: [18, 20],
    });
    await createGradedAssessment({
      assignmentId: frenchAssignmentId,
      title: 'Français 1',
      date: '2026-10-20',
      maxScore: 20,
      weight: 1,
      scores: [12, 10],
    });

    await assessments.updatePeriodStatus(schoolId, periodId, { status: 'CLOSED' });
    await reportCards.generate(schoolId, { academicYearId: yearId, periodId, classId });
    const cards = await reportCards.list(schoolId, { academicYearId: yearId, periodId, classId });
    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({ studentName: 'Test Boris', overallAverage: 16.67, rank: 1 });
    expect(cards[1]).toMatchObject({ studentName: 'Test Alice', overallAverage: 14.67, rank: 2 });
    expect(cards[1]?.subjects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ subjectName: 'Mathématiques', average: 16, coefficient: 4 }),
        expect.objectContaining({ subjectName: 'Français', average: 12, coefficient: 2 }),
      ]),
    );
    const aliceCard = cards[1];
    const commentedSubject = aliceCard?.subjects[0];
    if (!aliceCard || !commentedSubject) throw new Error('Bulletin de test incomplet.');
    await expect(
      reportCards.update(schoolId, aliceCard.id, {
        subjectComments: [{ subjectId: randomUUID(), comment: 'Matière étrangère' }],
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await reportCards.update(schoolId, aliceCard.id, {
      subjectComments: [{ subjectId: commentedSubject.subjectId, comment: 'Bon trimestre' }],
    });
    await reportCards.generate(schoolId, { academicYearId: yearId, periodId, classId });
    const recalculated = await reportCards.get(schoolId, aliceCard.id);
    expect(
      recalculated.subjects.some((subject) => subject.teacherComment === 'Bon trimestre'),
    ).toBe(true);
  });

  it('distingue le total de points et compte les absences selon la politique', async () => {
    await assessments.createPolicy(schoolId, {
      academicYearId: yearId,
      cycle: 'SECONDAIRE',
      roundingDigits: 2,
      weightingMode: 'POINTS_TOTAL',
      absenceHandling: 'ZERO',
      rankingEnabled: false,
    });
    await createGradedAssessment({
      assignmentId: mathAssignmentId,
      title: 'Court',
      date: '2026-10-01',
      maxScore: 10,
      weight: 1,
      scores: [10, 'ABSENT'],
    });
    await createGradedAssessment({
      assignmentId: mathAssignmentId,
      title: 'Long',
      date: '2026-10-15',
      maxScore: 30,
      weight: 1,
      scores: [0, 'ABSENT'],
    });
    await assessments.updatePeriodStatus(schoolId, periodId, { status: 'CLOSED' });
    await reportCards.generate(schoolId, { academicYearId: yearId, periodId, classId });
    const cards = await reportCards.list(schoolId, { academicYearId: yearId, periodId, classId });
    expect(cards.find((card) => card.enrollmentId === enrollmentIds[0])?.overallAverage).toBe(5);
    expect(cards.find((card) => card.enrollmentId === enrollmentIds[1])?.overallAverage).toBe(0);
    expect(cards.every((card) => card.rank === null)).toBe(true);
  });

  it('fige réellement le bulletin publié dans son instantané', async () => {
    await assessments.createPolicy(schoolId, {
      academicYearId: yearId,
      cycle: null,
      roundingDigits: 2,
      weightingMode: 'WEIGHTED_AVERAGE',
      absenceHandling: 'EXCLUDE',
      rankingEnabled: true,
    });
    await createGradedAssessment({
      assignmentId: mathAssignmentId,
      title: 'Math',
      date: '2026-10-01',
      maxScore: 20,
      scores: [15, 12],
    });
    await assessments.updatePeriodStatus(schoolId, periodId, { status: 'CLOSED' });
    await reportCards.generate(schoolId, { academicYearId: yearId, periodId, classId });
    const cards = await reportCards.list(schoolId, { academicYearId: yearId, periodId, classId });
    const card = cards.find((item) => item.enrollmentId === enrollmentIds[0]);
    const studentId = studentIds[0];
    if (!card || !studentId) throw new Error('Données de test introuvables.');
    await reportCards.publish(
      schoolId,
      cards.map((item) => item.id),
    );
    await db.student.update({ where: { id: studentId }, data: { firstName: 'Nom modifié' } });
    const frozen = await reportCards.get(schoolId, card.id);
    expect(frozen.studentName).toBe('Test Alice');
    expect(frozen.status).toBe('PUBLISHED');
    expect(frozen.publishedAt).not.toBeNull();
    const pdf = await reportCards.pdf(schoolId, card.id);
    expect(Buffer.from(pdf.content).subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.fileName).toMatch(/^Bulletin_Test-Alice_.+\.pdf$/);

    // Le portail convertit la moyenne stockée en centièmes (1500) en points (15).
    const portalUser = await db.user.create({
      data: { firstName: 'Alice', lastName: 'Test', phone: '+237690000101' },
    });
    await db.student.update({ where: { id: studentId }, data: { portalUserId: portalUser.id } });
    const portal = await createPortalService(db).overview(schoolId, portalUser.id, yearId);
    expect(portal.mode).toBe('STUDENT');
    expect(portal.learners[0]?.average).toBe(15);
  });

  it('protège le cycle de vie, les périodes et les inscriptions étrangères', async () => {
    await expect(
      assessments.createPeriod(schoolId, {
        academicYearId: yearId,
        name: 'Chevauchement',
        orderIndex: 2,
        startDate: '2026-12-01',
        endDate: '2027-03-01',
      }),
    ).rejects.toThrow(/chevauche/);
    const created = await assessments.createAssessment(schoolId, {
      academicYearId: yearId,
      periodId,
      teachingAssignmentId: mathAssignmentId,
      typeId,
      title: 'Contrôle',
      date: '2026-10-01',
      maxScore: 20,
      competencyIds: [],
    });
    await expect(
      assessments.saveGrades(schoolId, created.id, {
        grades: [
          { enrollmentId: '01990000-0000-7000-8000-000000000099', score: 10, isAbsent: false },
        ],
      }),
    ).rejects.toThrow(/inscription/);
    await expect(
      assessments.updatePeriodStatus(schoolId, periodId, { status: 'CLOSED' }),
    ).rejects.toThrow(/verrouillées/);
    await assessments.saveGrades(schoolId, created.id, {
      grades: created.grades.map((grade) => ({
        enrollmentId: grade.enrollmentId,
        score: 10,
        isAbsent: false,
      })),
    });
    await assessments.publish(schoolId, created.id, false);
    await assessments.publish(schoolId, created.id, true);
    await reportCards.generate(schoolId, { academicYearId: yearId, periodId, classId });
    const cards = await reportCards.list(schoolId, { academicYearId: yearId, periodId, classId });
    await expect(
      reportCards.publish(
        schoolId,
        cards.map((card) => card.id),
      ),
    ).rejects.toThrow(/clôturée/);
  });
});
