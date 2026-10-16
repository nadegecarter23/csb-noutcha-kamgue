import type { Database } from '../../platform/db.js';
import type { AuditService } from '../../platform/audit.js';
import { AuditAction } from '../../platform/audit.js';
import { withPlatformScope } from '../../platform/school-scope.js';

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

export function createRetentionService(db: Database, audit: AuditService) {
  return {
    async purge() {
      return withPlatformScope(db, async (tx) => {
        const [otp, sessions, idempotency, providerEvents, notifications, exports] =
          await Promise.all([
            tx.otpCode.deleteMany({ where: { createdAt: { lt: daysAgo(7) } } }),
            tx.session.deleteMany({
              where: {
                OR: [{ expiresAt: { lt: daysAgo(90) } }, { revokedAt: { lt: daysAgo(90) } }],
              },
            }),
            tx.idempotencyKey.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
            tx.paymentProviderEvent.deleteMany({ where: { receivedAt: { lt: daysAgo(365) } } }),
            tx.notification.deleteMany({ where: { createdAt: { lt: daysAgo(365) } } }),
            tx.exportJob.deleteMany({
              where: {
                OR: [{ expiresAt: { lt: new Date() } }, { requestedAt: { lt: daysAgo(30) } }],
              },
            }),
          ]);
        const counts = {
          otp: otp.count,
          sessions: sessions.count,
          idempotency: idempotency.count,
          providerEvents: providerEvents.count,
          notifications: notifications.count,
          exports: exports.count,
        };
        await audit.log(
          {
            action: AuditAction.DATA_RETENTION_PURGED,
            entityType: 'retention_policy',
            entityId: new Date().toISOString().slice(0, 10),
            actorType: 'SYSTEM',
            metadata: counts,
          },
          tx,
        );
        return counts;
      });
    },
  };
}
