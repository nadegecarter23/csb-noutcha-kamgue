import { useQuery } from '@tanstack/react-query';
import type { PortalOverviewDto } from '@cplan/contracts';
import { api } from '@/shared/api/client';
import { useAcademicYear } from '@/features/academic/use-academic-year';
const titles = {
  TEACHER: 'Espace enseignant',
  PARENT: 'Espace famille',
  STUDENT: 'Espace élève',
  STAFF: 'Mon espace',
} as const;
const decimal = (value: number) => value.toFixed(2).replace('.', ',');
export function PortalPage() {
  const academic = useAcademicYear();
  const yearId = academic.selectedYear?.id;
  const portal = useQuery({
    queryKey: ['portal', yearId],
    queryFn: () => api.get<PortalOverviewDto>(`/portal?academic_year_id=${yearId}`),
    enabled: Boolean(yearId),
  });
  const data = portal.data;
  if (!data)
    return (
      <section>
        <p>Chargement de votre espace…</p>
      </section>
    );
  return (
    <section className="portal-page">
      <header>
        <div>
          <span>{titles[data.mode]}</span>
          <h1>Bonjour, {data.displayName.split(' ')[0]}</h1>
          <p>Voici les informations utiles pour votre journée.</p>
        </div>
        <strong>{academic.selectedYear?.name}</strong>
      </header>
      <div className="portal-kpis">
        {data.cards.map((x) => (
          <article key={x.label}>
            <span>{x.label}</span>
            <strong>{x.value}</strong>
            <small>{x.hint}</small>
          </article>
        ))}
      </div>
      {data.learners.length ? (
        <section className="portal-learners">
          <h2>{data.mode === 'PARENT' ? 'Mes enfants' : 'Ma scolarité'}</h2>
          <div>
            {data.learners.map((x) => (
              <article key={x.id}>
                <span className="avatar">
                  {x.name
                    .split(' ')
                    .map((p) => p[0])
                    .join('')
                    .slice(0, 2)}
                </span>
                <div>
                  <strong>{x.name}</strong>
                  <small>{x.className ?? 'Classe à affecter'}</small>
                </div>
                <p>
                  <b>{x.attendanceRate === null ? '—' : `${decimal(x.attendanceRate)} %`}</b>
                  <small>présence</small>
                </p>
                <p>
                  <b>{x.average === null ? '—' : `${decimal(x.average)}/20`}</b>
                  <small>moyenne</small>
                </p>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      <div className="portal-columns">
        <section>
          <h2>Prochainement</h2>
          <div className="portal-timeline">
            {data.schedule.map((x) => (
              <article key={x.id}>
                <time>
                  {new Date(x.startsAt).toLocaleDateString('fr-CM', {
                    weekday: 'short',
                    day: '2-digit',
                  })}
                  <b>
                    {new Date(x.startsAt).toLocaleTimeString('fr-CM', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </b>
                </time>
                <div>
                  <strong>{x.title}</strong>
                  <span>{x.detail}</span>
                </div>
              </article>
            ))}
            {!data.schedule.length ? <p>Aucun cours publié à venir.</p> : null}
          </div>
        </section>
        <section>
          <h2>Devoirs à rendre</h2>
          <div className="portal-homework">
            {data.homework.map((x) => (
              <article key={x.id}>
                <span>
                  {x.subjectName} · {x.className}
                </span>
                <strong>{x.title}</strong>
                <p>{x.instructions}</p>
                <time>{new Date(x.dueAt).toLocaleDateString('fr-CM')}</time>
              </article>
            ))}
            {!data.homework.length ? <p>Aucun devoir publié.</p> : null}
          </div>
        </section>
      </div>
      <section className="portal-news">
        <h2>Informations</h2>
        <div>
          {data.announcements.map((x) => (
            <article key={x.id}>
              <time>{new Date(x.publishedAt).toLocaleDateString('fr-CM')}</time>
              <h3>{x.title}</h3>
              <p>{x.body}</p>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
