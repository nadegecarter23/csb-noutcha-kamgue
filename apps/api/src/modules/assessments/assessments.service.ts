import type { Prisma } from '@prisma/client';
import type {
  AssessmentDto,
  CreateAcademicPeriodBody,
  CreateAssessmentBody,
  CreateAssessmentTypeBody,
  CreateCompetencyBody,
  CreateGradingPolicyBody,
  SaveGradesBody,
  UpdateAcademicPeriodStatusBody,
} from '@cplan/contracts';
import type { Database } from '../../platform/db.js';
import type { AuditService } from '../../platform/audit.js';
import { AuditAction } from '../../platform/audit.js';
import { errors } from '../../platform/errors.js';
import { withSchoolScope } from '../../platform/school-scope.js';

const include = {
  period: true,
  type: true,
  class: true,
  teachingAssignment: { include: { subject: true, teacher: true } },
  competencies: { include: { competency: true } },
  grades: {
    include: { enrollment: { include: { student: true } } },
    orderBy: { enrollment: { student: { lastName: 'asc' as const } } },
  },
} satisfies Prisma.AssessmentInclude;
type AssessmentRow = Prisma.AssessmentGetPayload<{ include: typeof include }>;
const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
const dateText = (value: Date) => value.toISOString().slice(0, 10);
const hundredths = (value: number) => Math.round(value * 100);

function dto(row: AssessmentRow): AssessmentDto {
  return {
    id: row.id,
    academicYearId: row.academicYearId,
    periodId: row.periodId,
    periodName: row.period.name,
    teachingAssignmentId: row.teachingAssignmentId,
    classId: row.classId,
    className: row.class.name,
    subjectName: row.teachingAssignment.subject.name,
    typeId: row.typeId,
    typeName: row.type.name,
    title: row.title,
    date: dateText(row.date),
    maxScore: row.maxScore / 100,
    weight: row.weight / 100,
    status: row.status,
    competencies: row.competencies.map(({ competency }) => ({
      id: competency.id,
      code: competency.code,
      name: competency.name,
      description: competency.description,
      status: competency.status,
    })),
    grades: row.grades.map((grade) => ({
      id: grade.id,
      enrollmentId: grade.enrollmentId,
      studentId: grade.enrollment.student.id,
      studentNumber: grade.enrollment.student.studentNumber,
      studentName: `${grade.enrollment.student.lastName} ${grade.enrollment.student.firstName}`,
      score: grade.score === null ? null : grade.score / 100,
      isAbsent: grade.isAbsent,
      comment: grade.comment,
    })),
  };
}

