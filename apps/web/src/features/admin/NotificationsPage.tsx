import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
type Template = {
  id: string;
  type: string;
  channel: 'IN_APP' | 'PUSH' | 'SMS' | 'EMAIL';
  title: string | null;
  body: string;
  isActive: boolean;
  updatedAt: string;
};
type Stats = {
  total: number;
  delivered: number;
  failed: number;
  deadLetter: number;
  smsCost: number;
  byChannel: Record<string, number>;
};
export function NotificationsPage() {
  const client = useQueryClient();
  const templates = useQuery({
    queryKey: ['notification-templates'],
    queryFn: () => api.get<Template[]>('/notification-templates'),
  });
  const stats = useQuery({
    queryKey: ['notification-stats'],
    queryFn: () => api.get<Stats>('/notifications/stats'),
  });
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const save = useMutation({
    mutationFn: (item: Template) =>
      api.patch('/notification-templates', {
        type: item.type,
        channel: item.channel,
        title: item.title,
        body: item.body,
        isActive: item.isActive,
      }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['notification-templates'] }),
  });
  const broadcast = useMutation({
    mutationFn: () =>
      api.post('/notifications/broadcast', {
        title,
        body,
        channels: ['IN_APP', 'PUSH'],
        data: { screen: 'notifications' },
      }),
    onSuccess: () => {
      setTitle('');
      setBody('');
    },
  });
  return (
    <section className="space-y-6">
      <header>
        <p className="text-sm font-medium text-brand-700">Communication</p>
        <h1 className="text-2xl font-bold">Notifications</h1>
        <p className="mt-1 text-sm text-slate-500">Modèles, diffusion et suivi multicanal.</p>
      </header>
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ['Livraisons', stats.data?.total ?? 0],
          ['Délivrées', stats.data?.delivered ?? 0],
          ['Échecs', stats.data?.failed ?? 0],
          ['Coût SMS', `${stats.data?.smsCost ?? 0} FCFA`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border bg-white p-4">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-bold">{value}</p>
          </div>
        ))}
      </div>
      <article className="rounded-xl border bg-white p-5">
        <h2 className="font-semibold">Annonce aux familles</h2>
        <div className="mt-3 grid gap-3">
          <input
            className="input"
            placeholder="Titre"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <textarea
            className="input min-h-24"
            placeholder="Message"
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
          <button
            className="button-primary justify-self-end"
            disabled={!title || !body || broadcast.isPending}
            onClick={() => broadcast.mutate()}
          >
            Envoyer l’annonce
          </button>
        </div>
      </article>
      <article className="rounded-xl border bg-white p-5">
        <h2 className="font-semibold">Modèles personnalisés</h2>
        <div className="mt-3 space-y-3">
          {templates.data?.map((item) => (
            <div
              key={item.id}
              className="grid gap-2 rounded-lg border p-3 md:grid-cols-[180px_90px_1fr_auto]"
            >
              <b className="text-sm">{item.type}</b>
              <span className="text-sm">{item.channel}</span>
              <textarea
                className="input min-h-16"
                value={item.body}
                onChange={(event) =>
                  client.setQueryData<Template[]>(['notification-templates'], (old) =>
                    old?.map((row) =>
                      row.id === item.id ? { ...row, body: event.target.value } : row,
                    ),
                  )
                }
              />
              <button className="rounded-lg border px-3 py-2" onClick={() => save.mutate(item)}>
                Enregistrer
              </button>
            </div>
          ))}
          {!templates.data?.length ? (
            <p className="text-sm text-slate-500">
              Les modèles par défaut sont actifs. Créez une personnalisation via l’API pour la voir
              ici.
            </p>
          ) : null}
        </div>
      </article>
    </section>
  );
}
