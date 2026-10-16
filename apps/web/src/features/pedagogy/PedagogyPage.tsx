import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ClassDto, PedagogyOverviewDto, SubjectDto } from '@cplan/contracts';
import { api } from '@/shared/api/client';
import { useAcademicYear } from '@/features/academic/use-academic-year';
import { useAuthStore } from '@/features/auth/auth-store';

const moduleSteps = [
  ['Référentiel', 'Matières et affectations', true],
  ['Emplois du temps', 'Planification des cours', true],
  ['Présences', 'Absences et retards', true],
  ['Évaluations', 'Notes et compétences', true],
  ['Bulletins', 'Conseils et éditions', true],
  ['Discipline', 'Incidents et suivi', true],
] as const;

function Stat({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return (
    <div className="pedagogy-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="pedagogy-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="pedagogy-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pedagogy-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <h2 id="pedagogy-modal-title">{title}</h2>
          <button type="button" aria-label="Fermer" onClick={onClose}>
            ×
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

export function PedagogyPage() {
  const academic = useAcademicYear();
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const yearId = academic.selectedYear?.id;
  const [modal, setModal] = useState<'subject' | 'edit-subject' | 'assignment' | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<SubjectDto | null>(null);
  const overview = useQuery({
    queryKey: ['pedagogy-overview', yearId],
    queryFn: () => api.get<PedagogyOverviewDto>(`/pedagogy/overview?academic_year_id=${yearId}`),
    enabled: Boolean(yearId),
  });
  const subjects = useQuery({
    queryKey: ['subjects'],
    queryFn: () => api.get<SubjectDto[]>('/subjects'),
  });
  const classes = useQuery({
    queryKey: ['classes', yearId],
    queryFn: () => api.get<ClassDto[]>(`/classes?academic_year_id=${yearId}`),
    enabled: Boolean(yearId),
  });
  const canManageSubjects = Boolean(user?.permissions.includes('subjects.manage'));
  const canManageAssignments = Boolean(user?.permissions.includes('teaching_assignments.manage'));
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['pedagogy-overview'] });
    void queryClient.invalidateQueries({ queryKey: ['subjects'] });
  };
  const createSubject = useMutation({
    mutationFn: (body: { code: string; name: string; color: string }) =>
      api.post('/subjects', body),
    onSuccess: () => {
      refresh();
      setModal(null);
    },
  });
  const updateSubject = useMutation({
    mutationFn: ({ id, ...body }: SubjectDto) => api.patch(`/subjects/${id}`, body),
    onSuccess: () => {
      refresh();
      setSelectedSubject(null);
      setModal(null);
    },
  });
  const saveAssignment = useMutation({
    mutationFn: (body: {
      academicYearId: string;
      classId: string;
      subjectId: string;
      teacherUserId: string | null;
      weeklyHours: number;
      coefficient: number;
    }) => api.post('/teaching-assignments', body),
    onSuccess: () => {
      refresh();
      setModal(null);
    },
  });
  const schedule = useMemo(() => {
    const rows = overview.data?.assignments ?? [];
    return Array.from({ length: 10 }, (_, index) => rows[index % Math.max(rows.length, 1)] ?? null);
  }, [overview.data?.assignments]);
  if (!yearId)
    return (
      <section className="pedagogy-page">
        <div className="pedagogy-empty">
          Sélectionnez une année scolaire pour ouvrir le centre pédagogique.
        </div>
      </section>
    );
  const data = overview.data;

  return (
    <section className="pedagogy-page">
      <header className="pedagogy-header">
        <div>
          <h1>Pédagogie</h1>
          <p>
            Centre des opérations académiques : matières, enseignants, emplois du temps, présences
            et évaluations.
          </p>
        </div>
        <span className="pedagogy-year">{academic.selectedYear?.name}</span>
      </header>
      <div className="pedagogy-stats">
        <Stat
          label="Matières"
          value={data?.subjectCount ?? '—'}
          detail="au programme cette année"
        />
        <Stat
          label="Enseignants"
          value={data?.teacherCount ?? '—'}
          detail="intervenants affectés"
        />
        <Stat
          label="Classes couvertes"
          value={data ? `${data.coveredClassCount}/${data.totalClassCount}` : '—'}
          detail="avec au moins une matière"
        />
        <Stat
          label="Volume hebdomadaire"
          value={data ? `${data.weeklyHours} h` : '—'}
          detail="d’enseignement planifié"
        />
      </div>
      <div className="pedagogy-workspace">
        <section className="pedagogy-panel assignments-panel">
          <header>
            <div>
              <h2>Répartition des enseignements</h2>
              <p>Une ligne par matière et par classe.</p>
            </div>
            <div className="pedagogy-actions">
              {canManageSubjects ? (
                <button className="button-primary" onClick={() => setModal('subject')}>
                  + Ajouter une matière
                </button>
              ) : null}
              {canManageAssignments ? (
                <button className="button-secondary" onClick={() => setModal('assignment')}>
                  Affecter un enseignant
                </button>
              ) : null}
            </div>
          </header>
          <div className="pedagogy-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Matière</th>
                  <th>Enseignant</th>
                  <th>Classe</th>
                  <th>Volume</th>
                  <th>Coeff.</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {data?.assignments.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <span
                        className="subject-dot"
                        style={{ backgroundColor: item.subjectColor }}
                      />
                      {item.subjectName}
                    </td>
                    <td>{item.teacherName ?? 'À affecter'}</td>
                    <td>{item.className}</td>
                    <td>{item.weeklyHours} h</td>
                    <td>{item.coefficient}</td>
                    <td>
                      <span className={`assignment-status ${item.status.toLowerCase()}`}>
                        {item.status === 'ACTIVE'
                          ? 'Affecté'
                          : item.status === 'INACTIVE'
                            ? 'Inactif'
                            : 'Planifié'}
                      </span>
                    </td>
                  </tr>
                ))}
                {!overview.isLoading && !data?.assignments.length ? (
                  <tr>
                    <td colSpan={6} className="pedagogy-table-empty">
                      Commencez par ajouter les matières, puis affectez les enseignants aux classes.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
        <section className="pedagogy-panel timetable-panel">
          <header>
            <div>
              <h2>Aperçu de la semaine</h2>
              <p>Projection des enseignements affectés.</p>
            </div>
          </header>
          <div className="mini-timetable">
            <span className="time-label">Heure</span>
            {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven'].map((day) => (
              <strong key={day}>{day}</strong>
            ))}
            {['08h', '10h'].flatMap((time, row) => [
              <span className="time-label" key={time}>
                {time}
              </span>,
              ...Array.from({ length: 5 }, (_, column) => {
                const item = schedule[row * 5 + column];
                return (
                  <div
                    className="lesson-cell"
                    key={`${time}-${column}`}
                    style={
                      item
                        ? {
                            borderColor: item.subjectColor,
                            backgroundColor: `${item.subjectColor}12`,
                          }
                        : undefined
                    }
                  >
                    {item ? (
                      <>
                        <b>{item.subjectName}</b>
                        <small>{item.className}</small>
                      </>
                    ) : (
                      <span>—</span>
                    )}
                  </div>
                );
              }),
            ])}
          </div>
        </section>
      </div>
      <section className="pedagogy-panel assignments-panel">
        <header>
          <div>
            <h2>Référentiel des matières</h2>
            <p>Codes, couleurs et disponibilité pour les nouvelles affectations.</p>
          </div>
        </header>
        <div className="pedagogy-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Matière</th>
                <th>Statut</th>
                {canManageSubjects ? <th>Action</th> : null}
              </tr>
            </thead>
            <tbody>
              {subjects.data?.map((subject) => (
                <tr key={subject.id}>
                  <td>{subject.code}</td>
                  <td>
                    <span className="subject-dot" style={{ backgroundColor: subject.color }} />
                    {subject.name}
                  </td>
                  <td>{subject.status === 'ACTIVE' ? 'Active' : 'Inactive'}</td>
                  {canManageSubjects ? (
                    <td>
                      <button
                        type="button"
                        className="button-secondary"
                        onClick={() => {
                          setSelectedSubject(subject);
                          setModal('edit-subject');
                        }}
                      >
                        Modifier
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
              {!subjects.isLoading && !subjects.data?.length ? (
                <tr>
                  <td colSpan={canManageSubjects ? 4 : 3} className="pedagogy-table-empty">
                    Aucune matière enregistrée.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      <section className="pedagogy-roadmap" aria-label="Progression des modules pédagogiques">
        {moduleSteps.map(([name, detail, active], index) => (
          <div className={active ? 'active' : ''} key={name}>
            <span>{index + 1}</span>
            <strong>{name}</strong>
            <small>{detail}</small>
            <em>{active ? 'Actif' : 'À venir'}</em>
          </div>
        ))}
      </section>
      {modal === 'subject' ? (
        <Modal title="Ajouter une matière" onClose={() => setModal(null)}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              createSubject.mutate({
                code: String(form.get('code')),
                name: String(form.get('name')),
                color: String(form.get('color')),
              });
            }}
          >
            <label>
              Code
              <input name="code" required maxLength={20} placeholder="MATH" />
            </label>
            <label>
              Nom de la matière
              <input name="name" required maxLength={100} placeholder="Mathématiques" />
            </label>
            <label>
              Couleur
              <input name="color" type="color" defaultValue="#2B6CB0" />
            </label>
            {createSubject.error ? (
              <p className="form-error">{createSubject.error.message}</p>
            ) : null}
            <footer>
              <button type="button" className="button-secondary" onClick={() => setModal(null)}>
                Annuler
              </button>
              <button className="button-primary" disabled={createSubject.isPending}>
                {createSubject.isPending ? 'Enregistrement…' : 'Ajouter'}
              </button>
            </footer>
          </form>
        </Modal>
      ) : null}
      {modal === 'edit-subject' && selectedSubject ? (
        <Modal
          title="Modifier la matière"
          onClose={() => {
            setSelectedSubject(null);
            setModal(null);
          }}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              updateSubject.mutate({
                ...selectedSubject,
                code: String(form.get('code')),
                name: String(form.get('name')),
                color: String(form.get('color')),
                status: String(form.get('status')) as SubjectDto['status'],
              });
            }}
          >
            <label>
              Code
              <input name="code" required maxLength={20} defaultValue={selectedSubject.code} />
            </label>
            <label>
              Nom de la matière
              <input name="name" required maxLength={100} defaultValue={selectedSubject.name} />
            </label>
            <label>
              Couleur
              <input name="color" type="color" defaultValue={selectedSubject.color} />
            </label>
            <label>
              Statut
              <select name="status" defaultValue={selectedSubject.status}>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </label>
            <p>
              Une matière inactive reste dans l’historique, mais ses affectations sont désactivées
              et elle ne peut plus être utilisée pour une nouvelle évaluation.
            </p>
            {updateSubject.error ? (
              <p className="form-error">{updateSubject.error.message}</p>
            ) : null}
            <footer>
              <button
                type="button"
                className="button-secondary"
                onClick={() => {
                  setSelectedSubject(null);
                  setModal(null);
                }}
              >
                Annuler
              </button>
              <button className="button-primary" disabled={updateSubject.isPending}>
                {updateSubject.isPending ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </footer>
          </form>
        </Modal>
      ) : null}
      {modal === 'assignment' ? (
        <Modal title="Affecter un enseignant" onClose={() => setModal(null)}>
          <AssignmentForm
            yearId={yearId}
            subjects={subjects.data ?? []}
            classes={classes.data ?? []}
            teachers={data?.teachers ?? []}
            pending={saveAssignment.isPending}
            error={saveAssignment.error?.message ?? ''}
            onSubmit={(body) => saveAssignment.mutate(body)}
            onCancel={() => setModal(null)}
          />
        </Modal>
      ) : null}
    </section>
  );
}

function AssignmentForm({
  yearId,
  subjects,
  classes,
  teachers,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  yearId: string;
  subjects: SubjectDto[];
  classes: ClassDto[];
  teachers: PedagogyOverviewDto['teachers'];
  pending: boolean;
  error: string;
  onSubmit: (body: {
    academicYearId: string;
    classId: string;
    subjectId: string;
    teacherUserId: string | null;
    weeklyHours: number;
    coefficient: number;
  }) => void;
  onCancel: () => void;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSubmit({
      academicYearId: yearId,
      classId: String(form.get('classId')),
      subjectId: String(form.get('subjectId')),
      teacherUserId: String(form.get('teacherUserId')) || null,
      weeklyHours: Number(form.get('weeklyHours')),
      coefficient: Number(form.get('coefficient')),
    });
  };
  return (
    <form onSubmit={submit}>
      <label>
        Matière
        <select name="subjectId" required defaultValue="">
          <option value="" disabled>
            Sélectionner
          </option>
          {subjects
            .filter((item) => item.status === 'ACTIVE')
            .map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
        </select>
      </label>
      <label>
        Classe
        <select name="classId" required defaultValue="">
          <option value="" disabled>
            Sélectionner
          </option>
          {classes
            .filter((item) => item.status === 'ACTIVE')
            .map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
        </select>
      </label>
      <label>
        Enseignant
        <select name="teacherUserId" defaultValue="">
          <option value="">À affecter plus tard</option>
          {teachers.map((item) => (
            <option value={item.id} key={item.id}>
              {item.name}
              {item.jobTitle ? ` · ${item.jobTitle}` : ''}
            </option>
          ))}
        </select>
      </label>
      <label>
        Heures par semaine
        <input name="weeklyHours" type="number" min={1} max={40} defaultValue={4} required />
      </label>
      <label>
        Coefficient de la matière
        <input
          name="coefficient"
          type="number"
          min={0.01}
          max={100}
          step={0.01}
          defaultValue={1}
          required
        />
      </label>
      {error ? <p className="form-error">{error}</p> : null}
      <footer>
        <button type="button" className="button-secondary" onClick={onCancel}>
          Annuler
        </button>
        <button className="button-primary" disabled={pending}>
          {pending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </footer>
    </form>
  );
}
