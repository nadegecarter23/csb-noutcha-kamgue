import type { PlatformDashboardDto } from '@cplan/contracts';
import type { Database } from '../../platform/db.js';
import { withPlatformScope } from '../../platform/school-scope.js';

type UserCountRow = { schoolId: string; count: bigint };
type PaymentCountRow = { schoolId: string; count: bigint; amount: bigint };
type UnitMetricsRow = {
  id: string;
  schoolName: string;
  code: 'CRECHE' | 'MATERNELLE' | 'PRIMAIRE' | 'SECONDAIRE';
  name: string;
  students: bigint;
  capacity: bigint;
  presentRecords: bigint;
  attendanceRecords: bigint;
  expectedAmount: bigint;
  collectedAmount: bigint;
  classCount: bigint;
  configuredClasses: bigint;
  coveredClasses: bigint;
  feeCoveredEnrollments: bigint;
  guardianCoveredEnrollments: bigint;
  overdueInstallments: bigint;
};

const rate = (value: number, total: number) =>
  total > 0 ? Math.round((value / total) * 1_000) / 10 : 0;
const observedRate = (value: number, total: number) => (total > 0 ? rate(value, total) : null);

export function createPlatformService(db: Database) {
  return {
    async dashboard(): Promise<PlatformDashboardDto> {
      return withPlatformScope(db, async (tx) => {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1_000);
        const [
          schools,
          userCounts,
          studentCounts,
          staffCounts,
          paymentCounts,
          activityCounts,
          totalUsers,
          activeSessions,
          activity24h,
          recentActivity,
          academicYears,
          unitMetrics,
          investigationPayments,
          seriousIncidents,
          openCashSessions,
        ] = await Promise.all([
          tx.school.findMany({
            select: { id: true, code: true, name: true, status: true },
            orderBy: [{ status: 'asc' }, { name: 'asc' }],
          }),
          tx.$queryRaw<UserCountRow[]>`
            SELECT school_id AS "schoolId", COUNT(DISTINCT user_id)::bigint AS count
            FROM user_roles
            WHERE school_id IS NOT NULL
            GROUP BY school_id
          `,
          tx.student.groupBy({
            by: ['schoolId'],
            where: { status: 'ACTIVE' },
            _count: { _all: true },
          }),
          tx.staffProfile.groupBy({
            by: ['schoolId'],
            where: { status: { in: ['ACTIVE', 'ON_LEAVE'] } },
            _count: { _all: true },
          }),
          tx.$queryRaw<PaymentCountRow[]>`
            SELECT school_id AS "schoolId", COUNT(*)::bigint AS count,
                   COALESCE(SUM(amount), 0)::bigint AS amount
            FROM payments
            WHERE status = 'SUCCESS'
            GROUP BY school_id
          `,
          tx.auditLog.groupBy({
            by: ['schoolId'],
            where: { schoolId: { not: null } },
            _max: { createdAt: true },
          }),
          tx.user.count(),
          tx.session.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
          tx.auditLog.count({ where: { createdAt: { gte: since } } }),
          tx.auditLog.findMany({
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: {
              id: true,
              action: true,
              entityType: true,
              createdAt: true,
              school: { select: { name: true } },
              user: { select: { firstName: true, lastName: true } },
            },
          }),
          tx.academicYear.findMany({
            where: { isCurrent: true },
            orderBy: { startDate: 'desc' },
            select: { name: true },
          }),
          tx.$queryRaw<UnitMetricsRow[]>`
            WITH current_years AS (
              SELECT id, school_id FROM academic_years WHERE is_current = true
            ),
            class_stats AS (
              SELECT c.organizational_unit_id,
                     COUNT(*)::bigint AS class_count,
                     COUNT(*) FILTER (
                       WHERE c.grade_level_id IS NOT NULL
                         AND c.language_section_id IS NOT NULL
                     )::bigint AS configured_classes,
                     COALESCE(SUM(c.capacity), 0)::bigint AS capacity
              FROM classes c
              JOIN current_years ay ON ay.id = c.academic_year_id
              WHERE c.status = 'ACTIVE' AND c.organizational_unit_id IS NOT NULL
              GROUP BY c.organizational_unit_id
            ),
            enrollment_stats AS (
              SELECT c.organizational_unit_id,
                     COUNT(e.id)::bigint AS students,
                     COUNT(e.id) FILTER (
                       WHERE EXISTS (
                         SELECT 1 FROM student_guardians sg
                         WHERE sg.student_id = e.student_id AND sg.status = 'ACCEPTED'
                       )
                     )::bigint AS guardian_covered,
                     COUNT(e.id) FILTER (
                       WHERE EXISTS (
                         SELECT 1 FROM student_fee_assignments sfa
                         WHERE sfa.enrollment_id = e.id
                       )
                     )::bigint AS fee_covered
              FROM enrollments e
              JOIN current_years ay ON ay.id = e.academic_year_id
              JOIN classes c ON c.id = e.class_id
              WHERE e.status = 'ACTIVE' AND c.organizational_unit_id IS NOT NULL
              GROUP BY c.organizational_unit_id
            ),
            finance_stats AS (
              SELECT organizational_unit_id,
                     COALESCE(SUM(final_amount), 0)::bigint AS expected_amount,
                     COALESCE(SUM(paid_amount), 0)::bigint AS collected_amount
              FROM student_fee_assignments
              WHERE organizational_unit_id IS NOT NULL
              GROUP BY organizational_unit_id
            ),
            attendance_stats AS (
              SELECT c.organizational_unit_id,
                     COUNT(ar.id)::bigint AS attendance_records,
                     COUNT(ar.id) FILTER (WHERE ar.mark IN ('PRESENT', 'LATE'))::bigint AS present_records
              FROM attendance_records ar
              JOIN attendance_sessions ats ON ats.id = ar.session_id
              JOIN current_years ay ON ay.id = ats.academic_year_id
              JOIN classes c ON c.id = ats.class_id
              WHERE ats.status = 'VALIDATED' AND c.organizational_unit_id IS NOT NULL
              GROUP BY c.organizational_unit_id
            ),
            teaching_stats AS (
              SELECT c.organizational_unit_id,
                     COUNT(DISTINCT ta.class_id)::bigint AS covered_classes
              FROM teaching_assignments ta
              JOIN current_years ay ON ay.id = ta.academic_year_id
              JOIN classes c ON c.id = ta.class_id
              WHERE ta.status IN ('PLANNED', 'ACTIVE') AND c.organizational_unit_id IS NOT NULL
              GROUP BY c.organizational_unit_id
            ),
            overdue_stats AS (
              SELECT sfa.organizational_unit_id,
                     COUNT(sfi.id)::bigint AS overdue_installments
              FROM student_fee_installments sfi
              JOIN student_fee_assignments sfa ON sfa.id = sfi.student_fee_assignment_id
              WHERE sfa.organizational_unit_id IS NOT NULL
                AND sfi.due_date < CURRENT_DATE
                AND sfi.paid_amount < sfi.amount
              GROUP BY sfa.organizational_unit_id
            )
            SELECT ou.id,
                   s.name AS "schoolName",
                   ou.code::text AS code,
                   ou.name,
                   COALESCE(es.students, 0)::bigint AS students,
                   COALESCE(cs.capacity, 0)::bigint AS capacity,
                   COALESCE(ats.present_records, 0)::bigint AS "presentRecords",
                   COALESCE(ats.attendance_records, 0)::bigint AS "attendanceRecords",
                   COALESCE(fs.expected_amount, 0)::bigint AS "expectedAmount",
                   COALESCE(fs.collected_amount, 0)::bigint AS "collectedAmount",
                   COALESCE(cs.class_count, 0)::bigint AS "classCount",
                   COALESCE(cs.configured_classes, 0)::bigint AS "configuredClasses",
                   COALESCE(ts.covered_classes, 0)::bigint AS "coveredClasses",
                   COALESCE(es.fee_covered, 0)::bigint AS "feeCoveredEnrollments",
                   COALESCE(es.guardian_covered, 0)::bigint AS "guardianCoveredEnrollments",
                   COALESCE(os.overdue_installments, 0)::bigint AS "overdueInstallments"
            FROM organizational_units ou
            JOIN schools s ON s.id = ou.school_id
            LEFT JOIN class_stats cs ON cs.organizational_unit_id = ou.id
            LEFT JOIN enrollment_stats es ON es.organizational_unit_id = ou.id
            LEFT JOIN finance_stats fs ON fs.organizational_unit_id = ou.id
            LEFT JOIN attendance_stats ats ON ats.organizational_unit_id = ou.id
            LEFT JOIN teaching_stats ts ON ts.organizational_unit_id = ou.id
            LEFT JOIN overdue_stats os ON os.organizational_unit_id = ou.id
            WHERE ou.status = 'ACTIVE'
            ORDER BY s.name, ou.order_index
          `,
          tx.payment.count({
            where: {
              status: {
                in: ['PENDING_INVESTIGATION', 'AWAITING_VALIDATION', 'CORRECTION_REQUESTED'],
              },
            },
          }),
          tx.studentIncident.count({
            where: { status: 'OPEN', severity: { in: ['HIGH', 'CRITICAL'] } },
          }),
          tx.cashSession.count({ where: { status: 'OPEN' } }),
        ]);

        const usersBySchool = new Map(userCounts.map((row) => [row.schoolId, Number(row.count)]));
        const studentsBySchool = new Map(
          studentCounts.map((row) => [row.schoolId, row._count._all]),
        );
        const staffBySchool = new Map(staffCounts.map((row) => [row.schoolId, row._count._all]));
        const paymentsBySchool = new Map(paymentCounts.map((row) => [row.schoolId, row]));
        const activityBySchool = new Map(
          activityCounts.flatMap((row) =>
            row.schoolId ? [[row.schoolId, row._max.createdAt] as const] : [],
          ),
        );

        const schoolRows = schools.map((school) => {
          const payments = paymentsBySchool.get(school.id);
          return {
            ...school,
            users: usersBySchool.get(school.id) ?? 0,
            students: studentsBySchool.get(school.id) ?? 0,
            staff: staffBySchool.get(school.id) ?? 0,
            confirmedPayments: Number(payments?.count ?? 0),
            collectedAmount: Number(payments?.amount ?? 0),
            lastActivityAt: activityBySchool.get(school.id)?.toISOString() ?? null,
          };
        });

        const units = unitMetrics.map((unit) => {
          const students = Number(unit.students);
          const capacity = Number(unit.capacity);
          const expectedAmount = Number(unit.expectedAmount);
          const collectedAmount = Number(unit.collectedAmount);
          const uncoveredClasses = Math.max(0, Number(unit.classCount - unit.coveredClasses));
          const missingGuardians = Math.max(0, students - Number(unit.guardianCoveredEnrollments));
          return {
            id: unit.id,
            schoolName: unit.schoolName,
            code: unit.code,
            name: unit.name,
            students,
            capacity,
            occupancyRate: rate(students, capacity),
            attendanceRate: observedRate(
              Number(unit.presentRecords),
              Number(unit.attendanceRecords),
            ),
            expectedAmount,
            collectedAmount,
            remainingAmount: Math.max(0, expectedAmount - collectedAmount),
            alerts:
              Number(Number(unit.overdueInstallments) > 0) +
              Number(uncoveredClasses > 0) +
              Number(missingGuardians > 0),
          };
        });

        const totals = unitMetrics.reduce(
          (result, unit) => ({
            students: result.students + Number(unit.students),
            capacity: result.capacity + Number(unit.capacity),
            presentRecords: result.presentRecords + Number(unit.presentRecords),
            attendanceRecords: result.attendanceRecords + Number(unit.attendanceRecords),
            expectedAmount: result.expectedAmount + Number(unit.expectedAmount),
            collectedAmount: result.collectedAmount + Number(unit.collectedAmount),
            classes: result.classes + Number(unit.classCount),
            configuredClasses: result.configuredClasses + Number(unit.configuredClasses),
            coveredClasses: result.coveredClasses + Number(unit.coveredClasses),
            feeCovered: result.feeCovered + Number(unit.feeCoveredEnrollments),
            guardianCovered: result.guardianCovered + Number(unit.guardianCoveredEnrollments),
            overdueInstallments: result.overdueInstallments + Number(unit.overdueInstallments),
          }),
          {
            students: 0,
            capacity: 0,
            presentRecords: 0,
            attendanceRecords: 0,
            expectedAmount: 0,
            collectedAmount: 0,
            classes: 0,
            configuredClasses: 0,
            coveredClasses: 0,
            feeCovered: 0,
            guardianCovered: 0,
            overdueInstallments: 0,
          },
        );
        const missingGuardians = Math.max(0, totals.students - totals.guardianCovered);
        const uncoveredClasses = Math.max(0, totals.classes - totals.coveredClasses);
        const priorityAlerts =
          totals.overdueInstallments +
          missingGuardians +
          uncoveredClasses +
          investigationPayments +
          seriousIncidents +
          openCashSessions;
        const alerts = [
          {
            id: 'overdue-installments',
            severity: 'CRITICAL' as const,
            title: 'Échéances de frais en retard',
            detail: 'Tranches arrivées à échéance et non intégralement réglées.',
            count: totals.overdueInstallments,
            unitName: null,
          },
          {
            id: 'guardian-coverage',
            severity: 'WARNING' as const,
            title: 'Dossiers sans responsable confirmé',
            detail: 'Élèves actifs sans association responsable acceptée.',
            count: missingGuardians,
            unitName: null,
          },
          {
            id: 'teaching-coverage',
            severity: 'WARNING' as const,
            title: 'Classes sans affectation pédagogique',
            detail: 'Classes actives sans matière et enseignant affectés pour l’année courante.',
            count: uncoveredClasses,
            unitName: null,
          },
          {
            id: 'payment-investigations',
            severity: 'CRITICAL' as const,
            title: 'Paiements à examiner',
            detail: 'Paiements en investigation, en validation ou à corriger.',
            count: investigationPayments,
            unitName: null,
          },
          {
            id: 'serious-incidents',
            severity: 'CRITICAL' as const,
            title: 'Incidents scolaires prioritaires',
            detail: 'Incidents graves ou critiques encore ouverts.',
            count: seriousIncidents,
            unitName: null,
          },
          {
            id: 'open-cash-sessions',
            severity: 'INFO' as const,
            title: 'Sessions de caisse ouvertes',
            detail: 'Sessions à surveiller et à clôturer en fin de service.',
            count: openCashSessions,
            unitName: null,
          },
        ].filter((alert) => alert.count > 0);

        return {
          summary: {
            totalSchools: schoolRows.length,
            activeSchools: schoolRows.filter((school) => school.status === 'ACTIVE').length,
            totalUsers,
            activeSessions,
            activeStudents: schoolRows.reduce((sum, school) => sum + school.students, 0),
            confirmedPayments: schoolRows.reduce(
              (sum, school) => sum + school.confirmedPayments,
              0,
            ),
            collectedAmount: schoolRows.reduce((sum, school) => sum + school.collectedAmount, 0),
            expectedAmount: totals.expectedAmount,
            remainingAmount: Math.max(0, totals.expectedAmount - totals.collectedAmount),
            collectionRate: rate(totals.collectedAmount, totals.expectedAmount),
            attendanceRate: observedRate(totals.presentRecords, totals.attendanceRecords),
            totalCapacity: totals.capacity,
            priorityAlerts,
            activity24h,
          },
          academicYear: academicYears[0]?.name ?? null,
          units,
          alerts,
          dataQuality: {
            guardianCoverage: {
              complete: totals.guardianCovered,
              total: totals.students,
              rate: rate(totals.guardianCovered, totals.students),
            },
            classConfiguration: {
              complete: totals.configuredClasses,
              total: totals.classes,
              rate: rate(totals.configuredClasses, totals.classes),
            },
            teachingCoverage: {
              complete: totals.coveredClasses,
              total: totals.classes,
              rate: rate(totals.coveredClasses, totals.classes),
            },
            feeCoverage: {
              complete: totals.feeCovered,
              total: totals.students,
              rate: rate(totals.feeCovered, totals.students),
            },
          },
          schools: schoolRows,
          recentActivity: recentActivity.map((activity) => ({
            id: activity.id,
            action: activity.action,
            entityType: activity.entityType,
            schoolName: activity.school?.name ?? null,
            actorName: activity.user
              ? `${activity.user.firstName} ${activity.user.lastName}`
              : null,
            createdAt: activity.createdAt.toISOString(),
          })),
        };
      });
    },
  };
}

export type PlatformService = ReturnType<typeof createPlatformService>;
