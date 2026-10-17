import type { Prisma } from '@prisma/client';
import {
  reportCardFileName,
  reportCardSchema,
  type ReportCardDto,
  type UpdateReportCardBody,
} from '@cplan/contracts';
import type { Database } from '../../platform/db.js';
import type { AuditService } from '../../platform/audit.js';
import { AuditAction } from '../../platform/audit.js';
import { errors } from '../../platform/errors.js';
import { withPlatformScope, withSchoolScope } from '../../platform/school-scope.js';
import { buildDocumentBrand } from '../../platform/document-brand.js';
import { renderReportCardPdf } from './report-card.pdf.js';

const include = {
  period: true,
  enrollment: { include: { student: true, class: true } },
  subjects: { orderBy: { subjectName: 'asc' as const } },
} satisfies Prisma.ReportCardInclude;
type Row = Prisma.ReportCardGetPayload<{ include: typeof include }>;
const currentDto = (row: Row): ReportCardDto => ({
  id: row.id,
  enrollmentId: row.enrollmentId,
  studentId: row.enrollment.student.id,
  studentNumber: row.enrollment.student.studentNumber,
  studentName: `${row.enrollment.student.lastName} ${row.enrollment.student.firstName}`,
  className: row.enrollment.class?.name ?? 'Sans classe',
  periodId: row.periodId,
  periodName: row.period.name,
  overallAverage: row.overallAverage === null ? null : row.overallAverage / 100,
  rank: row.rank,
  generalComment: row.generalComment,
  decision: row.decision,
  status: row.status,
  publishedAt: row.publishedAt?.toISOString() ?? null,
  subjects: row.subjects.map((item) => ({
    subjectId: item.subjectId,
    subjectName: item.subjectName,
    average: item.average === null ? null : item.average / 100,
    coefficient: item.coefficient / 100,
    teacherComment: item.teacherComment,
  })),
});
const dto = (row: Row): ReportCardDto => {
  if (row.status === 'PUBLISHED' && row.snapshot) {
    const snapshot = reportCardSchema.safeParse(row.snapshot);
    if (snapshot.success) return snapshot.data;
  }
  return currentDto(row);
};

