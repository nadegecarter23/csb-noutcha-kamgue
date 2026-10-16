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

export function availableScopes(scopes: AccessScopeDto[]): ActiveScope[] {
  if (scopes.some((scope) => scope.type === 'SCHOOL'))
    return [{ type: 'SCHOOL', label: 'Tout l’établissement' }];

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
