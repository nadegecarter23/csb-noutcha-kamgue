import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AssessmentDto,
  AssessmentOverviewDto,
  ClassDto,
  PedagogyOverviewDto,
} from '@cplan/contracts';
import { api } from '@/shared/api/client';
import { useAcademicYear } from '@/features/academic/use-academic-year';
import { useAuthStore } from '@/features/auth/auth-store';

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="pedagogy-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="pedagogy-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <h2>{title}</h2>
          <button aria-label="Fermer" onClick={onClose}>
            ×
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

export function AssessmentsPage() {
  const academic = useAcademicYear();
  const user = useAuthStore((state) => state.user);
  const client = useQueryClient();
  const yearId = academic.selectedYear?.id;
  const [classId, setClassId] = useState('');
  const [periodId, setPeriodId] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState<AssessmentDto | null>(null);
  const [modal, setModal] = useState<'assessment' | 'settings' | null>(null);
  const query = new URLSearchParams({ academic_year_id: yearId ?? '' });
  if (classId) query.set('class_id', classId);
  if (periodId) query.set('period_id', periodId);
  const overview = useQuery({
    queryKey: ['assessment-overview', yearId, classId, periodId],
    queryFn: () => api.get<AssessmentOverviewDto>(`/assessments/overview?${query}`),
    enabled: Boolean(yearId),
  });
  const pedagogy = useQuery({
    queryKey: ['pedagogy-overview', yearId],
    queryFn: () => api.get<PedagogyOverviewDto>(`/pedagogy/overview?academic_year_id=${yearId}`),
    enabled: Boolean(yearId),
  });
  const classes = useQuery({
    queryKey: ['classes', yearId],
    queryFn: () => api.get<ClassDto[]>(`/classes?academic_year_id=${yearId}`),
    enabled: Boolean(yearId),
  });
  const selected =
    draft ??
    overview.data?.assessments.find((item) => item.id === selectedId) ??
    overview.data?.assessments[0] ??
    null;
  useEffect(() => {
    if (!selectedId && overview.data?.assessments[0])
      setSelectedId(overview.data.assessments[0].id);
  }, [overview.data, selectedId]);
  useEffect(() => {
    setDraft(null);
    setSelectedId('');
  }, [classId, periodId]);
  const refresh = () => void client.invalidateQueries({ queryKey: ['assessment-overview'] });
  const create = useMutation({
    mutationFn: (body: unknown) => api.post<AssessmentDto>('/assessments', body),
    onSuccess: (data) => {
      setSelectedId(data.id);
      setDraft(data);
      setModal(null);
      refresh();
    },
  });
  const setup = useMutation({
    mutationFn: ({ path, body }: { path: string; body: unknown }) => api.post(path, body),
    onSuccess: () => {
      refresh();
      setModal(null);
    },
  });
  const changePeriod = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'OPEN' | 'CLOSED' }) =>
      api.patch(`/academic-periods/${id}/status`, { status }),
    onSuccess: () => {
      refresh();
    },
  });
  const save = useMutation({
    mutationFn: (assessment: AssessmentDto) =>
      api.put<AssessmentDto>(`/assessments/${assessment.id}/grades`, {
        grades: assessment.grades.map(({ enrollmentId, score, isAbsent, comment }) => ({
          enrollmentId,
          score,
          isAbsent,
          comment,
        })),
      }),
    onSuccess: (data) => {
      setDraft(data);
      refresh();
    },
  });
  const publish = useMutation({
    mutationFn: ({ id, lock }: { id: string; lock: boolean }) =>
      api.post<AssessmentDto>(`/assessments/${id}/publish`, { lock }),
    onSuccess: (data) => {
      setDraft(data);
      refresh();
    },
  });
  const canManage = Boolean(user?.permissions.includes('assessments.manage'));
  const canGrade = Boolean(user?.permissions.includes('assessments.grade'));
  const canPublish = Boolean(user?.permissions.includes('assessments.publish'));
  const stats = useMemo(
    () => ({
      assessments: overview.data?.assessments.length ?? 0,
      published: overview.data?.assessments.filter((item) => item.status !== 'DRAFT').length ?? 0,
      graded:
        overview.data?.assessments.reduce(
          (sum, item) =>
            sum + item.grades.filter((grade) => grade.score !== null || grade.isAbsent).length,
          0,
        ) ?? 0,
      expected: overview.data?.assessments.reduce((sum, item) => sum + item.grades.length, 0) ?? 0,
    }),
    [overview.data],
  );
  const updateGrade = (enrollmentId: string, patch: Partial<AssessmentDto['grades'][number]>) => {
    if (!selected || selected.status === 'LOCKED') return;
    setDraft({
      ...selected,
      grades: selected.grades.map((grade) =>
        grade.enrollmentId === enrollmentId ? { ...grade, ...patch } : grade,
      ),
    });
  };
  if (!yearId)
    return (
      <section>
        <p>Sélectionnez une année scolaire.</p>
      </section>
    );
  return (
    <section className="assessments-page">
      <header className="assessments-header">
        <div>
          <h1>Évaluations et notes</h1>
          <p>Planifiez les évaluations, saisissez les notes et maîtrisez les règles de calcul.</p>
        </div>
        {canManage ? (
          <div>
            <button className="button-secondary" onClick={() => setModal('settings')}>
              Paramétrer
            </button>
            <button className="button-primary" onClick={() => setModal('assessment')}>
              + Nouvelle évaluation
            </button>
          </div>
        ) : null}
      </header>
      <div className="assessment-filters">
        <label>
          Classe
          <select value={classId} onChange={(event) => setClassId(event.target.value)}>
            <option value="">Toutes les classes</option>
            {classes.data?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Période
          <select value={periodId} onChange={(event) => setPeriodId(event.target.value)}>
            <option value="">Toutes les périodes</option>
            {overview.data?.periods.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <article>
          <span>Évaluations</span>
          <strong>{stats.assessments}</strong>
        </article>
        <article>
          <span>Publiées</span>
          <strong>{stats.published}</strong>
        </article>
        <article>
          <span>Notes saisies</span>
          <strong>
            {stats.graded}/{stats.expected}
          </strong>
        </article>
      </div>
      <div className="assessments-workspace">
        <aside className="assessment-list">
          <header>
            <strong>Évaluations</strong>
            <span>
              {overview.data?.policies.find((item) => item.isActive)
                ? `Règle v${overview.data.policies.find((item) => item.isActive)?.version}`
                : 'Règle à configurer'}
            </span>
          </header>
          {overview.data?.assessments.map((item) => (
            <button
              key={item.id}
              className={selected?.id === item.id ? 'active' : ''}
              onClick={() => {
                setSelectedId(item.id);
                setDraft(null);
              }}
            >
              <span>
                <b>{item.title}</b>
                <small>
                  {item.subjectName} · {item.className}
                </small>
              </span>
              <em className={item.status.toLowerCase()}>
                {item.status === 'DRAFT'
                  ? 'Brouillon'
                  : item.status === 'LOCKED'
                    ? 'Verrouillée'
                    : 'Publiée'}
              </em>
            </button>
          ))}
          {!overview.data?.assessments.length ? <p>Aucune évaluation.</p> : null}
        </aside>
        <div className="gradebook">
          {selected ? (
            <>
              <header>
                <div>
                  <h2>{selected.title}</h2>
                  <p>
                    {selected.typeName} · {selected.periodName} · barème /{selected.maxScore} ·
                    coefficient {selected.weight}
                  </p>
                </div>
                <div>
                  {canGrade && selected.status !== 'LOCKED' ? (
                    <button className="button-secondary" onClick={() => save.mutate(selected)}>
                      Enregistrer
                    </button>
                  ) : null}
                  {canPublish && selected.status !== 'LOCKED' ? (
                    <button
                      className="button-primary"
                      onClick={() =>
                        publish.mutate({ id: selected.id, lock: selected.status === 'PUBLISHED' })
                      }
                    >
                      {selected.status === 'PUBLISHED' ? 'Verrouiller' : 'Publier'}
                    </button>
                  ) : null}
                </div>
              </header>
              <div className="competency-chips">
                {selected.competencies.map((item) => (
                  <span key={item.id}>
                    {item.code} · {item.name}
                  </span>
                ))}
              </div>
              <div className="gradebook-table">
                <table>
                  <thead>
                    <tr>
                      <th>Élève</th>
                      <th>Note /{selected.maxScore}</th>
                      <th>Absent</th>
                      <th>Appréciation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.grades.map((grade) => (
                      <tr key={grade.id}>
                        <td>
                          <strong>{grade.studentName}</strong>
                          <span>{grade.studentNumber}</span>
                        </td>
                        <td>
                          <input
                            aria-label={`Note de ${grade.studentName}`}
                            type="number"
                            min={0}
                            max={selected.maxScore}
                            step="0.25"
                            value={grade.score ?? ''}
                            disabled={grade.isAbsent || selected.status === 'LOCKED' || !canGrade}
                            onChange={(event) =>
                              updateGrade(grade.enrollmentId, {
                                score:
                                  event.target.value === '' ? null : Number(event.target.value),
                              })
                            }
                          />
                        </td>
                        <td>
                          <input
                            aria-label={`Absence de ${grade.studentName}`}
                            type="checkbox"
                            checked={grade.isAbsent}
                            disabled={selected.status === 'LOCKED' || !canGrade}
                            onChange={(event) =>
                              updateGrade(grade.enrollmentId, {
                                isAbsent: event.target.checked,
                                score: event.target.checked ? null : grade.score,
                              })
                            }
                          />
                        </td>
                        <td>
                          <input
                            aria-label={`Appréciation de ${grade.studentName}`}
                            value={grade.comment ?? ''}
                            disabled={selected.status === 'LOCKED' || !canGrade}
                            placeholder="Facultatif"
                            onChange={(event) =>
                              updateGrade(grade.enrollmentId, { comment: event.target.value })
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="attendance-empty">
              <strong>Sélectionnez une évaluation</strong>
            </div>
          )}
        </div>
      </div>
      {modal === 'assessment' && overview.data ? (
        <Modal title="Créer une évaluation" onClose={() => setModal(null)}>
          <AssessmentForm
            yearId={yearId}
            data={overview.data}
            assignments={pedagogy.data?.assignments ?? []}
            pending={create.isPending}
            error={create.error?.message ?? ''}
            onCancel={() => setModal(null)}
            onSubmit={(body) => create.mutate(body)}
          />
        </Modal>
      ) : null}
      {modal === 'settings' ? (
        <Modal title="Paramètres d’évaluation" onClose={() => setModal(null)}>
          <AssessmentSettings
            yearId={yearId}
            periods={overview.data?.periods ?? []}
            pending={setup.isPending || changePeriod.isPending}
            error={setup.error?.message ?? changePeriod.error?.message ?? ''}
            onSubmit={(path, body) => setup.mutate({ path, body })}
            onPeriodStatus={(id, status) => changePeriod.mutate({ id, status })}
          />
        </Modal>
      ) : null}
    </section>
  );
}

function AssessmentSettings({
  yearId,
  periods,
  pending,
  error,
  onSubmit,
  onPeriodStatus,
}: {
  yearId: string;
  periods: AssessmentOverviewDto['periods'];
  pending: boolean;
  error: string;
  onSubmit: (path: string, body: unknown) => void;
  onPeriodStatus: (id: string, status: 'OPEN' | 'CLOSED') => void;
}) {
  return (
    <div className="assessment-settings">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          onSubmit('/academic-periods', {
            academicYearId: yearId,
            name: String(data.get('name')),
            orderIndex: Number(data.get('order')),
            startDate: String(data.get('start')),
            endDate: String(data.get('end')),
          });
        }}
      >
        <h3>Nouvelle période</h3>
        <input name="name" required placeholder="Trimestre 2" />
        <input name="order" type="number" min={1} required placeholder="Ordre" />
        <input name="start" type="date" required />
        <input name="end" type="date" required />
        <button className="button-secondary" disabled={pending}>
          Ajouter
        </button>
      </form>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          onSubmit('/assessment-types', {
            code: String(data.get('code')),
            name: String(data.get('name')),
            defaultWeight: Number(data.get('weight')),
          });
        }}
      >
        <h3>Type d’évaluation</h3>
        <input name="code" required placeholder="EXAMEN" />
        <input name="name" required placeholder="Examen séquentiel" />
        <input
          name="weight"
          type="number"
          min={0.1}
          step="0.1"
          required
          placeholder="Coefficient"
        />
        <button className="button-secondary" disabled={pending}>
          Ajouter
        </button>
      </form>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          onSubmit('/competencies', {
            code: String(data.get('code')),
            name: String(data.get('name')),
            description: String(data.get('description')) || null,
          });
        }}
      >
        <h3>Compétence</h3>
        <input name="code" required placeholder="CALC" />
        <input name="name" required placeholder="Résoudre un problème" />
        <input name="description" placeholder="Description" />
        <button className="button-secondary" disabled={pending}>
          Ajouter
        </button>
      </form>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          onSubmit('/grading-policies', {
            academicYearId: yearId,
            cycle: null,
            roundingDigits: Number(data.get('rounding')),
            weightingMode: String(data.get('mode')),
            absenceHandling: String(data.get('absence')),
            rankingEnabled: Boolean(data.get('ranking')),
          });
        }}
      >
        <h3>Nouvelle version de calcul</h3>
        <select name="mode">
          <option value="WEIGHTED_AVERAGE">Moyenne pondérée</option>
          <option value="POINTS_TOTAL">Total de points</option>
        </select>
        <select name="absence">
          <option value="EXCLUDE">Absence exclue du calcul</option>
          <option value="ZERO">Absence comptée zéro</option>
        </select>
        <select name="rounding">
          <option value="2">2 décimales</option>
          <option value="1">1 décimale</option>
          <option value="0">Entier</option>
        </select>
        <label>
          <input name="ranking" type="checkbox" defaultChecked /> Afficher les rangs
        </label>
        <button className="button-secondary" disabled={pending}>
          Versionner
        </button>
      </form>
      <section>
        <h3>Cycle de vie des périodes</h3>
        {periods.map((period) => (
          <div key={period.id}>
            <span>
              {period.name} ·{' '}
              {period.status === 'DRAFT'
                ? 'Brouillon'
                : period.status === 'OPEN'
                  ? 'Ouverte'
                  : 'Clôturée'}
            </span>
            {period.status !== 'CLOSED' ? (
              <button
                type="button"
                className="button-secondary"
                disabled={pending}
                onClick={() =>
                  onPeriodStatus(period.id, period.status === 'DRAFT' ? 'OPEN' : 'CLOSED')
                }
              >
                {period.status === 'DRAFT' ? 'Ouvrir' : 'Clôturer'}
              </button>
            ) : null}
          </div>
        ))}
      </section>
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}

