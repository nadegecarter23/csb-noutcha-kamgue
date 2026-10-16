import { Prisma } from '@prisma/client';
import { loadConfig } from '../platform/config.js';
import { createLogger } from '../platform/logger.js';
import { createDatabase } from '../platform/db.js';
import { withPlatformScope } from '../platform/school-scope.js';

async function main() {
  const config = loadConfig();
  const db = createDatabase(config, createLogger(config));
  try {
    const result = await withPlatformScope(db, async (tx) => {
      const [
        schools,
        students,
        enrollments,
        guardians,
        payments,
        duplicateStudents,
        duplicatePayments,
        invalidPhones,
        allocationErrors,
        balances,
        sample,
      ] = await Promise.all([
        tx.school.count(),
        tx.student.count(),
        tx.enrollment.count(),
        tx.guardian.count(),
        tx.payment.count(),
        tx.$queryRaw<Array<{ school_id: string; student_number: string; count: bigint }>>(
          Prisma.sql`SELECT school_id, student_number, count(*) FROM students GROUP BY school_id, student_number HAVING count(*) > 1`,
        ),
        tx.$queryRaw<Array<{ reference: string; count: bigint }>>(
          Prisma.sql`SELECT reference, count(*) FROM payments GROUP BY reference HAVING count(*) > 1`,
        ),
        tx.$queryRaw<Array<{ phone: string }>>(
          Prisma.sql`SELECT phone FROM users WHERE phone !~ '^\\+[1-9][0-9]{7,14}$' UNION SELECT phone FROM guardians WHERE phone !~ '^\\+[1-9][0-9]{7,14}$'`,
        ),
        tx.$queryRaw<Array<{ payment_id: string }>>(
          Prisma.sql`SELECT p.id AS payment_id FROM payments p LEFT JOIN payment_allocations a ON a.payment_id=p.id WHERE p.status='SUCCESS' GROUP BY p.id,p.amount,p.unallocated_amount HAVING coalesce(sum(a.amount),0)+p.unallocated_amount <> p.amount`,
        ),
        tx.$queryRaw<Array<{ total_due: bigint; total_paid: bigint; balance: bigint }>>(
          Prisma.sql`SELECT coalesce(sum(total_due),0) total_due, coalesce(sum(total_paid),0) total_paid, coalesce(sum(balance),0) balance FROM v_enrollment_balance`,
        ),
        tx.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`SELECT id FROM students ORDER BY random() LIMIT 20`,
        ),
      ]);
      const sampleChecks = await Promise.all(
        sample.map(async ({ id }) => {
          const student = await tx.student.findUniqueOrThrow({
            where: { id },
            include: {
              enrollments: { include: { academicYear: true, class: true, feeAssignments: true } },
              guardianLinks: true,
              paymentAllocations: { include: { payment: true } },
            },
          });
          return {
            id,
            studentNumber: student.studentNumber,
            identityComplete: Boolean(student.firstName && student.lastName),
            enrollments: student.enrollments.length,
            verifiedGuardians: student.guardianLinks.filter((link) => link.status === 'ACCEPTED')
              .length,
            successfulTransactions: student.paymentAllocations.filter(
              (allocation) => allocation.payment.status === 'SUCCESS',
            ).length,
          };
        }),
      );
      const totals = balances[0] ?? { total_due: 0n, total_paid: 0n, balance: 0n };
      return {
        counts: { schools, students, enrollments, guardians, payments },
        financial: {
          totalDue: Number(totals.total_due),
          totalPaid: Number(totals.total_paid),
          balance: Number(totals.balance),
        },
        errors: { duplicateStudents, duplicatePayments, invalidPhones, allocationErrors },
        sample: sampleChecks,
      };
    });
    const blocking = Object.values(result.errors).reduce((sum, rows) => sum + rows.length, 0);
    process.stdout.write(
      `${JSON.stringify({ status: blocking ? 'FAILED' : 'OK', ...result }, (_, value) => (typeof value === 'bigint' ? value.toString() : value), 2)}\n`,
    );
    if (blocking) process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

void main();
