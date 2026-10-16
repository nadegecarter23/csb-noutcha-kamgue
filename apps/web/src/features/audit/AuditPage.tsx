import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AuditLogDto, Paginated } from '@cplan/contracts';
import { api } from '@/shared/api/client';

type Filters = {
  q: string;
  action: string;
  entityType: string;
  entityId: string;
  from: string;
  to: string;
};
const initial: Filters = { q: '', action: '', entityType: '', entityId: '', from: '', to: '' };
const json = (value: Record<string, unknown> | null) =>
  value ? JSON.stringify(value, null, 2) : '—';

export default function AuditPage() {
  const [draft, setDraft] = useState(initial);
  const [filters, setFilters] = useState(initial);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AuditLogDto | null>(null);
  const params = useMemo(() => {
    const value = new URLSearchParams({ page: String(page), page_size: '25' });
    if (filters.q) value.set('q', filters.q);
    if (filters.action) value.set('action', filters.action);
    if (filters.entityType) value.set('entity_type', filters.entityType);
    if (filters.entityId) value.set('entity_id', filters.entityId);
    if (filters.from) value.set('from', new Date(`${filters.from}T00:00:00`).toISOString());
    if (filters.to) value.set('to', new Date(`${filters.to}T23:59:59.999`).toISOString());
    return value.toString();
  }, [filters, page]);
  const query = useQuery({
    queryKey: ['audit-logs', params],
    queryFn: () => api.get<Paginated<AuditLogDto>>(`/audit-logs?${params}`),
    staleTime: 30_000,
  });
  const update = (key: keyof Filters, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));
  return (
    <section className="space-y-5">
      <header>
        <p className="text-sm font-semibold text-brand-700">Sécurité & traçabilité</p>
        <h1 className="text-2xl font-bold">Journal d’audit</h1>
        <p className="mt-1 text-sm text-slate-500">
          Chaque opération sensible est horodatée, attribuée et conservée sans modification.
        </p>
      </header>
      <form
        className="grid gap-3 rounded-2xl border bg-white p-4 md:grid-cols-3"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setFilters(draft);
        }}
      >
        <input
          className="input"
          aria-label="Recherche"
          placeholder="Action, objet ou identifiant"
          value={draft.q}
          onChange={(e) => update('q', e.target.value)}
        />
        <input
          className="input"
          aria-label="Action"
          placeholder="Action (payment.reverse…)"
          value={draft.action}
          onChange={(e) => update('action', e.target.value)}
        />
        <input
          className="input"
          aria-label="Type d’objet"
          placeholder="Type d’objet"
          value={draft.entityType}
          onChange={(e) => update('entityType', e.target.value)}
        />
        <input
          className="input"
          aria-label="Identifiant d’objet"
          placeholder="Identifiant d’objet"
          value={draft.entityId}
          onChange={(e) => update('entityId', e.target.value)}
        />
        <input
          className="input"
          aria-label="Du"
          type="date"
          value={draft.from}
          onChange={(e) => update('from', e.target.value)}
        />
        <input
          className="input"
          aria-label="Au"
          type="date"
          value={draft.to}
          onChange={(e) => update('to', e.target.value)}
        />
        <div className="flex gap-2 md:col-span-3">
          <button className="button-primary" type="submit">
            Filtrer
          </button>
          <button
            className="rounded-lg border px-4 py-2 text-sm"
            type="button"
            onClick={() => {
              setDraft(initial);
              setFilters(initial);
              setPage(1);
            }}
          >
            Réinitialiser
          </button>
        </div>
      </form>
      {query.isError ? (
        <p className="rounded-xl bg-red-50 p-4 text-red-800">{query.error.message}</p>
      ) : null}
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="p-3">Date</th>
              <th>Utilisateur</th>
              <th>Action</th>
              <th>Objet</th>
              <th>IP</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {query.data?.data.map((row) => (
              <tr className="border-t" key={row.id}>
                <td className="whitespace-nowrap p-3">
                  {new Date(row.createdAt).toLocaleString('fr-CM')}
                </td>
                <td>{row.actorName ?? row.actorType}</td>
                <td className="font-mono text-xs">{row.action}</td>
                <td>
                  {row.entityType} · <span className="font-mono text-xs">{row.entityId}</span>
                </td>
                <td>{row.ipAddress ?? '—'}</td>
                <td>
                  <button className="font-semibold text-brand-700" onClick={() => setSelected(row)}>
                    Détails
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {query.isLoading ? <p className="p-6 text-center text-slate-500">Chargement…</p> : null}
      </div>
      {query.data ? (
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500">{query.data.meta.total} événements</span>
          <div className="flex gap-2">
            <button
              className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40"
              disabled={page === 1}
              onClick={() => setPage((value) => value - 1)}
            >
              Précédent
            </button>
            <button
              className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40"
              disabled={page >= query.data.meta.total_pages}
              onClick={() => setPage((value) => value + 1)}
            >
              Suivant
            </button>
          </div>
        </div>
      ) : null}
      {selected ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Détail de l’événement"
        >
          <article className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex justify-between gap-4">
              <div>
                <p className="font-mono text-sm text-brand-700">{selected.action}</p>
                <h2 className="text-xl font-bold">
                  {selected.entityType} · {selected.entityId}
                </h2>
              </div>
              <button
                aria-label="Fermer"
                className="rounded-lg border px-3"
                onClick={() => setSelected(null)}
              >
                Fermer
              </button>
            </div>
            <dl className="mt-5 grid gap-3 text-sm md:grid-cols-3">
              <div>
                <dt className="text-slate-500">Acteur</dt>
                <dd>{selected.actorName ?? selected.actorType}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Adresse IP</dt>
                <dd>{selected.ipAddress ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Requête</dt>
                <dd className="font-mono text-xs">{selected.requestId ?? '—'}</dd>
              </div>
            </dl>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div>
                <h3 className="mb-2 font-semibold">Avant</h3>
                <pre className="overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">
                  {json(selected.oldValues)}
                </pre>
              </div>
              <div>
                <h3 className="mb-2 font-semibold">Après</h3>
                <pre className="overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">
                  {json(selected.newValues)}
                </pre>
              </div>
            </div>
            <h3 className="mb-2 mt-4 font-semibold">Contexte</h3>
            <pre className="overflow-auto rounded-xl bg-slate-100 p-4 text-xs">
              {json(selected.metadata)}
            </pre>
          </article>
        </div>
      ) : null}
    </section>
  );
}