function AssessmentForm({
  yearId,
  data,
  assignments,
  pending,
  error,
  onCancel,
  onSubmit,
}: {
  yearId: string;
  data: AssessmentOverviewDto;
  assignments: PedagogyOverviewDto['assignments'];
  pending: boolean;
  error: string;
  onCancel: () => void;
  onSubmit: (body: unknown) => void;
}) {
  const [typeId, setTypeId] = useState(data.types[0]?.id ?? '');
  const defaultWeight = data.types.find((item) => item.id === typeId)?.defaultWeight ?? 1;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSubmit({
      academicYearId: yearId,
      periodId: String(form.get('period')),
      teachingAssignmentId: String(form.get('assignment')),
      typeId: String(form.get('type')),
      title: String(form.get('title')),
      date: String(form.get('date')),
      maxScore: Number(form.get('maxScore')),
      weight: Number(form.get('weight')),
      competencyIds: form.getAll('competencies').map(String),
    });
  };
  return (
    <form onSubmit={submit}>
      <label>
        Période
        <select name="period" required>
          {data.periods
            .filter((item) => item.status !== 'CLOSED')
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
        </select>
      </label>
      <label>
        Enseignement
        <select name="assignment" required>
          {assignments
            .filter((item) => item.status !== 'INACTIVE')
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.subjectName} · {item.className}
              </option>
            ))}
        </select>
      </label>
      <label>
        Type
        <select
          name="type"
          required
          value={typeId}
          onChange={(event) => setTypeId(event.target.value)}
        >
          {data.types
            .filter((item) => item.status === 'ACTIVE')
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
        </select>
      </label>
      <label>
        Titre
        <input name="title" required placeholder="Devoir n°1" />
      </label>
      <label>
        Date
        <input
          name="date"
          type="date"
          required
          defaultValue={data.periods.find((item) => item.status !== 'CLOSED')?.startDate}
        />
      </label>
      <label>
        Barème
        <input name="maxScore" type="number" min={1} max={1000} defaultValue={20} required />
      </label>
      <label>
        Coefficient
        <input
          key={typeId}
          name="weight"
          type="number"
          min={0.1}
          max={100}
          step="0.1"
          defaultValue={defaultWeight}
          required
        />
      </label>
      <label>
        Compétences
        <select name="competencies" multiple>
          {data.competencies.map((item) => (
            <option key={item.id} value={item.id}>
              {item.code} · {item.name}
            </option>
          ))}
        </select>
      </label>
      {error ? <p className="form-error">{error}</p> : null}
      <footer>
        <button type="button" className="button-secondary" onClick={onCancel}>
          Annuler
        </button>
        <button className="button-primary" disabled={pending || !typeId}>
          Créer
        </button>
      </footer>
    </form>
  );
}
