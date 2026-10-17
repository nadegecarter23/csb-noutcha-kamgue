import { Prisma } from '@prisma/client';
import type { ParentAcademicsDto } from '@cplan/contracts';
import type { Database } from '../../platform/db.js';
import { errors } from '../../platform/errors.js';
import { withPlatformScope } from '../../platform/school-scope.js';
import type { PaymentsService } from '../finance/payments.service.js';
import type { ReportCardsService } from '../report-cards/report-cards.service.js';

const n = (value: bigint | null | undefined) => Number(value ?? 0n);
// Notes, barèmes et moyennes sont stockés en centièmes de point.
const points = (value: number | null) => (value === null ? null : value / 100);
const day = (value: Date) => value.toISOString().slice(0, 10);
const balance = (row?: { total_due: bigint; total_paid: bigint; balance: bigint }) => ({
  totalDue: n(row?.total_due),
  totalPaid: n(row?.total_paid),
  balance: n(row?.balance),
});
const parentPaymentInclude = {
  receipt: true,
  allocations: { include: { student: true } },
} satisfies Prisma.PaymentInclude;
type ParentPaymentRow = Prisma.PaymentGetPayload<{ include: typeof parentPaymentInclude }>;

export function createParentService(
  db: Database,
  payments: PaymentsService,
  reportCards: ReportCardsService,
) {
  async function accepted(userId: string, studentId?: string, finances = false) {
    return withPlatformScope(db, (tx) =>
      tx.studentGuardian.findFirst({
        where: {
          ...(studentId ? { studentId } : {}),
          status: 'ACCEPTED',
          ...(finances ? { canViewFinances: true } : {}),
          guardian: { userId, status: 'ACTIVE' },
          student: { status: { not: 'ARCHIVED' } },
        },
        include: {
          student: {
            include: {
              school: true,
              enrollments: {
                include: { academicYear: true, class: true },
                orderBy: { enrollmentDate: 'desc' },
              },
            },
          },
        },
      }),
    );
  }
  const paymentView = (row: ParentPaymentRow) => ({
    id: row.id,
    reference: row.reference,
    amount: n(row.amount),
    method: row.paymentMethod,
    status: row.status,
    paidAt: row.paidAt?.toISOString() ?? null,
    studentNames: [
      ...new Set(row.allocations.map((a) => `${a.student.firstName} ${a.student.lastName}`)),
    ],
    receiptId: row.receipt?.id ?? null,
    payerLabel: 'Payeur autorisé' as const,
  });
  return {
    async schools() {
      return withPlatformScope(db, async (tx) =>
        (
          await tx.school.findMany({
            where: { status: 'ACTIVE' },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          })
        ).map((school) => ({ id: school.id, name: school.name })),
      );
    },
    async dashboard(userId: string) {
      return withPlatformScope(db, async (tx) => {
        const links = await tx.studentGuardian.findMany({
          where: {
            status: 'ACCEPTED',
            guardian: { userId, status: 'ACTIVE' },
            student: { status: { not: 'ARCHIVED' } },
          },
          include: {
            student: {
              include: {
                school: true,
                enrollments: {
                  where: { academicYear: { isCurrent: true } },
                  include: { class: true },
                  take: 1,
                },
              },
            },
          },
        });
        const enrollmentIds = links.flatMap((l) => l.student.enrollments.map((e) => e.id));
        const rows = enrollmentIds.length
          ? await tx.$queryRaw<
              Array<{
                enrollment_id: string;
                total_due: bigint;
                total_paid: bigint;
                balance: bigint;
              }>
            >`SELECT enrollment_id,total_due,total_paid,balance FROM v_enrollment_balance WHERE enrollment_id IN (${Prisma.join(enrollmentIds.map((id) => Prisma.sql`${id}::uuid`))})`
          : [];
        const byId = new Map(rows.map((r) => [r.enrollment_id, r]));
        const visibleStudentIds = links.filter((l) => l.canViewFinances).map((l) => l.studentId);
        const [recent, unread, upcoming] = await Promise.all([
          visibleStudentIds.length
            ? tx.payment.findMany({
                where: {
                  status: { in: ['SUCCESS', 'REVERSED'] },
                  allocations: { some: { studentId: { in: visibleStudentIds } } },
                },
                include: parentPaymentInclude,
                orderBy: { paidAt: 'desc' },
                take: 10,
              })
            : [],
          tx.notification.count({ where: { userId, readAt: null } }),
          enrollmentIds.length
            ? tx.studentFeeInstallment.findMany({
                where: {
                  assignment: { enrollmentId: { in: enrollmentIds } },
                  status: { in: ['UPCOMING', 'PARTIALLY_PAID', 'OVERDUE'] },
                },
                include: { assignment: { include: { feeStructure: true } } },
                orderBy: { dueDate: 'asc' },
              })
            : [],
        ]);
        const children = links.map((l) => {
          const enrollment = l.student.enrollments[0];
          const b = enrollment ? byId.get(enrollment.id) : undefined;
          const next = enrollment
            ? upcoming.find(
                (i) => i.assignment.enrollmentId === enrollment.id && i.amount > i.paidAmount,
              )
            : undefined;
          return {
            studentId: l.studentId,
            firstName: l.student.firstName,
            lastName: l.student.lastName,
            studentNumber: l.student.studentNumber,
            schoolId: l.student.schoolId,
            schoolName: l.student.school.name,
            className: enrollment?.class?.name ?? null,
            canViewFinances: l.canViewFinances,
            canPay: l.canPay,
            balance: l.canViewFinances ? balance(b) : null,
            nextInstallment:
              l.canViewFinances && next
                ? {
                    label: `${next.assignment.feeStructure.name} ${next.name}`,
                    amount: n(next.amount - next.paidAmount),
                    dueDate: next.dueDate.toISOString().slice(0, 10),
                  }
                : null,
          };
        });
        const totals = children.reduce(
          (sum, c) => ({
            totalDue: sum.totalDue + (c.balance?.totalDue ?? 0),
            totalPaid: sum.totalPaid + (c.balance?.totalPaid ?? 0),
            balance: sum.balance + (c.balance?.balance ?? 0),
          }),
          { totalDue: 0, totalPaid: 0, balance: 0 },
        );
        return {
          children,
          totals,
          recentPayments: recent.map(paymentView),
          unreadNotifications: unread,
        };
      });
    },
    async child(userId: string, studentId: string) {
      const link = await accepted(userId, studentId);
      if (!link) throw errors.notFound('Enfant introuvable.');
      return withPlatformScope(db, async (tx) => {
        const ids = link.student.enrollments.map((e) => e.id);
        const rows = ids.length
          ? await tx.$queryRaw<
              Array<{
                enrollment_id: string;
                total_due: bigint;
                total_paid: bigint;
                balance: bigint;
              }>
            >`SELECT enrollment_id,total_due,total_paid,balance FROM v_enrollment_balance WHERE enrollment_id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})`
          : [];
        const byId = new Map(rows.map((r) => [r.enrollment_id, r]));
        const current = link.student.enrollments.find((e) => e.academicYear.isCurrent);
        return {
          studentId,
          firstName: link.student.firstName,
          lastName: link.student.lastName,
          studentNumber: link.student.studentNumber,
          schoolId: link.student.schoolId,
          schoolName: link.student.school.name,
          className: current?.class?.name ?? null,
          canViewFinances: link.canViewFinances,
          canPay: link.canPay,
          balance: link.canViewFinances && current ? balance(byId.get(current.id)) : null,
          nextInstallment: null,
          enrollments: link.student.enrollments.map((e) => ({
            id: e.id,
            academicYear: e.academicYear.name,
            className: e.class?.name ?? null,
            isCurrent: e.academicYear.isCurrent,
            balance: link.canViewFinances ? balance(byId.get(e.id)) : balance(),
          })),
        };
      });
    },
    /**
     * Scolarité de l'enfant : bulletins publiés, notes des évaluations publiées
     * et présences des séances validées. Rien de ce qui est encore en brouillon
     * côté école n'est montré aux familles.
     */
    async academics(userId: string, studentId: string): Promise<ParentAcademicsDto> {
      const link = await accepted(userId, studentId);
      if (!link) throw errors.notFound('Enfant introuvable.');
      const enrollments = link.student.enrollments;
      const current = enrollments.find((e) => e.academicYear.isCurrent) ?? null;
      return withPlatformScope(db, async (tx) => {
        const [cards, grades, records] = await Promise.all([
          enrollments.length
            ? tx.reportCard.findMany({
                where: {
                  enrollmentId: { in: enrollments.map((e) => e.id) },
                  status: 'PUBLISHED',
                },
                include: { period: true },
                orderBy: { publishedAt: 'desc' },
              })
            : [],
          current
            ? tx.grade.findMany({
                where: {
                  enrollmentId: current.id,
                  assessment: { status: { in: ['PUBLISHED', 'LOCKED'] } },
                },
                include: {
                  assessment: {
                    include: { period: true, teachingAssignment: { include: { subject: true } } },
                  },
                },
                orderBy: { assessment: { date: 'desc' } },
                take: 100,
              })
            : [],
          current
            ? tx.attendanceRecord.findMany({
                where: { enrollmentId: current.id, session: { status: 'VALIDATED' } },
                include: {
                  session: {
                    include: {
                      timetableEntry: {
                        include: { teachingAssignment: { include: { subject: true } } },
                      },
                    },
                  },
                },
                orderBy: { session: { date: 'desc' } },
              })
            : [],
        ]);
        const enrollmentById = new Map(enrollments.map((e) => [e.id, e]));
        const rankedCounts = await Promise.all(
          cards.map((card) => {
            const classId = enrollmentById.get(card.enrollmentId)?.classId;
            return classId
              ? tx.reportCard.count({
                  where: {
                    periodId: card.periodId,
                    status: 'PUBLISHED',
                    overallAverage: { not: null },
                    enrollment: { classId },
                  },
                })
              : Promise.resolve(0);
          }),
        );
        const count = (mark: string) => records.filter((r) => r.mark === mark).length;
        const present = count('PRESENT'),
          late = count('LATE'),
          absent = count('ABSENT'),
          excused = count('EXCUSED');
        return {
          academicYear: current?.academicYear.name ?? null,
          className: current?.class?.name ?? null,
          attendance: {
            sessions: records.length,
            present,
            late,
            absent,
            excused,
            rate: records.length
              ? Math.round(((present + late) * 10000) / records.length) / 100
              : null,
            unjustifiedAbsences: records.filter(
              (r) => r.mark === 'ABSENT' && r.justificationStatus !== 'ACCEPTED',
            ).length,
            events: records
              .filter((r) => r.mark !== 'PRESENT')
              .slice(0, 30)
              .map((r) => ({
                id: r.id,
                date: day(r.session.date),
                mark: r.mark as 'ABSENT' | 'LATE' | 'EXCUSED',
                minutesLate: r.minutesLate,
                subjectName: r.session.timetableEntry.teachingAssignment.subject.name,
                justificationStatus: r.justificationStatus,
              })),
          },
          grades: grades.map((grade) => {
            const score = grade.isAbsent ? null : points(grade.score);
            const maxScore = grade.assessment.maxScore / 100;
            return {
              id: grade.id,
              date: day(grade.assessment.date),
              title: grade.assessment.title,
              subjectName: grade.assessment.teachingAssignment.subject.name,
              periodName: grade.assessment.period.name,
              score,
              maxScore,
              scoreOn20: score === null ? null : Math.round((score / maxScore) * 2000) / 100,
              isAbsent: grade.isAbsent,
              comment: grade.comment,
            };
          }),
          reportCards: cards.map((card, index) => {
            const enrollment = enrollmentById.get(card.enrollmentId);
            return {
              id: card.id,
              academicYear: enrollment?.academicYear.name ?? '',
              periodName: card.period.name,
              className: enrollment?.class?.name ?? null,
              overallAverage: points(card.overallAverage),
              rank: card.rank,
              rankedCount: rankedCounts[index] ?? 0,
              decision: card.decision,
              publishedAt: (card.publishedAt ?? card.updatedAt).toISOString(),
            };
          }),
        };
      });
    },
    /** Bulletin PDF d'un enfant, uniquement lorsqu'il est publié. */
    async reportCardPdf(userId: string, reportCardId: string) {
      const card = await withPlatformScope(db, (tx) =>
        tx.reportCard.findUnique({
          where: { id: reportCardId },
          select: { schoolId: true, status: true, enrollment: { select: { studentId: true } } },
        }),
      );
      // Même réponse pour un bulletin inexistant, non publié ou d'un autre
      // enfant : on ne révèle pas son existence.
      if (
        !card ||
        card.status !== 'PUBLISHED' ||
        !(await accepted(userId, card.enrollment.studentId))
      )
        throw errors.notFound('Bulletin introuvable.');
      return reportCards.pdf(card.schoolId, reportCardId, { trusted: true });
    },
    async statement(userId: string, enrollmentId: string) {
      const enrollment = await withPlatformScope(db, (tx) =>
        tx.enrollment.findUnique({
          where: { id: enrollmentId },
          select: { studentId: true, schoolId: true },
        }),
      );
      if (!enrollment || !(await accepted(userId, enrollment.studentId, true)))
        throw errors.notFound('Relevé introuvable.');
      return payments.statement(enrollment.schoolId, enrollmentId);
    },
    async listPayments(userId: string, studentId?: string) {
      const links = await withPlatformScope(db, (tx) =>
        tx.studentGuardian.findMany({
          where: {
            status: 'ACCEPTED',
            canViewFinances: true,
            ...(studentId ? { studentId } : {}),
            guardian: { userId, status: 'ACTIVE' },
          },
          select: { studentId: true },
        }),
      );
      const ids = links.map((l) => l.studentId);
      if (studentId && !ids.length) throw errors.notFound('Paiements introuvables.');
      if (!ids.length) return [];
      return withPlatformScope(db, async (tx) =>
        (
          await tx.payment.findMany({
            where: { allocations: { some: { studentId: { in: ids } } } },
            include: parentPaymentInclude,
            orderBy: { initiatedAt: 'desc' },
            take: 100,
          })
        ).map(paymentView),
      );
    },
    async receiptPdf(userId: string, receiptId: string) {
      const row = await withPlatformScope(db, (tx) =>
        tx.receipt.findUnique({
          where: { id: receiptId },
          include: { payment: { include: { allocations: true } } },
        }),
      );
      if (!row) throw errors.notFound('Reçu introuvable.');
      const ids = [...new Set(row.payment.allocations.map((a) => a.studentId))];
      const allowed = await withPlatformScope(db, (tx) =>
        tx.studentGuardian.count({
          where: {
            studentId: { in: ids },
            status: 'ACCEPTED',
            canViewFinances: true,
            guardian: { userId, status: 'ACTIVE' },
          },
        }),
      );
      if (!allowed) throw errors.notFound('Reçu introuvable.');
      return payments.receiptPdf(row.schoolId, receiptId);
    },
    async requests(userId: string) {
      return withPlatformScope(db, async (tx) =>
        (
          await tx.guardianLinkRequest.findMany({
            where: { requestedByUserId: userId },
            include: { school: true },
            orderBy: { createdAt: 'desc' },
          })
        ).map((r) => ({
          id: r.id,
          schoolName: r.school.name,
          studentNumber: r.claimedStudentNumber,
          studentName: r.claimedStudentName,
          status: r.status,
          createdAt: r.createdAt.toISOString(),
        })),
      );
    },
    async notifications(userId: string) {
      return withPlatformScope(db, async (tx) =>
        (
          await tx.notification.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 100,
          })
        ).map((r) => ({
          id: r.id,
          type: r.type,
          title: r.title,
          body: r.body,
          data: r.data as Record<string, unknown>,
          readAt: r.readAt?.toISOString() ?? null,
          createdAt: r.createdAt.toISOString(),
        })),
      );
    },
    async readNotification(userId: string, id: string) {
      return withPlatformScope(db, async (tx) => {
        const updated = await tx.notification.updateMany({
          where: { id, userId },
          data: { readAt: new Date() },
        });
        if (!updated.count) throw errors.notFound('Notification introuvable.');
      });
    },
    async registerDevice(
      userId: string,
      input: {
        pushToken: string;
        platform: 'ANDROID' | 'IOS' | 'WEB';
        deviceLabel?: string | undefined;
      },
    ) {
      return withPlatformScope(db, async (tx) => {
        const row = await tx.device.upsert({
          where: { pushToken: input.pushToken },
          create: {
            userId,
            pushToken: input.pushToken,
            platform: input.platform,
            deviceLabel: input.deviceLabel ?? null,
          },
          update: {
            userId,
            platform: input.platform,
            deviceLabel: input.deviceLabel ?? null,
            status: 'ACTIVE',
            lastSeenAt: new Date(),
          },
        });
        return {
          id: row.id,
          platform: row.platform,
          deviceLabel: row.deviceLabel,
          status: row.status,
          lastSeenAt: row.lastSeenAt.toISOString(),
        };
      });
    },
    async devices(userId: string) {
      return withPlatformScope(db, async (tx) =>
        (await tx.device.findMany({ where: { userId }, orderBy: { lastSeenAt: 'desc' } })).map(
          (r) => ({
            id: r.id,
            platform: r.platform,
            deviceLabel: r.deviceLabel,
            status: r.status,
            lastSeenAt: r.lastSeenAt.toISOString(),
          }),
        ),
      );
    },
    async revokeDevice(userId: string, id: string) {
      return withPlatformScope(db, async (tx) => {
        const result = await tx.device.updateMany({
          where: { id, userId },
          data: { status: 'REVOKED' },
        });
        if (!result.count) throw errors.notFound('Appareil introuvable.');
      });
    },
  };
}
export type ParentService = ReturnType<typeof createParentService>;
