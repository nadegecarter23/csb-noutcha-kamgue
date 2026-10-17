import type { Logger } from 'pino';
import type { AppConfig } from './config.js';
import type { Database } from './db.js';

/**
 * Le compte PostgreSQL de l'application doit subir la RLS.
 *
 * Un super-utilisateur, un rôle `BYPASSRLS` ou le propriétaire des tables
 * contournent les politiques : cloisonnement entre établissements et cycles,
 * interdiction de supprimer les pièces financières… tout disparaîtrait sans
 * erreur visible. En production, l'API refuse donc de démarrer avec un tel
 * compte (voir infra/railway/create-runtime-role.sql).
 */
export async function assertRuntimeRoleIsRestricted(
  db: Database,
  config: AppConfig,
  logger: Logger,
): Promise<void> {
  const [role] = await db.$queryRaw<
    Array<{ name: string; superuser: boolean; bypassRls: boolean; ownedTables: bigint }>
  >`
    SELECT r.rolname AS name, r.rolsuper AS superuser, r.rolbypassrls AS "bypassRls",
           (SELECT count(*) FROM pg_tables t
             WHERE t.schemaname = 'public' AND t.tableowner = r.rolname) AS "ownedTables"
    FROM pg_roles r
    WHERE r.rolname = current_user`;
  if (!role) return;
  const problems = [
    role.superuser && 'super-utilisateur',
    role.bypassRls && 'BYPASSRLS',
    role.ownedTables > 0n && 'propriétaire des tables',
  ].filter(Boolean);
  if (!problems.length) return;
  const message = `Le compte PostgreSQL « ${role.name} » contourne la RLS (${problems.join(', ')}). DATABASE_URL doit utiliser le rôle applicatif restreint (cplan_app).`;
  if (config.isProduction) throw new Error(message);
  logger.warn(message);
}
