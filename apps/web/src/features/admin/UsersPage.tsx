import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OrganizationTree, RoleDetail, UserSummary } from '@cplan/contracts';
import { api, ApiError } from '@/shared/api/client';
import { useAuthStore } from '@/features/auth/auth-store';

type UserList = { data: UserSummary[]; meta: { total: number } };

export function UsersPage() {
  const client = useQueryClient();
  const me = useAuthStore((state) => state.user);
  const [q, setQ] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState('');
  const users = useQuery({
    queryKey: ['users', q],
    queryFn: () =>
      api.get<UserList>(`/users?page=1&page_size=50${q ? `&q=${encodeURIComponent(q)}` : ''}`),
  });
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => api.get<RoleDetail[]>('/roles') });
  const organization = useQuery({
    queryKey: ['organization'],
    queryFn: () => api.get<OrganizationTree>('/organization'),
  });
  const refresh = () => client.invalidateQueries({ queryKey: ['users'] });
  const stateMutation = useMutation({
    mutationFn: ({ user, active }: { user: UserSummary; active: boolean }) =>
      api.post(`/users/${user.id}/${active ? 'reactivate' : 'deactivate'}`, {
        reason: active ? 'Réactivation administrative' : 'Désactivation administrative',
      }),
    onSuccess: refresh,
    onError: (error) =>
      setMessage(error instanceof ApiError ? error.message : 'Action impossible.'),
  });
  const assignMutation = useMutation({
    mutationFn: ({ id, selected }: { id: string; selected: string[] }) =>
      api.post(`/users/${id}/roles`, {
        roles: selected,
        reason: 'Modification depuis l’administration',
      }),
    onSuccess: refresh,
    onError: (error) =>
      setMessage(error instanceof ApiError ? error.message : 'Action impossible.'),
  });
  const scopeMutation = useMutation({
    mutationFn: ({ id, scopes }: { id: string; scopes: Array<Record<string, unknown>> }) =>
      api.put(`/users/${id}/access-scopes`, {
        scopes,
        reason: 'Modification depuis l’administration',
      }),
    onSuccess: refresh,
    onError: (error) =>
      setMessage(error instanceof ApiError ? error.message : 'Périmètre impossible à enregistrer.'),
  });

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-brand-700">Administration</p>
          <h1 className="text-2xl font-semibold">Utilisateurs</h1>
          <p className="mt-1 text-sm text-slate-500">
            {users.data?.meta.total ?? 0} compte(s) dans cet établissement
          </p>
        </div>
        {me?.permissions.includes('users.create') ? (
          <button className="button-primary" onClick={() => setShowForm((value) => !value)}>
            {showForm ? 'Fermer' : 'Créer un utilisateur'}
          </button>
        ) : null}
      </div>
      {showForm ? (
        <CreateUserForm
          roles={roles.data ?? []}
          onCreated={() => {
            setShowForm(false);
            void refresh();
          }}
        />
      ) : null}
      {message ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{message}</p> : null}
      <input
        className="input max-w-md"
        placeholder="Rechercher par nom, e-mail ou téléphone"
        value={q}
        onChange={(event) => setQ(event.target.value)}
      />
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Utilisateur</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Rôles</th>
              <th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.isPending ? (
              <tr>
                <td className="px-4 py-6" colSpan={5}>
                  Chargement…
                </td>
              </tr>
            ) : (
              users.data?.data.map((user) => (
                <tr key={user.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium">
                      {user.firstName} {user.lastName}
                    </p>
                    <p className="text-xs text-slate-500">{user.jobTitle ?? '—'}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p>{user.phone}</p>
                    <p className="text-xs text-slate-500">{user.email ?? '—'}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {user.roles.map((role) => (
                        <span
                          key={role}
                          className="rounded-full bg-brand-50 px-2 py-1 text-xs text-brand-700"
                        >
                          {role}
                        </span>
                      ))}
                    </div>
                    {me?.permissions.includes('users.assign_roles') && user.id !== me.id ? (
                      <RolePicker
                        roles={roles.data ?? []}
                        selected={user.roles}
                        onSave={(selected) => assignMutation.mutate({ id: user.id, selected })}
                      />
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {user.accessScopes.map((scope) => (
                        <span
                          key={scope.id ?? `${scope.type}-${scope.label}`}
                          className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700"
                        >
                          {scope.label ?? scope.type}
                        </span>
                      ))}
                    </div>
                    {me?.permissions.includes('users.assign_roles') && user.id !== me.id ? (
                      <ScopePicker
                        organization={organization.data ?? []}
                        onSave={(scopes) => scopeMutation.mutate({ id: user.id, scopes })}
                      />
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs ${user.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}
                    >
                      {user.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {me?.permissions.includes('users.deactivate') && user.id !== me.id ? (
                      <button
                        className="text-sm font-medium text-brand-700 hover:underline"
                        onClick={() =>
                          stateMutation.mutate({ user, active: user.status === 'DISABLED' })
                        }
                      >
                        {user.status === 'DISABLED' ? 'Réactiver' : 'Désactiver'}
                      </button>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ScopePicker({
  organization,
  onSave,
}: {
  organization: OrganizationTree;
  onSave(value: Array<Record<string, unknown>>): void;
}) {
  const [value, setValue] = useState('SCHOOL');
  const options = [
    { value: 'SCHOOL', label: 'Tout l’établissement' },
    { value: 'OWN_ASSIGNMENTS', label: 'Mes affectations uniquement' },
    ...organization.map((unit) => ({ value: `UNIT:${unit.id}`, label: `Unité · ${unit.name}` })),
    ...organization.flatMap((unit) =>
      unit.languageSections.map((section) => ({
        value: `LANGUAGE_SECTION:${section.id}`,
        label: `${unit.name} · ${section.name}`,
      })),
    ),
    ...organization.flatMap((unit) =>
      unit.educationTracks.map((track) => ({
        value: `TRACK:${track.id}`,
        label: `${unit.name} · ${track.name}`,
      })),
    ),
  ];
  return (
    <div className="mt-2 flex gap-2">
      <select
        className="rounded border px-2 py-1 text-xs"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      >
        {options.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="text-xs text-brand-700"
        onClick={() => {
          const [type, id] = value.split(':');
          const key =
            type === 'UNIT'
              ? 'organizationalUnitId'
              : type === 'LANGUAGE_SECTION'
                ? 'languageSectionId'
                : type === 'TRACK'
                  ? 'educationTrackId'
                  : undefined;
          onSave([{ type, ...(key && id ? { [key]: id } : {}) }]);
        }}
      >
        Appliquer
      </button>
    </div>
  );
}

function RolePicker({
  roles,
  selected,
  onSave,
}: {
  roles: RoleDetail[];
  selected: string[];
  onSave(value: string[]): void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(selected);
  if (!open)
    return (
      <button className="mt-2 text-xs text-brand-700" onClick={() => setOpen(true)}>
        Modifier les rôles
      </button>
    );
  return (
    <div className="mt-2 min-w-52 rounded-lg border bg-white p-2 shadow">
      <div className="space-y-1">
        {roles
          .filter((role) => role.code !== 'PARENT' && role.code !== 'SUPER_ADMIN')
          .map((role) => (
            <label className="flex gap-2 text-xs" key={role.id}>
              <input
                type="checkbox"
                checked={value.includes(role.code)}
                onChange={() =>
                  setValue((current) =>
                    current.includes(role.code)
                      ? current.filter((code) => code !== role.code)
                      : [...current, role.code],
                  )
                }
              />
              {role.name}
            </label>
          ))}
      </div>
      <div className="mt-2 flex gap-2">
        <button
          className="text-xs font-semibold text-brand-700"
          disabled={!value.length}
          onClick={() => {
            onSave(value);
            setOpen(false);
          }}
        >
          Enregistrer
        </button>
        <button className="text-xs text-slate-500" onClick={() => setOpen(false)}>
          Annuler
        </button>
      </div>
    </div>
  );
}

function CreateUserForm({ roles, onCreated }: { roles: RoleDetail[]; onCreated(): void }) {
  const [error, setError] = useState('');
  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post('/users', body),
    onSuccess: onCreated,
    onError: (cause) =>
      setError(cause instanceof ApiError ? cause.message : 'Création impossible.'),
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    mutation.mutate({
      firstName: data.get('firstName'),
      lastName: data.get('lastName'),
      phone: data.get('phone'),
      email: data.get('email') || undefined,
      jobTitle: data.get('jobTitle') || undefined,
      roles: data.getAll('roles'),
      sendInvitation: true,
    });
  }
  return (
    <form
      className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-2"
      onSubmit={submit}
    >
      <input className="input" name="firstName" placeholder="Prénom" required />
      <input className="input" name="lastName" placeholder="Nom" required />
      <input className="input" name="phone" placeholder="Téléphone" required />
      <input className="input" name="email" type="email" placeholder="E-mail (facultatif)" />
      <input className="input" name="jobTitle" placeholder="Poste" />
      <fieldset className="rounded-lg border border-slate-200 p-3">
        <legend className="px-1 text-sm font-medium">Rôles</legend>
        {roles
          .filter((role) => !['PARENT', 'SUPER_ADMIN'].includes(role.code))
          .map((role) => (
            <label key={role.id} className="mr-3 inline-flex gap-1 text-sm">
              <input name="roles" value={role.code} type="checkbox" />
              {role.name}
            </label>
          ))}
      </fieldset>
      {error ? <p className="text-sm text-red-700 md:col-span-2">{error}</p> : null}
      <button className="button-primary md:col-span-2" disabled={mutation.isPending}>
        Créer et envoyer l’invitation
      </button>
    </form>
  );
}
