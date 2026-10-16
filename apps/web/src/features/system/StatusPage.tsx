import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/api/client';

/**
 * Page d'état des services.
 *
 * Objectif de Phase 00 : prouver que la chaîne complète fonctionne —
 * navigateur → proxy Vite → API Fastify → PostgreSQL / Redis / MinIO.
 * Elle reste utile ensuite comme outil de diagnostic de premier niveau.
 */

interface Dependency {
  name: string;
  status: 'up' | 'down';
  latencyMs: number;
  error?: string;
}

interface Readiness {
  status: 'ok' | 'degraded';
  checkedAt: string;
  dependencies: Dependency[];
}

const LABELS: Record<string, string> = {
  postgres: 'Base de données',
  redis: 'Cache et files',
  storage: 'Stockage des documents',
};

export function StatusPage() {
  const { data, error, isPending, refetch, isFetching } = useQuery({
    queryKey: ['system', 'readiness'],
    queryFn: () => api.get<Readiness>('/health/ready'),
    refetchInterval: 15_000,
    // La réponse est un 503 quand un service est HS : c'est une information
    // valide, pas une erreur à masquer.
    retry: false,
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">État des services</h1>
          <p className="mt-1 text-sm text-slate-500">
            Diagnostic de la plateforme CSB Noutcha KAMGUE
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {isFetching ? 'Vérification…' : 'Actualiser'}
        </button>
      </header>

      <div className="mt-8 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {isPending && (
          <div className="space-y-3 p-6">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-slate-100" />
            ))}
          </div>
        )}

        {error && (
          <div className="p-6">
            <p className="text-sm font-medium text-unpaid-600">API injoignable</p>
            <p className="mt-1 text-sm text-slate-600">
              Vérifiez que l&apos;API est démarrée&nbsp;: <code>pnpm dev</code>
            </p>
          </div>
        )}

        {data && (
          <>
            <ul className="divide-y divide-slate-100">
              {data.dependencies.map((dep) => (
                <li key={dep.name} className="flex items-center justify-between px-6 py-4">
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className={`h-2 w-2 rounded-full ${
                        dep.status === 'up' ? 'bg-paid-600' : 'bg-unpaid-600'
                      }`}
                    />
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {LABELS[dep.name] ?? dep.name}
                      </p>
                      {dep.error && <p className="mt-0.5 text-xs text-unpaid-600">{dep.error}</p>}
                    </div>
                  </div>
                  <div className="text-right">
                    {/* La couleur ne porte jamais l'information seule : le
                        libellé la double systématiquement. */}
                    <p
                      className={`text-sm font-medium ${
                        dep.status === 'up' ? 'text-paid-600' : 'text-unpaid-600'
                      }`}
                    >
                      {dep.status === 'up' ? 'Opérationnel' : 'Injoignable'}
                    </p>
                    <p className="tabular text-xs text-slate-400">{dep.latencyMs} ms</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="border-t border-slate-100 bg-slate-50 px-6 py-3">
              <p className="text-xs text-slate-500">
                Dernière vérification&nbsp;:{' '}
                {new Date(data.checkedAt).toLocaleTimeString('fr-FR', {
                  timeZone: 'Africa/Douala',
                })}{' '}
                (heure de Douala)
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
