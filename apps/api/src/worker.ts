import { loadConfig } from './platform/config.js';
import { createLogger } from './platform/logger.js';
import { createDatabase } from './platform/db.js';
import { assertRuntimeRoleIsRestricted } from './platform/runtime-role.js';
import { createRedis } from './platform/redis.js';
import { createStorage } from './platform/storage.js';
import { createSmsProvider } from './platform/sms.js';
import { createAuditService } from './platform/audit.js';
import { createPaymentsService } from './modules/finance/payments.service.js';
import { createPaymentProviderRegistry } from './modules/mobile-money/providers/registry.js';
import { createMobileMoneyService } from './modules/mobile-money/mobile-money.service.js';
import { createNotificationsService } from './modules/notifications/notifications.service.js';
import { createExternalPaymentsService } from './modules/external-payments/external-payments.service.js';
import { withPlatformScope } from './platform/school-scope.js';
import { createReportingService } from './modules/reporting/reporting.service.js';
import { createExportsService } from './modules/exports/exports.service.js';
import { createRetentionService } from './modules/security/retention.service.js';

/** Worker séparé : polling financier, livraisons multicanales et planification. */
async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config).child({ process: 'worker' });
  const db = createDatabase(config, logger);
  await assertRuntimeRoleIsRestricted(db, config, logger);
  const redis = createRedis(config, logger);
  const audit = createAuditService(db);
  const payments = createPaymentsService(db, audit);
  const notifications = createNotificationsService(db, createSmsProvider(config, logger), logger);
  const storage = createStorage(config);
  const externalPayments = createExternalPaymentsService(
    db,
    audit,
    payments,
    storage,
    notifications,
  );
  const reporting = createReportingService(db, redis, audit);
  const exports = createExportsService(db, storage, audit, reporting, notifications);
  const retention = createRetentionService(db, audit);
  const mobileMoney = createMobileMoneyService(
    db,
    audit,
    payments,
    createPaymentProviderRegistry(config),
    config.PAYMENT_WEBHOOK_BASE_URL ?? `http://localhost:${config.PORT}/api/v1/webhooks`,
  );

  const poll = setInterval(
    () =>
      void mobileMoney
        .pollPending()
        .catch((error) => logger.error({ err: error }, 'échec du polling Mobile Money')),
    60_000,
  );
  const reconcile = setInterval(
    () =>
      void withPlatformScope(db, (tx) =>
        tx.school.findMany({ where: { status: 'ACTIVE' }, select: { id: true } }),
      )
        .then((schools) => Promise.all(schools.map((school) => mobileMoney.reconcile(school.id))))
        .catch((error) => logger.error({ err: error }, 'échec du rapprochement Mobile Money')),
    86_400_000,
  );
  const deliveries = setInterval(
    () =>
      void notifications
        .processPending()
        .catch((error) => logger.error({ err: error }, 'échec du traitement des notifications')),
    15_000,
  );
  const reminders = setInterval(
    () =>
      void notifications
        .runScheduledReminders()
        .catch((error) => logger.error({ err: error }, 'échec des relances planifiées')),
    900_000,
  );
  const externalSla = setInterval(
    () =>
      void externalPayments
        .notifyOverdue()
        .catch((error) => logger.error({ err: error }, 'échec des alertes SLA externes')),
    3_600_000,
  );
  const exportJobs = setInterval(
    () =>
      void exports
        .processPending()
        .catch((error) => logger.error({ err: error }, 'échec du traitement des exports')),
    10_000,
  );
  const exportPurge = setInterval(
    () =>
      void exports
        .purgeExpired()
        .catch((error) => logger.error({ err: error }, 'échec de la purge des exports')),
    86_400_000,
  );
  const retentionPurge = setInterval(
    () =>
      void retention
        .purge()
        .catch((error) => logger.error({ err: error }, 'échec de la purge de rétention')),
    86_400_000,
  );
  for (const timer of [
    poll,
    reconcile,
    deliveries,
    reminders,
    externalSla,
    exportJobs,
    exportPurge,
    retentionPurge,
  ])
    timer.unref();
  logger.info('worker CSB Noutcha KAMGUE démarré — paiements, notifications et relances actifs');

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const timer of [
      poll,
      reconcile,
      deliveries,
      reminders,
      externalSla,
      exportJobs,
      exportPurge,
      retentionPurge,
    ])
      clearInterval(timer);
    logger.info({ signal }, 'arrêt du worker…');
    await Promise.allSettled([db.$disconnect(), redis.quit()]);
    process.exit(0);
  };
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.on(signal, () => void shutdown(signal));
}
void main();
