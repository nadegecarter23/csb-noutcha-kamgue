import { Prisma } from '@prisma/client';
import type { Redis } from 'ioredis';
import type { ReportCriteria } from '@cplan/contracts';
import type { Database } from '../../platform/db.js';
import type { AuditService } from '../../platform/audit.js';
import { AuditAction } from '../../platform/audit.js';
import { errors } from '../../platform/errors.js';
import { withSchoolScope } from '../../platform/school-scope.js';

type MoneyRow = { total_due: bigint; total_paid: bigint; balance: bigint; students: bigint };
const number = (value: bigint | number | null | undefined) => Number(value ?? 0);
const metrics = (row?: MoneyRow) => ({
  students: number(row?.students),
  expected: number(row?.total_due),
  collected: number(row?.total_paid),
  balance: number(row?.balance),
  collectionRate: number(row?.total_due)
    ? Math.round((number(row?.total_paid) * 10_000) / number(row?.total_due)) / 100
    : 0,
});

export function createReportingService(db: Database, redis: Redis | null, audit: AuditService) {
  async function cached<T>(key: string, loader: () => Promise<T>): Promise<T> {
    if (redis?.status === 'ready') {
      const found = await redis.get(key).catch(() => null);
      if (found) return JSON.parse(found) as T;
    }
    const value = await loader();
    if (redis?.status === 'ready')
      await redis.set(key, JSON.stringify(value), 'EX', 60).catch(() => undefined);
    return value;
  }

  async function resolveYear(schoolId: string, requested?: string) {
    if (requested) return requested;
    const year = await withSchoolScope(db, schoolId, (tx) =>
      tx.academicYear.findFirst({ where: { schoolId, isCurrent: true }, select: { id: true } }),
    );
    if (!year) throw errors.validation('Aucune année scolaire courante.');
    return year.id;
  }

  async function summary(schoolId: string, academicYearId: string) {
    return withSchoolScope(db, schoolId, async (tx) => {
      const [row] = await tx.$queryRaw<MoneyRow[]>`
        SELECT COUNT(*)::bigint students, COALESCE(SUM(total_due),0)::bigint total_due,
          COALESCE(SUM(total_paid),0)::bigint total_paid, COALESCE(SUM(balance),0)::bigint balance
        FROM v_enrollment_balance b JOIN enrollments e ON e.id=b.enrollment_id
        WHERE b.school_id=${schoolId}::uuid AND b.academic_year_id=${academicYearId}::uuid AND e.status='ACTIVE'`;
      return metrics(row);
    });
  }

  async function classPaymentStatus(schoolId: string, classId: string, situation?: string) {
    return withSchoolScope(db, schoolId, async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{
          enrollment_id: string;
          student_id: string;
          student_number: string;
          first_name: string;
          last_name: string;
          class_name: string;
          total_due: bigint;
          total_paid: bigint;
          balance: bigint;
          situation: string;
        }>
      >(Prisma.sql`
        WITH status_rows AS (
          SELECT b.*, s.student_number, s.first_name, s.last_name, c.name class_name,
            CASE
              WHEN EXISTS (SELECT 1 FROM student_fee_assignments a JOIN student_fee_installments i ON i.student_fee_assignment_id=a.id WHERE a.enrollment_id=b.enrollment_id AND a.status<>'CANCELLED' AND i.due_date < (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Douala')::date AND i.paid_amount < i.amount) THEN 'OVERDUE'
              WHEN b.total_paid=0 THEN 'UNPAID'
              WHEN b.balance=0 OR NOT EXISTS (SELECT 1 FROM student_fee_assignments a JOIN student_fee_installments i ON i.student_fee_assignment_id=a.id WHERE a.enrollment_id=b.enrollment_id AND a.status<>'CANCELLED' AND i.due_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Douala')::date AND i.paid_amount < i.amount) THEN 'ON_TRACK'
              ELSE 'PARTIAL' END situation
          FROM v_enrollment_balance b JOIN enrollments e ON e.id=b.enrollment_id JOIN students s ON s.id=b.student_id JOIN classes c ON c.id=b.class_id
          WHERE b.school_id=${schoolId}::uuid AND b.class_id=${classId}::uuid AND e.status='ACTIVE'
        ) SELECT * FROM status_rows ${situation ? Prisma.sql`WHERE situation=${situation}` : Prisma.empty} ORDER BY last_name,first_name`);
      const totals = rows.reduce(
        (acc, row) => ({
          expected: acc.expected + number(row.total_due),
          collected: acc.collected + number(row.total_paid),
          balance: acc.balance + number(row.balance),
        }),
        { expected: 0, collected: 0, balance: 0 },
      );
      return {
        data: rows.map((r) => ({
          enrollmentId: r.enrollment_id,
          studentId: r.student_id,
          studentNumber: r.student_number,
          studentName: `${r.last_name} ${r.first_name}`,
          className: r.class_name,
          expected: number(r.total_due),
          collected: number(r.total_paid),
          balance: number(r.balance),
          situation: r.situation,
        })),
        totals: {
          ...totals,
          students: rows.length,
          collectionRate: totals.expected
            ? Math.round((totals.collected * 10_000) / totals.expected) / 100
            : 0,
        },
      };
    });
  }

  async function collection(
    schoolId: string,
    academicYearId: string,
    dimension: 'class' | 'level',
    gradeLevelId?: string,
  ) {
    return withSchoolScope(db, schoolId, async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          name: string;
          students: bigint;
          total_due: bigint;
          total_paid: bigint;
          balance: bigint;
        }>
      >(Prisma.sql`
        SELECT ${dimension === 'class' ? Prisma.sql`c.id,c.name` : Prisma.sql`g.id,g.name`}, COUNT(*)::bigint students,
          COALESCE(SUM(b.total_due),0)::bigint total_due, COALESCE(SUM(b.total_paid),0)::bigint total_paid, COALESCE(SUM(b.balance),0)::bigint balance
        FROM v_enrollment_balance b JOIN enrollments e ON e.id=b.enrollment_id JOIN classes c ON c.id=b.class_id JOIN grade_levels g ON g.id=c.grade_level_id
        WHERE b.school_id=${schoolId}::uuid AND b.academic_year_id=${academicYearId}::uuid AND e.status='ACTIVE'
          ${gradeLevelId ? Prisma.sql`AND g.id=${gradeLevelId}::uuid` : Prisma.empty}
        GROUP BY ${dimension === 'class' ? Prisma.sql`c.id,c.name` : Prisma.sql`g.id,g.name,g.order_index`}
        ORDER BY ${dimension === 'class' ? Prisma.sql`c.name` : Prisma.sql`g.order_index`}`);
      return rows.map((r) => ({ id: r.id, name: r.name, ...metrics(r) }));
    });
  }

  async function trends(
    schoolId: string,
    academicYearId: string,
    granularity: 'day' | 'week' | 'month',
  ) {
    return withSchoolScope(db, schoolId, async (tx) => {
      const rows = await tx.$queryRaw<Array<{ period: Date; amount: bigint }>>(Prisma.sql`
        SELECT date_trunc(${granularity},p.paid_at AT TIME ZONE 'Africa/Douala') period,COALESCE(SUM(pa.amount),0)::bigint amount
        FROM payment_allocations pa JOIN payments p ON p.id=pa.payment_id JOIN enrollments e ON e.id=pa.enrollment_id
        WHERE pa.school_id=${schoolId}::uuid AND e.academic_year_id=${academicYearId}::uuid AND p.status IN ('SUCCESS','REVERSED') AND p.paid_at IS NOT NULL
        GROUP BY 1 ORDER BY 1`);
      return rows.map((r) => ({ period: r.period.toISOString(), amount: number(r.amount) }));
    });
  }

  async function paymentMethods(schoolId: string, from?: string, to?: string) {
    return withSchoolScope(db, schoolId, async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ payment_method: string; provider: string | null; count: bigint; amount: bigint }>
      >(Prisma.sql`
        SELECT payment_method,provider,COUNT(*)::bigint count,COALESCE(SUM(amount),0)::bigint amount FROM payments
        WHERE school_id=${schoolId}::uuid AND status IN ('SUCCESS','REVERSED')
          ${from ? Prisma.sql`AND paid_at>=${new Date(from)}` : Prisma.empty} ${to ? Prisma.sql`AND paid_at<=${new Date(to)}` : Prisma.empty}
        GROUP BY payment_method,provider ORDER BY amount DESC`);
      return rows.map((r) => ({
        method: r.payment_method,
        provider: r.provider,
        count: number(r.count),
        amount: number(r.amount),
      }));
    });
  }

  async function outstanding(
    schoolId: string,
    input: {
      min_amount?: number | undefined;
      class_id?: string | undefined;
      grade_level_id?: string | undefined;
      academic_year_id?: string | undefined;
    },
  ) {
    const year = await resolveYear(schoolId, input.academic_year_id);
    return withSchoolScope(db, schoolId, async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{
          enrollment_id: string;
          student_id: string;
          student_number: string;
          first_name: string;
          last_name: string;
          class_name: string;
          balance: bigint;
          guardian_name: string | null;
          guardian_phone: string | null;
        }>
      >(Prisma.sql`
        SELECT b.enrollment_id,b.student_id,s.student_number,s.first_name,s.last_name,c.name class_name,b.balance,
          CONCAT(g.last_name,' ',g.first_name) guardian_name,g.phone guardian_phone
        FROM v_enrollment_balance b JOIN enrollments e ON e.id=b.enrollment_id JOIN students s ON s.id=b.student_id
        LEFT JOIN classes c ON c.id=b.class_id LEFT JOIN grade_levels gl ON gl.id=c.grade_level_id
        LEFT JOIN LATERAL (SELECT g.* FROM student_guardians sg JOIN guardians g ON g.id=sg.guardian_id WHERE sg.student_id=s.id AND sg.status='ACCEPTED' ORDER BY sg.is_primary DESC,sg.is_financial_responsible DESC LIMIT 1) g ON true
        WHERE b.school_id=${schoolId}::uuid AND b.academic_year_id=${year}::uuid AND e.status='ACTIVE' AND b.balance>${input.min_amount ?? 0}
          ${input.class_id ? Prisma.sql`AND c.id=${input.class_id}::uuid` : Prisma.empty} ${input.grade_level_id ? Prisma.sql`AND gl.id=${input.grade_level_id}::uuid` : Prisma.empty}
        ORDER BY b.balance DESC,s.last_name,s.first_name`);
      return rows.map((r) => ({
        enrollmentId: r.enrollment_id,
        studentId: r.student_id,
        studentNumber: r.student_number,
        studentName: `${r.last_name} ${r.first_name}`,
        className: r.class_name,
        balance: number(r.balance),
        guardianName: r.guardian_name,
        guardianPhone: r.guardian_phone,
      }));
    });
  }

  async function installmentStatus(schoolId: string, order: number, status?: string) {
    return withSchoolScope(db, schoolId, async (tx) => {
      const rows = await tx.studentFeeInstallment.findMany({
        where: {
          orderIndex: order,
          ...(status ? { status: status as never } : {}),
          assignment: { schoolId },
        },
        include: {
          assignment: { include: { enrollment: { include: { student: true, class: true } } } },
        },
        orderBy: { dueDate: 'asc' },
      });
      return rows.map((r) => ({
        id: r.id,
        enrollmentId: r.assignment.enrollmentId,
        studentName: `${r.assignment.enrollment.student.lastName} ${r.assignment.enrollment.student.firstName}`,
        className: r.assignment.enrollment.class?.name ?? '',
        name: r.name,
        orderIndex: r.orderIndex,
        dueDate: r.dueDate.toISOString().slice(0, 10),
        amount: number(r.amount),
        paidAmount: number(r.paidAmount),
        status: r.status,
      }));
    });
  }

  async function customQuery(
    schoolId: string,
    input: { preset?: number | undefined; criteria: ReportCriteria; preview: boolean },
  ) {
    const criteria = { ...input.criteria };
    if (input.preset === 1) criteria.situation = 'UNPAID';
    if (input.preset === 2) criteria.situation = 'ON_TRACK';
    if (input.preset === 5) criteria.min_amount = criteria.min_amount ?? 100000;
    if (input.preset === 6) criteria.provider = 'ORANGE_MONEY';
    if (input.preset === 7) criteria.payment_method = 'MOBILE_MONEY';
    if (input.preset === 8) criteria.status = 'REJECTED';
    if (input.preset === 9) criteria.status = 'AWAITING_VALIDATION';
    if (input.preset === 3 || input.preset === 4)
      return installmentStatus(
        schoolId,
        input.preset === 3 ? 0 : 1,
        input.preset === 3 ? 'PAID' : undefined,
      );
    if (criteria.status || criteria.payment_method || criteria.provider) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const rows = await tx.payment.findMany({
          where: {
            schoolId,
            ...(criteria.status ? { status: criteria.status as never } : {}),
            ...(criteria.payment_method ? { paymentMethod: criteria.payment_method as never } : {}),
            ...(criteria.provider ? { provider: criteria.provider } : {}),
          },
          select: {
            id: true,
            reference: true,
            amount: true,
            status: true,
            paymentMethod: true,
            provider: true,
            paidAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: input.preview ? 1 : 1000,
        });
        return input.preview
          ? {
              count: await tx.payment.count({
                where: {
                  schoolId,
                  ...(criteria.status ? { status: criteria.status as never } : {}),
                  ...(criteria.payment_method
                    ? { paymentMethod: criteria.payment_method as never }
                    : {}),
                  ...(criteria.provider ? { provider: criteria.provider } : {}),
                },
              }),
            }
          : rows.map((r) => ({ ...r, amount: number(r.amount) }));
      });
    }
    const rows = criteria.class_id
      ? (await classPaymentStatus(schoolId, criteria.class_id, criteria.situation)).data
      : await outstanding(schoolId, criteria);
    return input.preview ? { count: rows.length } : rows;
  }

  return {
    resolveYear,
    summary,
    classPaymentStatus,
    collection,
    trends,
    paymentMethods,
    outstanding,
    installmentStatus,
    customQuery,
    async accountantDashboard(schoolId: string, yearId?: string) {
      const year = await resolveYear(schoolId, yearId);
      return cached(`report:accountant:${schoolId}:${year}`, async () => {
        const [base, trend, methods, queues] = await Promise.all([
          summary(schoolId, year),
          trends(schoolId, year, 'day'),
          paymentMethods(schoolId),
          withSchoolScope(db, schoolId, async (tx) => {
            const today = await tx.$queryRaw<
              Array<{ amount: bigint }>
            >`SELECT COALESCE(SUM(amount),0)::bigint amount FROM payments WHERE school_id=${schoolId}::uuid AND status IN ('SUCCESS','REVERSED') AND (paid_at AT TIME ZONE 'Africa/Douala')::date=(CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Douala')::date`;
            const awaiting = await tx.payment.count({
              where: { schoolId, status: 'AWAITING_VALIDATION' },
            });
            const settings = await tx.schoolSettings.findUnique({ where: { schoolId } });
            const overdue = await tx.payment.count({
              where: {
                schoolId,
                status: 'AWAITING_VALIDATION',
                createdAt: {
                  lt: new Date(Date.now() - (settings?.externalPaymentSlaHours ?? 48) * 3600000),
                },
              },
            });
            return {
              paymentsToday: number(today[0]?.amount),
              awaitingValidation: awaiting,
              overdueValidation: overdue,
            };
          }),
        ]);
        return { ...base, ...queues, trends: trend.slice(-30), methods };
      });
    },
    async directorDashboard(schoolId: string, yearId?: string) {
      const year = await resolveYear(schoolId, yearId);
      return cached(`report:director:${schoolId}:${year}`, async () => {
        const [base, byLevel, byClass, trend] = await Promise.all([
          summary(schoolId, year),
          collection(schoolId, year, 'level'),
          collection(schoolId, year, 'class'),
          trends(schoolId, year, 'month'),
        ]);
        const average = base.collectionRate;
        return {
          ...base,
          byLevel,
          byClass: byClass.map((r) => ({ ...r, warning: r.collectionRate < average - 10 })),
          trends: trend,
        };
      });
    },
    async saveQuery(
      schoolId: string,
      userId: string,
      input: { name: string; criteria: ReportCriteria },
    ) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const row = await tx.savedReportQuery.create({
          data: {
            schoolId,
            userId,
            name: input.name,
            criteria: input.criteria as Prisma.InputJsonValue,
          },
        });
        await audit.log(
          {
            action: AuditAction.SAVED_REPORT_QUERY_CREATED,
            entityType: 'SavedReportQuery',
            entityId: row.id,
            schoolId,
            userId,
            after: { name: row.name, criteria: input.criteria },
          },
          tx,
        );
        return {
          ...row,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        };
      });
    },
    async savedQueries(schoolId: string, userId: string) {
      return withSchoolScope(db, schoolId, async (tx) =>
        (
          await tx.savedReportQuery.findMany({
            where: { schoolId, userId },
            orderBy: { updatedAt: 'desc' },
          })
        ).map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        })),
      );
    },
    async search(schoolId: string, q: string, types: string[]) {
      return withSchoolScope(db, schoolId, async (tx) => {
        const needle = `%${q}%`;
        const wants = (t: string) => !types.length || types.includes(t);
        const [students, guardians, payments, receipts] = await Promise.all([
          wants('students')
            ? tx.$queryRaw<
                Array<{ id: string; label: string; subtitle: string }>
              >`SELECT id,CONCAT(last_name,' ',first_name) label,student_number subtitle FROM students WHERE school_id=${schoolId}::uuid AND (last_name ILIKE ${needle} OR first_name ILIKE ${needle} OR student_number ILIKE ${needle}) ORDER BY last_name LIMIT 8`
            : [],
          wants('guardians')
            ? tx.$queryRaw<
                Array<{ id: string; label: string; subtitle: string }>
              >`SELECT id,CONCAT(last_name,' ',first_name) label,phone subtitle FROM guardians WHERE school_id=${schoolId}::uuid AND (last_name ILIKE ${needle} OR first_name ILIKE ${needle} OR phone ILIKE ${needle}) ORDER BY last_name LIMIT 8`
            : [],
          wants('payments')
            ? tx.$queryRaw<
                Array<{ id: string; label: string; subtitle: string }>
              >`SELECT id,reference label,COALESCE(provider_reference,'Paiement') subtitle FROM payments WHERE school_id=${schoolId}::uuid AND (reference ILIKE ${needle} OR provider_reference ILIKE ${needle} OR external_reference ILIKE ${needle}) ORDER BY created_at DESC LIMIT 8`
            : [],
          wants('receipts')
            ? tx.$queryRaw<
                Array<{ id: string; label: string; subtitle: string }>
              >`SELECT id,receipt_number label,'Reçu' subtitle FROM receipts WHERE school_id=${schoolId}::uuid AND receipt_number ILIKE ${needle} ORDER BY issued_at DESC LIMIT 8`
            : [],
        ]);
        return { students, guardians, payments, receipts };
      });
    },
  };
}
export type ReportingService = ReturnType<typeof createReportingService>;
