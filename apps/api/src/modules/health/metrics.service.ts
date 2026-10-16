import type { Database } from '../../platform/db.js';
import { withPlatformScope } from '../../platform/school-scope.js';

const metric = (name: string, help: string, value: number) =>
  `# HELP ${name} ${help}\n# TYPE ${name} gauge\n${name} ${value}`;

export async function renderMetrics(db: Database, startedAt: number): Promise<string> {
  const now = new Date();
  const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60_000);
  const [processing, anomalies, deliveries, exports, overdueExternal] = await withPlatformScope(
    db,
    (tx) =>
      Promise.all([
        tx.payment.count({
          where: {
            status: { in: ['PENDING', 'PROCESSING'] },
            initiatedAt: { lt: thirtyMinutesAgo },
          },
        }),
        tx.mobileMoneyReconciliation.count({
          where: { resolvedAt: null, status: { not: 'MATCHED' } },
        }),
        tx.notificationDelivery.count({ where: { status: { in: ['PENDING', 'FAILED'] } } }),
        tx.exportJob.count({
          where: { status: 'PROCESSING', requestedAt: { lt: thirtyMinutesAgo } },
        }),
        tx.externalPaymentDeclaration.count({
          where: {
            status: { in: ['AWAITING_VALIDATION', 'CORRECTION_REQUESTED'] },
            submittedAt: { lt: new Date(now.getTime() - 48 * 3_600_000) },
          },
        }),
      ]),
  );
  return (
    [
      metric(
        'cplan_process_uptime_seconds',
        'API process uptime.',
        Math.floor((Date.now() - startedAt) / 1000),
      ),
      metric(
        'cplan_payments_stuck_total',
        'Payments pending or processing for more than 30 minutes.',
        processing,
      ),
      metric(
        'cplan_reconciliation_anomalies_total',
        'Unresolved Mobile Money reconciliation anomalies.',
        anomalies,
      ),
      metric(
        'cplan_notification_delivery_backlog_total',
        'Pending or failed notification deliveries.',
        deliveries,
      ),
      metric('cplan_exports_stuck_total', 'Exports processing for more than 30 minutes.', exports),
      metric(
        'cplan_external_payments_overdue_total',
        'External payments exceeding the validation SLA.',
        overdueExternal,
      ),
    ].join('\n\n') + '\n'
  );
}
