import { z } from 'zod';

/**
 * Pagination, tri et recherche — contrat unique pour toutes les listes.
 *
 * Référence : docs/06-CONVENTIONS-DEV.md §2. Toute liste paginée de CSB Noutcha KAMGUE
 * (élèves, paiements, reçus, journal d'audit) utilise exactement cette forme.
 */

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 25;

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  /** Champ de tri, préfixé de `-` pour l'ordre décroissant : `-created_at`. */
  sort: z.string().optional(),
  /** Recherche plein texte. */
  q: z.string().trim().min(1).optional(),
});

export const paginationMetaSchema = z.object({
  page: z.number().int().positive(),
  page_size: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  total_pages: z.number().int().nonnegative(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
export type PaginationMeta = z.infer<typeof paginationMetaSchema>;

/** Enveloppe une liste paginée : `{ data, meta }`. */
export function paginatedSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    data: z.array(item),
    meta: paginationMetaSchema,
  });
}

export interface Paginated<T> {
  data: T[];
  meta: PaginationMeta;
}

/** Décompose `-created_at` en `{ field: 'created_at', direction: 'desc' }`. */
export function parseSort(
  sort: string | undefined,
  allowed: readonly string[],
  fallback: { field: string; direction: 'asc' | 'desc' },
): { field: string; direction: 'asc' | 'desc' } {
  if (!sort) return fallback;
  const direction = sort.startsWith('-') ? 'desc' : 'asc';
  const field = sort.replace(/^-/, '');
  if (!allowed.includes(field)) return fallback;
  return { field, direction };
}

export function buildPaginationMeta(page: number, pageSize: number, total: number): PaginationMeta {
  return {
    page,
    page_size: pageSize,
    total,
    total_pages: Math.ceil(total / pageSize),
  };
}
