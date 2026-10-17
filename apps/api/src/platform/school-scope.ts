import type { Prisma } from '@prisma/client';
import type { Database } from './db.js';
import { getContext } from './request-context.js';

/**
 * Isolation multi-établissement — seconde barrière (ADR-011).
 *
 * Les politiques RLS posées en migration filtrent sur
 * `current_setting('app.school_id')`. Encore faut-il que ce paramètre soit
 * positionné : sans cela, les politiques laissent tout passer et ne servent à
 * rien.
 *
 * `withSchoolScope` ouvre une transaction, y positionne `app.school_id` via
 * SET LOCAL — donc valable pour cette transaction uniquement, sans fuite d'une
 * requête sur l'autre dans un pool de connexions — puis exécute le travail.
 *
 * La barrière PRINCIPALE reste applicative : chaque repository exige un
 * `schoolId` explicite. Celle-ci est le filet qui empêche qu'un oubli devienne
 * une fuite de données entre établissements.
 */
export async function withSchoolScope<T>(
  db: Database,
  schoolId: string,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: { timeoutMs?: number },
): Promise<T> {
  return db.$transaction(
    async (tx) => {
      // set_config(..., true) = portée transaction (équivalent de SET LOCAL).
      // Le paramétrage est obligatoirement fait par requête paramétrée :
      // interpoler un identifiant dans du SQL est une injection en puissance.
      await tx.$executeRaw`SELECT set_config('app.school_id', ${schoolId}::text, true)`;
      await tx.$executeRaw`SELECT set_config('app.user_id', ${getContext()?.userId ?? ''}::text, true)`;
      const active = getContext()?.activeScope;
      await tx.$executeRaw`SELECT
        set_config('app.active_unit_id', ${active?.organizationalUnitId ?? ''}::text, true),
        set_config('app.active_section_id', ${active?.languageSectionId ?? ''}::text, true),
        set_config('app.active_track_id', ${active?.educationTrackId ?? ''}::text, true),
        set_config('app.active_class_id', ${active?.classId ?? ''}::text, true)`;
      return work(tx);
    },
    {
      isolationLevel: 'ReadCommitted',
      timeout: options?.timeoutMs ?? 10_000,
    },
  );
}

/**
 * Variante sans établissement, pour les traitements de plateforme
 * (SUPER_ADMIN, jobs système). `app.school_id` reste vide, ce qui neutralise
 * les politiques RLS — d'où un usage à réserver à du code explicitement
 * transverse.
 */
export async function withPlatformScope<T>(
  db: Database,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.school_id', '', true)`;
      await tx.$executeRaw`SELECT set_config('app.user_id', '', true)`;
      return work(tx);
    },
    { isolationLevel: 'ReadCommitted', timeout: 10_000 },
  );
}
