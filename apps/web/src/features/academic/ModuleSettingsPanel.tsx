import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SchoolModuleCode, SchoolModuleDto } from '@cplan/contracts';
import { api } from '@/shared/api/client';
import { useAuthStore } from '@/features/auth/auth-store';
import { useSchoolModules } from '@/shared/use-school-modules';

export function ModuleSettingsPanel() {
  const me = useAuthStore((s) => s.user),
    client = useQueryClient(),
    query = useSchoolModules();
  const update = useMutation({
    mutationFn: ({ code, enabled }: { code: SchoolModuleCode; enabled: boolean }) =>
      api.patch<SchoolModuleDto[]>(`/modules/${code}`, { enabled }),
    onSuccess: (data) => client.setQueryData(['school-modules'], data),
  });
  const canManage = Boolean(me?.permissions.includes('settings.update'));
  const toggle = (module: SchoolModuleDto) => {
    if (
      module.enabled &&
      !window.confirm(
        `Désactiver « ${module.label} » ? Les menus et les opérations de ce module deviendront indisponibles.`,
      )
    )
      return;
    update.mutate({ code: module.code, enabled: !module.enabled });
  };
  if (query.isPending)
    return (
      <p className="rounded-xl border bg-white p-5 text-sm text-slate-500">
        Chargement des modules…
      </p>
    );
  if (!query.data)
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        Impossible de charger la configuration des modules.
      </p>
    );
  const names = new Map(query.data.map((item) => [item.code, item.label]));
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-4">
        <p className="text-sm font-medium text-brand-700">Fonctionnalités</p>
        <h2 className="text-lg font-semibold">Modules de l’établissement</h2>
        <p className="mt-1 text-sm text-slate-500">
          Une désactivation masque les écrans et bloque aussi les API. Les données existantes
          restent conservées.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {query.data.map((module) => (
          <article
            key={module.code}
            className={`rounded-xl border p-4 ${module.enabled ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-slate-50'}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold text-slate-900">{module.label}</h3>
                <p className="mt-1 text-sm text-slate-600">{module.description}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={module.enabled}
                aria-label={`${module.enabled ? 'Désactiver' : 'Activer'} ${module.label}`}
                disabled={!canManage || update.isPending}
                onClick={() => toggle(module)}
                className={`relative h-7 w-12 shrink-0 rounded-full transition ${module.enabled ? 'bg-emerald-600' : 'bg-slate-300'} disabled:cursor-not-allowed disabled:opacity-50`}
              >
                <span
                  className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${module.enabled ? 'left-6' : 'left-1'}`}
                />
              </button>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 text-xs">
              <span
                className={
                  module.enabled ? 'font-medium text-emerald-700' : 'font-medium text-slate-500'
                }
              >
                {module.enabled ? 'Activé' : 'Désactivé'}
              </span>
              {module.dependencies.length ? (
                <span className="text-right text-slate-500">
                  Dépend de {module.dependencies.map((code) => names.get(code) ?? code).join(', ')}
                </span>
              ) : null}
            </div>
          </article>
        ))}
      </div>
      {update.isError ? (
        <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {update.error instanceof Error ? update.error.message : 'Modification impossible.'}
        </p>
      ) : null}
      {!canManage ? (
        <p className="mt-3 text-xs text-slate-500">
          Vous pouvez consulter cette configuration. Seul un administrateur disposant de «
          settings.update » peut la modifier.
        </p>
      ) : null}
    </section>
  );
}