export function createReportCardsService(db: Database, audit: AuditService) {
  return {
    async list(
      schoolId: string,
      input: { academicYearId: string; periodId: string; classId?: string },
    ) {
      return withSchoolScope(db, schoolId, async (tx) =>
        (
          await tx.reportCard.findMany({
            where: {
              schoolId,
              academicYearId: input.academicYearId,
              periodId: input.periodId,
              ...(input.classId && { enrollment: { classId: input.classId } }),
            },
            include,
            orderBy: [{ rank: 'asc' }, { enrollment: { student: { lastName: 'asc' } } }],
          })
        ).map(dto),
      );
    },
    async generate(
      schoolId: string,
      input: { academicYearId: string; periodId: string; classId: string },
    ) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const [period, classRoom, enrollments, assessments, policies] = await Promise.all([
          tx.academicPeriod.findFirst({
            where: { id: input.periodId, schoolId, academicYearId: input.academicYearId },
          }),
          tx.class.findFirst({
            where: { id: input.classId, schoolId, academicYearId: input.academicYearId },
            include: { gradeLevel: true },
          }),
          tx.enrollment.findMany({
            where: {
              schoolId,
              academicYearId: input.academicYearId,
              classId: input.classId,
              status: 'ACTIVE',
            },
          }),
          tx.assessment.findMany({
            where: {
              schoolId,
              academicYearId: input.academicYearId,
              periodId: input.periodId,
              classId: input.classId,
              status: { in: ['PUBLISHED', 'LOCKED'] },
            },
            include: { teachingAssignment: { include: { subject: true } }, grades: true },
          }),
          tx.gradingPolicy.findMany({
            where: { schoolId, academicYearId: input.academicYearId, isActive: true },
            orderBy: { version: 'desc' },
          }),
        ]);
        if (!period) throw errors.notFound('Période introuvable.');
        if (!classRoom) throw errors.notFound('Classe introuvable pour cette année scolaire.');
        if (!enrollments.length)
          throw errors.validation('La classe ne contient aucun élève inscrit.');
        if (!assessments.length)
          throw errors.validation(
            'Publiez au moins une évaluation avant de calculer les bulletins.',
          );
        const policy =
          policies.find((item) => item.cycle === classRoom.gradeLevel.cycle) ??
          policies.find((item) => item.cycle === null);
        const cards: Array<{ id: string; average: number | null }> = [];
        for (const enrollment of enrollments) {
          const subjects = new Map<
            string,
            {
              name: string;
              normalizedSum: number;
              pointScore: number;
              pointMaximum: number;
              weight: number;
              coefficient: number;
            }
          >();
          for (const assessment of assessments) {
            const subjectId = assessment.teachingAssignment.subjectId;
            const current = subjects.get(subjectId) ?? {
              name: assessment.teachingAssignment.subject.name,
              normalizedSum: 0,
              pointScore: 0,
              pointMaximum: 0,
              weight: 0,
              coefficient: assessment.teachingAssignment.coefficient,
            };
            const grade = assessment.grades.find((item) => item.enrollmentId === enrollment.id);
            const countedScore =
              grade?.isAbsent && policy?.absenceHandling === 'ZERO' ? 0 : grade?.score;
            if (countedScore !== null && countedScore !== undefined) {
              current.normalizedSum +=
                (countedScore / assessment.maxScore) * 2000 * assessment.weight;
              current.pointScore += countedScore * assessment.weight;
              current.pointMaximum += assessment.maxScore * assessment.weight;
              current.weight += assessment.weight;
            }
            subjects.set(subjectId, current);
          }
          const existing = await tx.reportCard.findUnique({
            where: {
              enrollmentId_periodId: { enrollmentId: enrollment.id, periodId: input.periodId },
            },
            include: { subjects: true },
          });
          if (existing?.status === 'PUBLISHED') {
            cards.push({ id: existing.id, average: existing.overallAverage });
            continue;
          }
          const comments = new Map(
            existing?.subjects.map((subject) => [subject.subjectId, subject.teacherComment]) ?? [],
          );
          const lines = [...subjects.entries()].map(([subjectId, value]) => ({
            schoolId,
            subjectId,
            subjectName: value.name,
            average:
              policy?.weightingMode === 'POINTS_TOTAL'
                ? value.pointMaximum
                  ? Math.round((value.pointScore / value.pointMaximum) * 2000)
                  : null
                : value.weight
                  ? Math.round(value.normalizedSum / value.weight)
                  : null,
            coefficient: value.coefficient,
            teacherComment: comments.get(subjectId) ?? null,
          }));
          const available = lines.filter(
            (line): line is typeof line & { average: number } => line.average !== null,
          );
          const coefficientTotal = available.reduce((sum, line) => sum + line.coefficient, 0);
          const rawAverage = coefficientTotal
            ? available.reduce((sum, line) => sum + line.average * line.coefficient, 0) /
              coefficientTotal
            : null;
          const roundingStep = 10 ** (2 - (policy?.roundingDigits ?? 2));
          const overallAverage =
            rawAverage === null ? null : Math.round(rawAverage / roundingStep) * roundingStep;
          const card = await tx.reportCard.upsert({
            where: {
              enrollmentId_periodId: { enrollmentId: enrollment.id, periodId: input.periodId },
            },
            create: {
              schoolId,
              academicYearId: input.academicYearId,
              periodId: input.periodId,
              enrollmentId: enrollment.id,
              overallAverage,
              subjects: { create: lines },
            },
            update: { overallAverage, rank: null, subjects: { deleteMany: {}, create: lines } },
          });
          cards.push({ id: card.id, average: overallAverage });
        }
        if (policy?.rankingEnabled ?? true) {
          const ordered = cards
            .filter((item): item is { id: string; average: number } => item.average !== null)
            .sort((a, b) => b.average - a.average);
          let previousAverage: number | null = null;
          let previousRank = 0;
          for (let index = 0; index < ordered.length; index++) {
            const card = ordered[index];
            if (!card) continue;
            const rank = previousAverage === card.average ? previousRank : index + 1;
            await tx.reportCard.update({ where: { id: card.id }, data: { rank } });
            previousAverage = card.average;
            previousRank = rank;
          }
        }
        await audit.log(
          {
            action: AuditAction.REPORT_CARDS_GENERATED,
            entityType: 'academic_period',
            entityId: input.periodId,
            schoolId,
            metadata: { classId: input.classId, count: cards.length, policyId: policy?.id ?? null },
          },
          tx,
        );
        return { generated: cards.length };
      });
    },
    async update(schoolId: string, id: string, input: UpdateReportCardBody) {
      await withSchoolScope(db, schoolId, async (tx) => {
        const card = await tx.reportCard.findFirst({
          where: { id, schoolId },
          include: { subjects: { select: { subjectId: true } } },
        });
        if (!card) throw errors.notFound('Bulletin introuvable.');
        if (card.status === 'PUBLISHED') throw errors.conflict('Un bulletin publié est figé.');
        const subjectIds = new Set(card.subjects.map((subject) => subject.subjectId));
        if ((input.subjectComments ?? []).some((item) => !subjectIds.has(item.subjectId)))
          throw errors.validation("Une matière n'appartient pas à ce bulletin.");
        await tx.reportCard.update({
          where: { id },
          data: {
            ...(input.generalComment !== undefined && { generalComment: input.generalComment }),
            ...(input.decision !== undefined && { decision: input.decision }),
          },
        });
        for (const item of input.subjectComments ?? [])
          await tx.reportCardSubject.update({
            where: { reportCardId_subjectId: { reportCardId: id, subjectId: item.subjectId } },
            data: { teacherComment: item.comment },
          });
        await audit.log(
          {
            action: AuditAction.REPORT_CARD_UPDATED,
            entityType: 'report_card',
            entityId: id,
            schoolId,
            after: input,
          },
          tx,
        );
      });
      return this.get(schoolId, id);
    },
    async get(schoolId: string, id: string) {
      const row = await withSchoolScope(db, schoolId, (tx) =>
        tx.reportCard.findFirst({ where: { id, schoolId }, include }),
      );
      if (!row) throw errors.notFound('Bulletin introuvable.');
      return dto(row);
    },
    async publish(schoolId: string, ids: string[]) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const cards = await tx.reportCard.findMany({
          where: { id: { in: ids }, schoolId, status: 'DRAFT' },
          include,
        });
        if (cards.length !== new Set(ids).size)
          throw errors.validation('Un bulletin est introuvable ou déjà publié.');
        const periodIds = new Set(cards.map((card) => card.periodId));
        if (periodIds.size !== 1 || cards.some((card) => card.period.status !== 'CLOSED'))
          throw errors.conflict(
            'La période doit être clôturée avant la publication des bulletins.',
          );
        if (cards.some((card) => card.overallAverage === null))
          throw errors.validation('Tous les bulletins doivent avoir une moyenne calculée.');
        const publishedAt = new Date();
        for (const card of cards) {
          const snapshot = {
            ...currentDto(card),
            status: 'PUBLISHED' as const,
            publishedAt: publishedAt.toISOString(),
          };
          await tx.reportCard.update({
            where: { id: card.id },
            data: {
              status: 'PUBLISHED',
              publishedAt,
              snapshot: snapshot as unknown as Prisma.InputJsonValue,
            },
          });
        }
        const entityId = cards[0]?.periodId ?? ids[0];
        if (!entityId) throw errors.validation('Aucun bulletin à publier.');
        await audit.log(
          {
            action: AuditAction.REPORT_CARDS_PUBLISHED,
            entityType: 'report_card_batch',
            entityId,
            schoolId,
            metadata: { count: cards.length },
          },
          tx,
        );
        return { published: cards.length };
      });
    },
    /**
     * `trusted` : l'appelant a déjà vérifié le droit d'accès (parent d'un élève,
     * par exemple). La lecture se fait alors hors RLS afin que les statistiques
     * de classe portent sur toute la classe et non sur le seul enfant visible ;
     * chaque requête reste explicitement filtrée sur l'établissement.
     */
    async pdf(schoolId: string, id: string, options: { trusted?: boolean } = {}) {
      const scope = <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) =>
        options.trusted ? withPlatformScope(db, work) : withSchoolScope(db, schoolId, work);
      const { row, siblings, school } = await scope(async (tx) => {
        const row = await tx.reportCard.findFirst({
          where: { id, schoolId },
          include: {
            ...include,
            academicYear: { select: { name: true } },
            enrollment: {
              include: {
                student: true,
                class: {
                  include: { headTeacher: { select: { firstName: true, lastName: true } } },
                },
              },
            },
          },
        });
        if (!row) throw errors.notFound('Bulletin introuvable.');
        const [siblings, school] = await Promise.all([
          row.enrollment.classId
            ? tx.reportCard.findMany({
                where: {
                  schoolId,
                  periodId: row.periodId,
                  enrollment: { classId: row.enrollment.classId },
                },
                include,
              })
            : Promise.resolve([row]),
          tx.school.findUnique({
            where: { id: schoolId },
            select: { name: true, address: true, phone: true, email: true },
          }),
        ]);
        return { row, siblings, school };
      });
      const card = dto(row);
      const classCards = siblings.map(dto);
      const averages = classCards
        .map((item) => item.overallAverage)
        .filter((value): value is number => value !== null);
      const subjectTotals = new Map<string, { sum: number; count: number }>();
      for (const item of classCards)
        for (const subject of item.subjects) {
          if (subject.average === null) continue;
          const total = subjectTotals.get(subject.subjectId) ?? { sum: 0, count: 0 };
          subjectTotals.set(subject.subjectId, {
            sum: total.sum + subject.average,
            count: total.count + 1,
          });
        }
      const headTeacher = row.enrollment.class?.headTeacher;
      const content = await renderReportCardPdf(
        await buildDocumentBrand(school ?? { name: 'Établissement' }),
        card,
        {
          academicYearName: row.academicYear.name,
          studentBirthDate: row.enrollment.student.dateOfBirth?.toISOString() ?? null,
          headTeacherName: headTeacher ? `${headTeacher.firstName} ${headTeacher.lastName}` : null,
          classSize: classCards.length,
          rankedCount: averages.length,
          classAverage: averages.length
            ? averages.reduce((sum, value) => sum + value, 0) / averages.length
            : null,
          highestAverage: averages.length ? Math.max(...averages) : null,
          lowestAverage: averages.length ? Math.min(...averages) : null,
          subjectAverages: Object.fromEntries(
            [...subjectTotals].map(([subjectId, total]) => [subjectId, total.sum / total.count]),
          ),
        },
      );
      return { content, fileName: reportCardFileName(card) };
    },
  };
}
export type ReportCardsService = ReturnType<typeof createReportCardsService>;