export function createAssessmentsService(db: Database, audit: AuditService) {
  const get = (schoolId: string, id: string) =>
    withSchoolScope(db, schoolId, (tx) =>
      tx.assessment.findFirst({ where: { id, schoolId }, include }),
    );
  return {
    async overview(
      schoolId: string,
      input: { academicYearId: string; classId?: string; periodId?: string },
    ) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const [periods, types, competencies, policies, assessments] = await Promise.all([
          tx.academicPeriod.findMany({
            where: { schoolId, academicYearId: input.academicYearId },
            orderBy: { orderIndex: 'asc' },
          }),
          tx.assessmentType.findMany({ where: { schoolId }, orderBy: { name: 'asc' } }),
          tx.competency.findMany({ where: { schoolId }, orderBy: { name: 'asc' } }),
          tx.gradingPolicy.findMany({
            where: { schoolId, academicYearId: input.academicYearId },
            orderBy: { version: 'desc' },
          }),
          tx.assessment.findMany({
            where: {
              schoolId,
              academicYearId: input.academicYearId,
              ...(input.classId && { classId: input.classId }),
              ...(input.periodId && { periodId: input.periodId }),
            },
            include,
            orderBy: [{ date: 'desc' }, { title: 'asc' }],
          }),
        ]);
        return {
          periods: periods.map((item) => ({
            ...item,
            startDate: dateText(item.startDate),
            endDate: dateText(item.endDate),
          })),
          types: types.map((item) => ({ ...item, defaultWeight: item.defaultWeight / 100 })),
          competencies,
          policies,
          assessments: assessments.map(dto),
        };
      });
    },
    async createPeriod(schoolId: string, input: CreateAcademicPeriodBody) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const year = await tx.academicYear.findFirst({
          where: { id: input.academicYearId, schoolId, status: { in: ['DRAFT', 'ACTIVE'] } },
        });
        if (!year) throw errors.validation('L’année scolaire est introuvable ou déjà clôturée.');
        const startDate = date(input.startDate);
        const endDate = date(input.endDate);
        if (startDate < year.startDate || endDate > year.endDate)
          throw errors.validation('La période doit être comprise dans l’année scolaire.');
        const overlap = await tx.academicPeriod.findFirst({
          where: {
            academicYearId: input.academicYearId,
            startDate: { lte: endDate },
            endDate: { gte: startDate },
          },
        });
        if (overlap) throw errors.conflict(`La période chevauche « ${overlap.name} ».`);
        const row = await tx.academicPeriod.create({
          data: {
            schoolId,
            academicYearId: input.academicYearId,
            name: input.name,
            orderIndex: input.orderIndex,
            startDate,
            endDate,
          },
        });
        await audit.log(
          {
            action: AuditAction.ACADEMIC_PERIOD_CREATED,
            entityType: 'academic_period',
            entityId: row.id,
            schoolId,
            after: input,
          },
          tx,
        );
        return { ...row, startDate: dateText(row.startDate), endDate: dateText(row.endDate) };
      });
    },
    async updatePeriodStatus(schoolId: string, id: string, input: UpdateAcademicPeriodStatusBody) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const period = await tx.academicPeriod.findFirst({ where: { id, schoolId } });
        if (!period) throw errors.notFound('Période introuvable.');
        if (input.status === 'OPEN') {
          if (period.status !== 'DRAFT')
            throw errors.conflict('Seule une période brouillon peut être ouverte.');
          const alreadyOpen = await tx.academicPeriod.findFirst({
            where: {
              schoolId,
              academicYearId: period.academicYearId,
              status: 'OPEN',
              id: { not: id },
            },
          });
          if (alreadyOpen)
            throw errors.conflict(`La période « ${alreadyOpen.name} » est déjà ouverte.`);
        } else {
          if (period.status !== 'OPEN')
            throw errors.conflict('Seule une période ouverte peut être clôturée.');
          const assessments = await tx.assessment.findMany({
            where: { schoolId, periodId: id },
            select: { status: true },
          });
          if (!assessments.length)
            throw errors.validation('La période doit contenir au moins une évaluation.');
          if (assessments.some((assessment) => assessment.status !== 'LOCKED'))
            throw errors.validation(
              'Toutes les évaluations doivent être verrouillées avant la clôture.',
            );
        }
        const updated = await tx.academicPeriod.update({
          where: { id },
          data: { status: input.status },
        });
        await audit.log(
          {
            action: AuditAction.ACADEMIC_PERIOD_STATUS_CHANGED,
            entityType: 'academic_period',
            entityId: id,
            schoolId,
            before: { status: period.status },
            after: { status: updated.status },
          },
          tx,
        );
        return {
          ...updated,
          startDate: dateText(updated.startDate),
          endDate: dateText(updated.endDate),
        };
      });
    },
    async createType(schoolId: string, input: CreateAssessmentTypeBody) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const row = await tx.assessmentType.create({
          data: {
            schoolId,
            code: input.code,
            name: input.name,
            defaultWeight: hundredths(input.defaultWeight),
          },
        });
        await audit.log(
          {
            action: AuditAction.ASSESSMENT_TYPE_CREATED,
            entityType: 'assessment_type',
            entityId: row.id,
            schoolId,
            after: input,
          },
          tx,
        );
        return { ...row, defaultWeight: row.defaultWeight / 100 };
      });
    },
    async createCompetency(schoolId: string, input: CreateCompetencyBody) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const row = await tx.competency.create({
          data: {
            schoolId,
            code: input.code,
            name: input.name,
            description: input.description ?? null,
          },
        });
        await audit.log(
          {
            action: AuditAction.COMPETENCY_CREATED,
            entityType: 'competency',
            entityId: row.id,
            schoolId,
            after: input,
          },
          tx,
        );
        return row;
      });
    },
    async createPolicy(schoolId: string, input: CreateGradingPolicyBody) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const year = await tx.academicYear.findFirst({
          where: { id: input.academicYearId, schoolId, status: { in: ['DRAFT', 'ACTIVE'] } },
        });
        if (!year) throw errors.validation('L’année scolaire est introuvable ou déjà clôturée.');
        const where = {
          schoolId,
          academicYearId: input.academicYearId,
          cycle: input.cycle ?? null,
        };
        await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${`${schoolId}:${input.academicYearId}:${input.cycle ?? 'GENERAL'}`}))) AS acquired`;
        const latest = await tx.gradingPolicy.findFirst({ where, orderBy: { version: 'desc' } });
        await tx.gradingPolicy.updateMany({
          where: { ...where, isActive: true },
          data: { isActive: false },
        });
        const row = await tx.gradingPolicy.create({
          data: {
            ...where,
            version: (latest?.version ?? 0) + 1,
            roundingDigits: input.roundingDigits,
            weightingMode: input.weightingMode,
            absenceHandling: input.absenceHandling,
            rankingEnabled: input.rankingEnabled,
          },
        });
        await audit.log(
          {
            action: AuditAction.GRADING_POLICY_CREATED,
            entityType: 'grading_policy',
            entityId: row.id,
            schoolId,
            after: row,
          },
          tx,
        );
        return row;
      });
    },
    async createAssessment(schoolId: string, input: CreateAssessmentBody): Promise<AssessmentDto> {
      const row = await withSchoolScope(db, schoolId, async (tx) => {
        const [year, assignment, period, type, competencies] = await Promise.all([
          tx.academicYear.findFirst({
            where: { id: input.academicYearId, schoolId, status: 'ACTIVE' },
          }),
          tx.teachingAssignment.findFirst({
            where: {
              id: input.teachingAssignmentId,
              schoolId,
              academicYearId: input.academicYearId,
              status: { not: 'INACTIVE' },
              subject: { status: 'ACTIVE' },
            },
          }),
          tx.academicPeriod.findFirst({
            where: {
              id: input.periodId,
              schoolId,
              academicYearId: input.academicYearId,
              status: { not: 'CLOSED' },
            },
          }),
          tx.assessmentType.findFirst({ where: { id: input.typeId, schoolId, status: 'ACTIVE' } }),
          tx.competency.count({
            where: { id: { in: input.competencyIds }, schoolId, status: 'ACTIVE' },
          }),
        ]);
        if (!year)
          throw errors.validation('Seule une année scolaire active peut recevoir des évaluations.');
        if (!assignment || !period || !type)
          throw errors.validation('Affectation, période ou type invalide.');
        if (competencies !== new Set(input.competencyIds).size)
          throw errors.validation('Une compétence est invalide.');
        const assessmentDate = date(input.date);
        if (assessmentDate < period.startDate || assessmentDate > period.endDate)
          throw errors.validation('La date doit appartenir à la période.');
        const enrollments = await tx.enrollment.findMany({
          where: {
            schoolId,
            academicYearId: input.academicYearId,
            classId: assignment.classId,
            status: 'ACTIVE',
          },
          select: { id: true },
        });
        if (!enrollments.length)
          throw errors.validation('La classe ne contient aucun élève inscrit.');
        const created = await tx.assessment.create({
          data: {
            schoolId,
            academicYearId: input.academicYearId,
            periodId: input.periodId,
            teachingAssignmentId: assignment.id,
            classId: assignment.classId,
            typeId: type.id,
            title: input.title,
            date: assessmentDate,
            maxScore: hundredths(input.maxScore),
            weight: input.weight === undefined ? type.defaultWeight : hundredths(input.weight),
            competencies: {
              create: input.competencyIds.map((competencyId) => ({ schoolId, competencyId })),
            },
            grades: {
              create: enrollments.map((enrollment) => ({ schoolId, enrollmentId: enrollment.id })),
            },
          },
          include,
        });
        await audit.log(
          {
            action: AuditAction.ASSESSMENT_CREATED,
            entityType: 'assessment',
            entityId: created.id,
            schoolId,
            after: input,
          },
          tx,
        );
        return created;
      });
      return dto(row);
    },
    async saveGrades(schoolId: string, id: string, input: SaveGradesBody): Promise<AssessmentDto> {
      await withSchoolScope(db, schoolId, async (tx) => {
        const assessment = await tx.assessment.findFirst({
          where: { id, schoolId },
          include: { period: true, grades: { select: { enrollmentId: true } } },
        });
        if (!assessment) throw errors.notFound('Évaluation introuvable.');
        if (assessment.status === 'LOCKED' || assessment.period.status === 'CLOSED')
          throw errors.conflict('Cette évaluation est verrouillée.');
        const allowed = new Set(assessment.grades.map((grade) => grade.enrollmentId));
        if (input.grades.some((grade) => !allowed.has(grade.enrollmentId)))
          throw errors.validation('Une inscription ne correspond pas à cette évaluation.');
        for (const grade of input.grades) {
          if (
            !grade.isAbsent &&
            grade.score !== null &&
            hundredths(grade.score) > assessment.maxScore
          )
            throw errors.validation('Une note dépasse le barème.');
          await tx.grade.update({
            where: {
              assessmentId_enrollmentId: { assessmentId: id, enrollmentId: grade.enrollmentId },
            },
            data: {
              score: grade.isAbsent || grade.score === null ? null : hundredths(grade.score),
              isAbsent: grade.isAbsent,
              comment: grade.comment ?? null,
            },
          });
        }
        await audit.log(
          {
            action: AuditAction.GRADES_SAVED,
            entityType: 'assessment',
            entityId: id,
            schoolId,
            metadata: { count: input.grades.length },
          },
          tx,
        );
      });
      const row = await get(schoolId, id);
      if (!row) throw errors.notFound('Évaluation introuvable.');
      return dto(row);
    },
    async publish(schoolId: string, id: string, lock: boolean): Promise<AssessmentDto> {
      await withSchoolScope(db, schoolId, async (tx) => {
        const assessment = await tx.assessment.findFirst({
          where: { id, schoolId },
          include: { grades: true, period: true },
        });
        if (!assessment) throw errors.notFound('Évaluation introuvable.');
        if (assessment.period.status !== 'OPEN')
          throw errors.conflict('La période doit être ouverte.');
        if (lock && assessment.status !== 'PUBLISHED')
          throw errors.conflict('Publiez l’évaluation avant de la verrouiller.');
        if (!lock && assessment.status !== 'DRAFT')
          throw errors.conflict('Seule une évaluation brouillon peut être publiée.');
        if (assessment.grades.some((grade) => grade.score === null && !grade.isAbsent))
          throw errors.validation('Toutes les notes ou absences doivent être renseignées.');
        const status = lock ? ('LOCKED' as const) : ('PUBLISHED' as const);
        await tx.assessment.update({
          where: { id },
          data: { status, publishedAt: assessment.publishedAt ?? new Date() },
        });
        await audit.log(
          {
            action: AuditAction.ASSESSMENT_PUBLISHED,
            entityType: 'assessment',
            entityId: id,
            schoolId,
            before: { status: assessment.status },
            after: { status },
          },
          tx,
        );
      });
      const row = await get(schoolId, id);
      if (!row) throw errors.notFound('Évaluation introuvable.');
      return dto(row);
    },
  };
}
export type AssessmentsService = ReturnType<typeof createAssessmentsService>;
