import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SessionSummary } from '@cplan/contracts';
import { api, ApiError } from '@/shared/api/client';
import { useAuthStore } from '../auth-store';

export function ProfilePage() {
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const client = useQueryClient();
  const [message, setMessage] = useState('');
  const sessions = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.get<SessionSummary[]>('/auth/sessions'),
    enabled: !user?.mustChangePassword,
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api.delete(`/auth/sessions/${id}`),
    onSuccess: () => client.invalidateQueries({ queryKey: ['sessions'] }),
  });
  const password = useMutation({
    mutationFn: (body: unknown) => api.patch('/auth/password', body),
    onSuccess: () => {
      if (user) setUser({ ...user, mustChangePassword: false });
      setMessage('Mot de passe modifié. Les autres appareils ont été déconnectés.');
    },
    onError: (error) =>
      setMessage(error instanceof ApiError ? error.message : 'Modification impossible.'),
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    password.mutate({
      currentPassword: data.get('currentPassword'),
      newPassword: data.get('newPassword'),
    });
  }
  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-medium text-brand-700">Compte</p>
        <h1 className="text-2xl font-semibold">Mon profil</h1>
      </div>
      {user?.mustChangePassword ? (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-medium text-amber-900">
          Pour sécuriser votre compte, remplacez le mot de passe temporaire avant d'accéder à
          l'application.
        </p>
      ) : null}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold">Coordonnées</h2>
          <dl className="mt-4 grid grid-cols-[120px_1fr] gap-3 text-sm">
            <dt className="text-slate-500">Nom</dt>
            <dd>
              {user?.firstName} {user?.lastName}
            </dd>
            <dt className="text-slate-500">Téléphone</dt>
            <dd>{user?.phone}</dd>
            <dt className="text-slate-500">E-mail</dt>
            <dd>{user?.email ?? '—'}</dd>
            <dt className="text-slate-500">Rôles</dt>
            <dd>{user?.roles.join(', ')}</dd>
          </dl>
        </div>
        <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold">Changer le mot de passe</h2>
          <div className="mt-4 space-y-3">
            <input
              className="input"
              name="currentPassword"
              type="password"
              placeholder="Mot de passe actuel"
              required
            />
            <input
              className="input"
              name="newPassword"
              type="password"
              minLength={8}
              placeholder="Nouveau mot de passe"
              required
            />
            {message ? <p className="text-sm text-slate-700">{message}</p> : null}
            <button className="button-primary" disabled={password.isPending}>
              Mettre à jour
            </button>
          </div>
        </form>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold">Appareils connectés</h2>
        <div className="mt-3 divide-y divide-slate-100">
          {sessions.data?.map((session) => (
            <div key={session.id} className="flex items-center justify-between py-3 text-sm">
              <div>
                <p className="font-medium">
                  {session.deviceLabel ?? 'Appareil inconnu'}{' '}
                  {session.current ? <span className="text-brand-700">· cet appareil</span> : null}
                </p>
                <p className="text-xs text-slate-500">
                  {session.ipAddress ?? 'IP inconnue'} ·{' '}
                  {new Date(session.createdAt).toLocaleDateString('fr-CM')}
                </p>
              </div>
              <button
                className="text-red-700 hover:underline"
                onClick={() => revoke.mutate(session.id)}
              >
                Déconnecter
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
