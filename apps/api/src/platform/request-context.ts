import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Contexte de requête propagé implicitement (ADR-011).
 *
 * Il porte notamment `schoolId`, qui est la première barrière d'isolation
 * multi-établissement. Les repositories l'exigeront en paramètre explicite —
 * ce contexte sert à l'audit, à la corrélation des logs, et à positionner
 * `app.school_id` pour la RLS PostgreSQL.
 *
 * Les champs d'identité restent optionnels en Phase 00 : ils seront renseignés
 * par le middleware d'authentification en Phase 01.
 */
export interface RequestContext {
  readonly requestId: string;
  readonly userId?: string;
  readonly schoolId?: string;
  readonly permissions?: readonly string[];
  readonly accessScopes?: readonly AccessScopeContext[];
  /** Périmètre choisi dans l'interface ; appliqué par la RLS en plus des droits. */
  readonly activeScope?: AccessScopeContext | null;
  readonly ipAddress?: string;
  readonly userAgent?: string;
}

export interface AccessScopeContext {
  readonly type: 'SCHOOL' | 'UNIT' | 'LANGUAGE_SECTION' | 'TRACK' | 'CLASS' | 'OWN_ASSIGNMENTS';
  readonly organizationalUnitId?: string;
  readonly languageSectionId?: string;
  readonly educationTrackId?: string;
  readonly classId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function getContext(): RequestContext | undefined {
  return storage.getStore();
}

/** Met à jour le magasin asynchrone après authentification. */
export function updateContext(patch: Partial<RequestContext>): RequestContext {
  // On complète l'objet de contexte de la requête au lieu d'en installer un
  // nouveau avec `enterWith` : celui-ci ne vaudrait que dans la fonction
  // appelante (le hook d'authentification) et le traitement de la route
  // retrouverait un contexte sans utilisateur — la RLS ne connaîtrait alors ni
  // l'utilisateur ni son périmètre. Chaque requête possède son propre objet
  // (créé par le plugin de contexte), la mutation reste donc isolée.
  const current = requireContext();
  return Object.assign(current, patch);
}

/**
 * Variante stricte, pour le code qui ne peut pas fonctionner sans contexte
 * (écriture d'un journal d'audit, par exemple).
 */
export function requireContext(): RequestContext {
  const context = storage.getStore();
  if (!context) {
    throw new Error(
      'Aucun contexte de requête disponible. ' +
        'Cette fonction doit être appelée dans le cycle de vie d’une requête HTTP ou d’un job.',
    );
  }
  return context;
}
