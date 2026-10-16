import type { Prisma } from '@prisma/client';
import type { WritableUnitsDto } from '@cplan/contracts';
import { errors } from './errors.js';

/**
 * Cycles dans lesquels l'utilisateur courant peut écrire.
 *
 * La règle est celle de la RLS (`scope_allows_organization`) : les formulaires
 * ne proposent donc jamais un cycle que la base refuserait ensuite. À appeler
 * dans une transaction `withSchoolScope`, qui positionne l'utilisateur courant.
 */
export async function writableUnits(
  tx: Prisma.TransactionClient,
  schoolId: string,
): Promise<WritableUnitsDto> {
  const [units, global] = await Promise.all([
    tx.$queryRaw<Array<{ id: string; code: string; name: string }>>`
      SELECT id, code::text AS code, name
      FROM organizational_units
      WHERE school_id = ${schoolId}::uuid
        AND status = 'ACTIVE'
        AND scope_allows_organization(id, NULL, NULL, NULL)
      ORDER BY order_index`,
    tx.$queryRaw<Array<{ allowed: boolean }>>`
      SELECT scope_allows_organization(NULL, NULL, NULL, NULL) AS allowed`,
  ]);
  return { units, schoolWide: global[0]?.allowed ?? false };
}

/** Vérifie qu'un cycle appartient à l'établissement et au périmètre de l'utilisateur. */
export async function assertWritableUnit(
  tx: Prisma.TransactionClient,
  schoolId: string,
  unitId: string,
) {
  const { units } = await writableUnits(tx, schoolId);
  const unit = units.find((item) => item.id === unitId);
  if (!unit) throw errors.forbidden('Ce cycle ne fait pas partie de votre périmètre.');
  return unit;
}
