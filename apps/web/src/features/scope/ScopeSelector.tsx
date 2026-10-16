import type { AccessScopeDto } from '@cplan/contracts';
import { availableScopes, useScopeStore } from './scope-store';

export function ScopeSelector({ scopes }: { scopes: AccessScopeDto[] }) {
  const active = useScopeStore((state) => state.active);
  const select = useScopeStore((state) => state.select);
  const available = availableScopes(scopes);
  const selected =
    active && available.some((scope) => JSON.stringify(scope) === JSON.stringify(active))
      ? active
      : (available[0] ?? null);

  if (!available.length) return <span className="scope-empty">Aucun périmètre</span>;

  return (
    <label className="scope-selector">
      <span>Périmètre actif</span>
      <select
        aria-label="Périmètre actif"
        value={available.findIndex((scope) => JSON.stringify(scope) === JSON.stringify(selected))}
        onChange={(event) => select(available[Number(event.target.value)] ?? null)}
      >
        {available.map((scope, index) => (
          <option key={`${scope.type}-${scope.label}-${index}`} value={index}>
            {scope.label}
          </option>
        ))}
      </select>
    </label>
  );
}
