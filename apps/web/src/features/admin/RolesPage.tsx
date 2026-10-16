import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RoleDetail } from '@cplan/contracts';
import { api, ApiError } from '@/shared/api/client';
import { useAuthStore } from '@/features/auth/auth-store';

type Permission = { code: string; description: string; group: string };

export function RolesPage() {
  const queryClient = useQueryClient();
  const me = useAuthStore((state) => state.user);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [creating, setCreating] = useState(false);
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => api.get<RoleDetail[]>('/roles') });
  const permissions = useQuery({
    queryKey: ['permissions'],
    queryFn: () => api.get<Permission[]>('/permissions'),
  });
  const selected = roles.data?.find((role) => role.id === selectedId) ?? roles.data?.[0];
  const groups = useMemo(() => {
    const map = new Map<string, Permission[]>();
    for (const permission of permissions.data ?? [])
      map.set(permission.group, [...(map.get(permission.group) ?? []), permission]);
    return [...map.entries()];
  }, [permissions.data]);
  const save = useMutation({
    mutationFn: ({ id, body }: { id: string; body: unknown }) => api.patch(`/roles/${id}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roles'] }),
    onError: (error) =>
      setMessage(error instanceof ApiError ? error.message : 'Modification impossible.'),
  });
  const create = useMutation({
    mutationFn: (body: unknown) => api.post('/roles', body),
    onSuccess: () => {
      setCreating(false);
      void queryClient.invalidateQueries({ queryKey: ['roles'] });
    },
    onError: (error) =>
      setMessage(error instanceof ApiError ? error.message : 'Création impossible.'),
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || selected.isSystem) return;
    const data = new FormData(event.currentTarget);
    save.mutate({
      id: selected.id,
      body: {
        name: data.get('name'),
        description: data.get('description') || null,
        permissions: data.getAll('permissions'),
      },
    });
  }
  return (
    <section className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm font-medium text-brand-700">Administration</p>
          <h1 className="text-2xl font-semibold">Rôles et permissions</h1>
          <p className="mt-1 text-sm text-slate-500">
            Les rôles système sont protégés ; les rôles locaux sont personnalisables.
          </p>
        </div>
        {me?.permissions.includes('roles.manage') ? (
          <button className="button-primary" onClick={() => setCreating((value) => !value)}>
            Nouveau rôle
          </button>
        ) : null}
      </div>
      {message ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{message}</p> : null}
      {creating ? (
        <CreateRoleForm groups={groups} onCreate={(body) => create.mutate(body)} />
      ) : null}
      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <div className="space-y-2">
          {roles.data?.map((role) => (
            <button
              key={role.id}
              onClick={() => setSelectedId(role.id)}
              className={`w-full rounded-xl border p-4 text-left ${selected?.id === role.id ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white'}`}
            >
              <span className="font-medium">{role.name}</span>
              <span className="mt-1 block text-xs text-slate-500">
                {role.userCount} utilisateur(s) · {role.permissions.length} permission(s)
              </span>
            </button>
          ))}
        </div>
        {selected ? (
          <form
            key={selected.id}
            onSubmit={submit}
            className="rounded-xl border border-slate-200 bg-white p-5"
          >
            <div className="flex items-center justify-between">
              <div>
                <input
                  name="name"
                  className="input max-w-sm font-semibold"
                  defaultValue={selected.name}
                  disabled={selected.isSystem}
                />
                <p className="mt-1 text-xs font-mono text-slate-500">{selected.code}</p>
              </div>
              {selected.isSystem ? (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs">
                  Rôle système · lecture seule
                </span>
              ) : null}
            </div>
            <textarea
              name="description"
              className="input mt-4 min-h-20"
              defaultValue={selected.description ?? ''}
              disabled={selected.isSystem}
            />
            <div className="mt-5 space-y-5">
              {groups.map(([group, items]) => (
                <fieldset key={group}>
                  <legend className="mb-2 font-medium text-slate-800">{group}</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {items.map((permission) => (
                      <label
                        className="flex items-start gap-2 rounded-lg border border-slate-100 p-2 text-sm"
                        key={permission.code}
                      >
                        <input
                          name="permissions"
                          value={permission.code}
                          type="checkbox"
                          defaultChecked={selected.permissions.includes(permission.code)}
                          disabled={selected.isSystem}
                        />
                        <span>
                          <span className="block font-mono text-xs">{permission.code}</span>
                          <span className="text-xs text-slate-500">{permission.description}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
            {!selected.isSystem && me?.permissions.includes('roles.manage') ? (
              <button className="button-primary mt-5" disabled={save.isPending}>
                Enregistrer les permissions
              </button>
            ) : null}
          </form>
        ) : null}
      </div>
    </section>
  );
}

function CreateRoleForm({
  groups,
  onCreate,
}: {
  groups: [string, Permission[]][];
  onCreate(body: unknown): void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onCreate({
      code: String(data.get('code')).toUpperCase().replace(/\s+/g, '_'),
      name: data.get('name'),
      description: data.get('description') || null,
      permissions: data.getAll('permissions'),
    });
  }
  return (
    <form onSubmit={submit} className="rounded-xl border border-brand-200 bg-brand-50 p-5">
      <div className="grid gap-3 md:grid-cols-3">
        <input className="input" name="code" placeholder="CODE_DU_ROLE" required />
        <input className="input" name="name" placeholder="Nom du rôle" required />
        <input className="input" name="description" placeholder="Description" />
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-medium">Choisir les permissions</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups
            .flatMap(([, items]) => items)
            .map((permission) => (
              <label className="text-xs" key={permission.code}>
                <input
                  className="mr-1"
                  name="permissions"
                  type="checkbox"
                  value={permission.code}
                />
                {permission.code}
              </label>
            ))}
        </div>
      </details>
      <button className="button-primary mt-4">Créer le rôle</button>
    </form>
  );
}
