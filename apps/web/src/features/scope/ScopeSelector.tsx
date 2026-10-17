import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AccessScopeDto, OrganizationTree } from '@cplan/contracts';
import { api } from '@/shared/api/client';
import { availableScopes, useScopeStore, type ActiveScope } from './scope-store';

const ALL = 'all';
const same = (a: ActiveScope | null, b: ActiveScope | null) =>
  JSON.stringify(a) === JSON.stringify(b);

export function ScopeSelector({ scopes }: { scopes: AccessScopeDto[] }) {
  const client = useQueryClient();
  const active = useScopeStore((state) => state.active);
  const select = useScopeStore((state) => state.select);
  const global = scopes.some((scope) => scope.type === 'SCHOOL');
  // Un profil global choisit parmi tous les cycles, sections et filières.
  const organization = useQuery({
    queryKey: ['organization'],
    queryFn: () => api.get<OrganizationTree>('/organization'),
    enabled: global,
    staleTime: 5 * 60_000,
  });
  const available = availableScopes(scopes, organization.data ?? []);
  // Plusieurs périmètres accordés : « Tous mes cycles » n'applique aucun filtre.
  const offerAll = !global && available.length > 1;

  if (!available.length) return <span className="scope-empty">Aucun périmètre</span>;

  const activeIndex = available.findIndex((scope) => same(scope, active));
  const value = activeIndex >= 0 ? String(activeIndex) : offerAll ? ALL : global ? '0' : String(0);

  return (
    <label className="scope-selector">
      <span>Périmètre actif</span>
      <select
        aria-label="Périmètre actif"
        value={value}
        onChange={(event) => {
          const next =
            event.target.value === ALL ? null : (available[Number(event.target.value)] ?? null);
          select(next);
          // Les écrans affichés relisent leurs données dans le nouveau périmètre.
          void client.invalidateQueries();
        }}
      >
        {offerAll ? <option value={ALL}>Tous mes cycles</option> : null}
        {available.map((scope, index) =>
          scope.group ? null : (
            <option key={`${scope.type}-${index}`} value={index}>
              {scope.label}
            </option>
          ),
        )}
        {[...new Set(available.flatMap((scope) => (scope.group ? [scope.group] : [])))].map(
          (group) => (
            <optgroup key={group} label={group}>
              {available.map((scope, index) =>
                scope.group === group ? (
                  <option key={`${scope.type}-${index}`} value={index}>
                    {scope.label}
                  </option>
                ) : null,
              )}
            </optgroup>
          ),
        )}
      </select>
    </label>
  );
}
