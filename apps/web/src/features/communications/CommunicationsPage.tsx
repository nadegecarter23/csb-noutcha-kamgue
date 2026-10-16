import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ClassDto,
  CommunicationsOverviewDto,
  PedagogyOverviewDto,
  StaffMemberDto,
} from '@cplan/contracts';
import { api } from '@/shared/api/client';
import { useAcademicYear } from '@/features/academic/use-academic-year';
import { useAuthStore } from '@/features/auth/auth-store';
const audience = {
  ALL: 'Toute la communauté',
  STAFF: 'Personnel',
  FAMILIES: 'Familles',
  STUDENTS: 'Élèves',
} as const;
export function CommunicationsPage() {
  const academic = useAcademicYear();
  const user = useAuthStore((s) => s.user);
  const client = useQueryClient();
  const yearId = academic.selectedYear?.id;
  const [tab, setTab] = useState<'news' | 'calendar' | 'homework' | 'messages'>('news');
  const [compose, setCompose] = useState(false);
  const data = useQuery({
    queryKey: ['communications', yearId],
    queryFn: () => api.get<CommunicationsOverviewDto>(`/communications?academic_year_id=${yearId}`),
    enabled: Boolean(yearId),
  });
  const classes = useQuery({
    queryKey: ['classes', yearId],
    queryFn: () => api.get<ClassDto[]>(`/classes?academic_year_id=${yearId}`),
    enabled: Boolean(yearId),
  });
  const pedagogy = useQuery({
    queryKey: ['pedagogy-overview', yearId],
    queryFn: () => api.get<PedagogyOverviewDto>(`/pedagogy/overview?academic_year_id=${yearId}`),
    enabled: Boolean(yearId),
  });
  const staff = useQuery({
    queryKey: ['staff', yearId],
    queryFn: () => api.get<StaffMemberDto[]>(`/staff?academic_year_id=${yearId}`),
    enabled: Boolean(yearId),
  });
  const create = useMutation({
    mutationFn: ({ path, body }: { path: string; body: unknown }) => api.post(path, body),
    onSuccess: () => {
      setCompose(false);
      void client.invalidateQueries({ queryKey: ['communications'] });
    },
  });
  const canManage = Boolean(user?.permissions.includes('communications.manage'));
  const canMessage = Boolean(user?.permissions.includes('messages.send'));
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (tab === 'news')
      create.mutate({
        path: '/announcements',
        body: {
          title: String(f.get('title')),
          body: String(f.get('body')),
          audience: String(f.get('audience')),
          expiresAt: f.get('expires') ? new Date(String(f.get('expires'))).toISOString() : null,
        },
      });
    if (tab === 'calendar')
      create.mutate({
        path: '/school-events',
        body: {
          title: String(f.get('title')),
          description: String(f.get('body')) || null,
          location: String(f.get('location')) || null,
          audience: String(f.get('audience')),
          startsAt: new Date(String(f.get('start'))).toISOString(),
          endsAt: new Date(String(f.get('end'))).toISOString(),
        },
      });
    if (tab === 'homework')
      create.mutate({
        path: '/homework',
        body: {
          academicYearId: yearId,
          classId: String(f.get('class')),
          subjectId: String(f.get('subject')),
          title: String(f.get('title')),
          instructions: String(f.get('body')),
          dueAt: new Date(String(f.get('due'))).toISOString(),
          status: String(f.get('status')),
        },
      });
    if (tab === 'messages')
      create.mutate({
        path: '/school-messages',
        body: {
          recipientUserId: String(f.get('recipient')),
          subject: String(f.get('title')),
          body: String(f.get('body')),
        },
      });
  };
  const canCompose = tab === 'messages' ? canMessage : canManage;
  return (
    <section className="communications-page">
      <header>
        <div>
          <h1>Communication</h1>
          <p>Diffusez les informations de l’établissement depuis un espace commun.</p>
        </div>
        {canCompose ? (
          <button className="button-primary" onClick={() => setCompose((v) => !v)}>
            + {tab === 'messages' ? 'Nouveau message' : 'Nouvelle publication'}
          </button>
        ) : null}
      </header>
      <div className="communication-tabs">
        {(
          [
            ['news', 'Annonces'],
            ['calendar', 'Calendrier'],
            ['homework', 'Devoirs'],
            ['messages', 'Messages'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? 'active' : ''}
            onClick={() => {
              setTab(id);
              setCompose(false);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {compose ? (
        <form className="communication-form" onSubmit={submit}>
          <label>
            Titre / objet
            <input name="title" required />
          </label>
          {tab === 'news' || tab === 'calendar' ? (
            <label>
              Audience
              <select name="audience">
                {Object.entries(audience).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {tab === 'news' ? (
            <label>
              Expiration
              <input name="expires" type="datetime-local" />
            </label>
          ) : null}
          {tab === 'calendar' ? (
            <>
              <label>
                Lieu
                <input name="location" />
              </label>
              <label>
                Début
                <input name="start" type="datetime-local" required />
              </label>
              <label>
                Fin
                <input name="end" type="datetime-local" required />
              </label>
            </>
          ) : null}
          {tab === 'homework' ? (
            <>
              <label>
                Classe
                <select name="class" required>
                  {classes.data?.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Matière
                <select name="subject" required>
                  {pedagogy.data?.assignments.map((x) => (
                    <option key={x.subjectId} value={x.subjectId}>
                      {x.subjectName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Échéance
                <input name="due" type="datetime-local" required />
              </label>
              <label>
                Publication
                <select name="status">
                  <option value="PUBLISHED">Publier</option>
                  <option value="DRAFT">Brouillon</option>
                </select>
              </label>
            </>
          ) : null}
          {tab === 'messages' ? (
            <label>
              Destinataire
              <select name="recipient" required>
                {staff.data?.map((x) => (
                  <option key={x.userId} value={x.userId}>
                    {x.fullName}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="wide">
            Contenu
            <textarea name="body" required />
          </label>
          <button className="button-primary">Enregistrer</button>
        </form>
      ) : null}
      <div className="communication-feed">
        {tab === 'news' &&
          data.data?.announcements.map((x) => (
            <article key={x.id}>
              <header>
                <span>{audience[x.audience]}</span>
                <time>{new Date(x.publishedAt).toLocaleDateString('fr-CM')}</time>
              </header>
              <h2>{x.title}</h2>
              <p>{x.body}</p>
            </article>
          ))}
        {tab === 'calendar' &&
          data.data?.events.map((x) => (
            <article key={x.id} className="event-card">
              <time>
                <b>
                  {new Date(x.startsAt).toLocaleDateString('fr-CM', {
                    day: '2-digit',
                    month: 'short',
                  })}
                </b>
                {new Date(x.startsAt).toLocaleTimeString('fr-CM', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
              <div>
                <h2>{x.title}</h2>
                <p>{x.description}</p>
                <span>
                  {x.location || 'Lieu à confirmer'} · {audience[x.audience]}
                </span>
              </div>
            </article>
          ))}
        {tab === 'homework' &&
          data.data?.homework.map((x) => (
            <article key={x.id}>
              <header>
                <span>
                  {x.className} · {x.subjectName}
                </span>
                <em>{x.status === 'PUBLISHED' ? 'Publié' : 'Brouillon'}</em>
              </header>
              <h2>{x.title}</h2>
              <p>{x.instructions}</p>
              <footer>À rendre le {new Date(x.dueAt).toLocaleString('fr-CM')}</footer>
            </article>
          ))}
        {tab === 'messages' &&
          data.data?.messages.map((x) => (
            <article key={x.id}>
              <header>
                <span>
                  {x.senderUserId === user?.id ? `À ${x.recipientName}` : `De ${x.senderName}`}
                </span>
                <time>{new Date(x.sentAt).toLocaleString('fr-CM')}</time>
              </header>
              <h2>{x.subject}</h2>
              <p>{x.body}</p>
            </article>
          ))}
      </div>
    </section>
  );
}
