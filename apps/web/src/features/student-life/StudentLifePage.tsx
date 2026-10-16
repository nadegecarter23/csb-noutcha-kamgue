import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { HealthVisitDto, IncidentDto, Paginated, StudentDto } from '@cplan/contracts';
import { api } from '@/shared/api/client';
import { useAcademicYear } from '@/features/academic/use-academic-year';
import { useAuthStore } from '@/features/auth/auth-store';
export function StudentLifePage() {
  const academic = useAcademicYear();
  const user = useAuthStore((s) => s.user);
  const client = useQueryClient();
  const yearId = academic.selectedYear?.id;
  const [tab, setTab] = useState<'discipline' | 'health'>('discipline');
  const [form, setForm] = useState(false);
  const incidents = useQuery({
    queryKey: ['student-life', yearId],
    queryFn: () => api.get<IncidentDto[]>(`/student-life/incidents?academic_year_id=${yearId}`),
    enabled: Boolean(yearId),
  });
  const health = useQuery({
    queryKey: ['health-visits', yearId],
    queryFn: () =>
      api.get<HealthVisitDto[]>(`/student-life/health-visits?academic_year_id=${yearId}`),
    enabled: Boolean(yearId && user?.permissions.includes('health_records.read')),
  });
  const students = useQuery({
    queryKey: ['students-life', yearId],
    queryFn: () =>
      api.get<Paginated<StudentDto>>(`/students?academic_year_id=${yearId}&page_size=100`),
    enabled: Boolean(yearId),
  });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['student-life'] });
    void client.invalidateQueries({ queryKey: ['health-visits'] });
  };
  const create = useMutation({
    mutationFn: ({ path, body }: { path: string; body: unknown }) => api.post(path, body),
    onSuccess: () => {
      setForm(false);
      refresh();
    },
  });
  const close = useMutation({
    mutationFn: (id: string) => api.post(`/student-life/incidents/${id}/close`),
    onSuccess: refresh,
  });
  const canHealth = Boolean(user?.permissions.includes('health_records.read'));
  const canManage =
    tab === 'discipline'
      ? Boolean(user?.permissions.includes('student_life.manage'))
      : Boolean(user?.permissions.includes('health_records.manage'));
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (tab === 'discipline')
      create.mutate({
        path: '/student-life/incidents',
        body: {
          enrollmentId: String(data.get('enrollment')),
          occurredAt: new Date(String(data.get('date'))).toISOString(),
          category: String(data.get('category')),
          severity: String(data.get('severity')),
          description: String(data.get('description')),
        },
      });
    else
      create.mutate({
        path: '/student-life/health-visits',
        body: {
          enrollmentId: String(data.get('enrollment')),
          visitedAt: new Date(String(data.get('date'))).toISOString(),
          symptoms: String(data.get('symptoms')),
          actionTaken: String(data.get('action')),
          guardianNotified: Boolean(data.get('notified')),
        },
      });
  };
  return (
    <section className="student-life-page">
      <header>
        <div>
          <h1>Vie scolaire</h1>
          <p>Centralisez les incidents, mesures éducatives et passages à l’infirmerie.</p>
        </div>
        {canManage ? (
          <button className="button-primary" onClick={() => setForm((v) => !v)}>
            + Nouveau dossier
          </button>
        ) : null}
      </header>
      <div className="life-tabs">
        <button
          className={tab === 'discipline' ? 'active' : ''}
          onClick={() => {
            setTab('discipline');
            setForm(false);
          }}
        >
          Discipline <span>{incidents.data?.filter((i) => i.status === 'OPEN').length ?? 0}</span>
        </button>
        {canHealth ? (
          <button
            className={tab === 'health' ? 'active' : ''}
            onClick={() => {
              setTab('health');
              setForm(false);
            }}
          >
            Infirmerie <span>{health.data?.length ?? 0}</span>
          </button>
        ) : null}
      </div>
      {form ? (
        <form className="life-form" onSubmit={submit}>
          <label>
            Élève
            <select name="enrollment" required>
              {students.data?.data.flatMap((s) =>
                s.currentEnrollment
                  ? [
                      <option key={s.currentEnrollment.id} value={s.currentEnrollment.id}>
                        {s.lastName} {s.firstName} · {s.currentEnrollment.className}
                      </option>,
                    ]
                  : [],
              )}
            </select>
          </label>
          <label>
            Date et heure
            <input name="date" type="datetime-local" required />
          </label>
          {tab === 'discipline' ? (
            <>
              <label>
                Catégorie
                <input name="category" required placeholder="Comportement" />
              </label>
              <label>
                Gravité
                <select name="severity">
                  <option value="LOW">Faible</option>
                  <option value="MEDIUM">Moyenne</option>
                  <option value="HIGH">Élevée</option>
                  <option value="CRITICAL">Critique</option>
                </select>
              </label>
              <label className="wide">
                Description
                <textarea name="description" required />
              </label>
            </>
          ) : (
            <>
              <label>
                Symptômes
                <input name="symptoms" required />
              </label>
              <label>
                Prise en charge
                <input name="action" required />
              </label>
              <label>
                <input name="notified" type="checkbox" /> Responsable prévenu
              </label>
            </>
          )}
          <button className="button-primary">Enregistrer</button>
        </form>
      ) : null}
      {tab === 'discipline' ? (
        <div className="life-grid">
          {incidents.data?.map((item) => (
            <article key={item.id}>
              <header>
                <span className={`severity ${item.severity.toLowerCase()}`}>{item.severity}</span>
                <time>{new Date(item.occurredAt).toLocaleDateString('fr-CM')}</time>
              </header>
              <h2>{item.studentName}</h2>
              <p>
                {item.className} · {item.category}
              </p>
              <blockquote>{item.description}</blockquote>
              <footer>
                <span>{item.sanctions.length} mesure(s)</span>
                {item.status === 'OPEN' && canManage ? (
                  <button onClick={() => close.mutate(item.id)}>Clôturer</button>
                ) : (
                  <b>Clôturé</b>
                )}
              </footer>
            </article>
          ))}
        </div>
      ) : (
        <div className="health-list">
          {health.data?.map((item) => (
            <article key={item.id}>
              <div>
                <strong>{item.studentName}</strong>
                <span>{new Date(item.visitedAt).toLocaleString('fr-CM')}</span>
              </div>
              <p>
                <b>Symptômes :</b> {item.symptoms}
              </p>
              <p>
                <b>Prise en charge :</b> {item.actionTaken}
              </p>
              <em>{item.guardianNotified ? 'Responsable prévenu' : 'Responsable non prévenu'}</em>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
