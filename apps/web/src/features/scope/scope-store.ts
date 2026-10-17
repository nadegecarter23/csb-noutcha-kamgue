import { create } from 'zustand';
import type { AccessScopeDto } from '@cplan/contracts';

const KEY = 'csbnk.active-scope.v1';

export type ActiveScope = {
  type: AccessScopeDto['type'];
  organizationalUnitId?: string | null;
  languageSectionId?: string | null;
  educationTrackId?: string | null;
  classId?: string | null;
  label: string;
  /** Cycle sous lequel l'option est regroupée dans le sélecteur. */
  group?: string;
};

function read(): ActiveScope | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ActiveScope) : null;
  } catch {
    return null;
  }
}

interface ScopeState {
  active: ActiveScope | null;
  select: (scope: ActiveScope | null) => void;
}

export const useScopeStore = create<ScopeState>((set) => ({
  active: read(),
  select: (active) => {
    try {
      if (active) localStorage.setItem(KEY, JSON.stringify(active));
      else localStorage.removeItem(KEY);
    } catch {
      // Le choix reste utilisable pour la session même si le stockage est désactivé.
    }
    set({ active });
  },
}));

type OrganizationUnit = {
  id: string;
  name: string;
  status: string;
  languageSections: Array<{ id: string; name: string; status: string }>;
  educationTracks: Array<{ id: string; name: string; status: string }>;
};

/**
 * Périmètres proposés dans le sélecteur.
 *
 * Un périmètre global peut se concentrer sur un cycle, une section linguistique
 * ou une filière : l'API transmet ce choix à la base, qui ne montre plus que
 * les données de ce périmètre.
 */
export function availableScopes(
  scopes: AccessScopeDto[],
  organization: OrganizationUnit[] = [],
): ActiveScope[] {
  if (scopes.some((scope) => scope.type === 'SCHOOL'))
    return [
      { type: 'SCHOOL', label: 'Tout l’établissement' },
      ...organization
        .filter((unit) => unit.status === 'ACTIVE')
        .flatMap((unit): ActiveScope[] => [
          {
            type: 'UNIT',
            organizationalUnitId: unit.id,
            label: `Tout le cycle ${unit.name.toLowerCase()}`,
            group: unit.name,
          },
          ...unit.languageSections
            .filter((section) => section.status === 'ACTIVE')
            .map((section) => ({
              type: 'LANGUAGE_SECTION' as const,
              languageSectionId: section.id,
              label: `${unit.name} ${section.name.toLowerCase()}`,
              group: unit.name,
            })),
          ...unit.educationTracks
            .filter((track) => track.status === 'ACTIVE')
            .map((track) => ({
              type: 'TRACK' as const,
              educationTrackId: track.id,
              label: `${unit.name} · ${track.name.toLowerCase()}`,
              group: unit.name,
            })),
        ]),
    ];

  return scopes
    .filter((scope) => scope.type !== 'OWN_ASSIGNMENTS')
    .map((scope) => ({
      type: scope.type,
      ...(scope.organizationalUnitId !== undefined && {
        organizationalUnitId: scope.organizationalUnitId,
      }),
      ...(scope.languageSectionId !== undefined && {
        languageSectionId: scope.languageSectionId,
      }),
      ...(scope.educationTrackId !== undefined && {
        educationTrackId: scope.educationTrackId,
      }),
      ...(scope.classId !== undefined && { classId: scope.classId }),
      label: scope.label ?? 'Périmètre autorisé',
    }));
}
