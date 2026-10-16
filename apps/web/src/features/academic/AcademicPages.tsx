import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AcademicYearDto,
  ClassDto,
  FeeStructureDto,
  GradeLevelDto,
  Paginated,
  SchoolSettingsDto,
  StudentCategoryDto,
  StudentDto,
  OrganizationTree,
} from '@cplan/contracts';
import { api, ApiError } from '@/shared/api/client';
import { useAuthStore } from '@/features/auth/auth-store';
import { useAcademicYear } from './use-academic-year';
import { RegistrarIndicators } from '@/features/students/StudentsPages';
import { ModuleSettingsPanel } from './ModuleSettingsPanel';

const statusLabels: Record<string, string> = {
  DRAFT: 'Brouillon',
  ACTIVE: 'Active',
  CLOSED: 'Clôturée',
  ARCHIVED: 'Archivée',
  INACTIVE: 'Inactive',
};
const errorMessage = (error: unknown) =>
  error instanceof ApiError ? error.message : 'Une erreur est survenue.';

export function OrganizationPage() {
  const client = useQueryClient();
  const me = useAuthStore((state) => state.user);
  const [message, setMessage] = useState('');
  const organization = useQuery({
    queryKey: ['organization'],
    queryFn: () => api.get<OrganizationTree>('/organization'),
  });
  const update = useMutation({
    mutationFn: ({
      kind,
      id,
      body,
    }: {
      kind: 'units' | 'sections' | 'tracks';
      id: string;
      body: Record<string, unknown>;
    }) => api.patch(`/organization/${kind}/${id}`, body),
    onSuccess: () => client.invalidateQueries({ queryKey: ['organization'] }),
    onError: (error) => setMessage(errorMessage(error)),
  });
  const canManage = Boolean(me?.permissions.includes('grade_levels.manage'));
  const rename = (kind: 'units' | 'sections' | 'tracks', id: string, current: string) => {
    const name = window.prompt('Nouveau libellé', current)?.trim();
    if (name && name !== current) update.mutate({ kind, id, body: { name } });
  };
  return (
    <section className="space-y-5">
      <PageTitle
        eyebrow="Référentiel"
        title="Organisation du complexe"
        subtitle="Unités, sections linguistiques et filières utilisées par tous les modules."
      />
      {message ? <Notice message={message} /> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {organization.data?.map((unit) => (
          <article key={unit.id} className="rounded-xl border bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-brand-700">{unit.code}</p>
                <h2>{unit.name}</h2>
              </div>
              <Status value={unit.status} />
            </div>
            <div className="mt-4">
              <strong className="text-sm">Sections</strong>
              <div className="mt-2 flex flex-wrap gap-2">
                {unit.languageSections.map((section) => (
                  <button
                    type="button"
                    key={section.id}
                    disabled={!canManage}
                    onClick={() => rename('sections', section.id, section.name)}
                    className="rounded-full bg-slate-100 px-3 py-1 text-sm"
                  >
                    {section.name}
                  </button>
                ))}
              </div>
            </div>
            {unit.educationTracks.length ? (
              <div className="mt-4">
                <strong className="text-sm">Filières</strong>
                <div className="mt-2 flex flex-wrap gap-2">
                  {unit.educationTracks.map((track) => (
                    <button
                      type="button"
                      key={track.id}
                      disabled={!canManage}
                      onClick={() => rename('tracks', track.id, track.name)}
                      className="rounded-full bg-brand-50 px-3 py-1 text-sm text-brand-800"
                    >
                      {track.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {canManage ? (
              <button
                type="button"
                className="mt-4 text-sm text-brand-700"
                onClick={() => rename('units', unit.id, unit.name)}
              >
                Renommer l’unité
              </button>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

export function SchoolDashboardPage() {
  const user = useAuthStore((state) => state.user);
  const firstName = user?.firstName ?? 'à vous';
  return (
    <section className="dashboard-home">
      <header className="welcome-header">
        <div>
          <h1>Bonjour, {firstName}</h1>
          <p>Voici l’essentiel pour organiser la journée au collège.</p>
        </div>
        <p className="today-label">
          {new Intl.DateTimeFormat('fr-CM', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          }).format(new Date())}
        </p>
      </header>
      <div className="daily-focus">
        <div>
          <span className="focus-mark" aria-hidden="true" />
          <div>
            <strong>Une rentrée bien organisée commence ici.</strong>
            <p>Vérifiez les élèves sans classe et les associations parent encore en attente.</p>
          </div>
        </div>
        <Link to="/students?class_id=none">Voir les éléments à traiter</Link>
      </div>
      <RegistrarIndicators />
      <div className="home-columns">
        <article className="quick-panel">
          <div className="section-heading">
            <div>
              <h2>Actions rapides</h2>
              <p>Les opérations les plus fréquentes, à portée de main.</p>
            </div>
          </div>
          <div className="quick-actions">
            <Link to="/students/new">
              <span>01</span>
              <div>
                <strong>Inscrire un élève</strong>
                <small>Créer sa fiche et son inscription</small>
              </div>
              <b>→</b>
            </Link>
            <Link to="/payments">
              <span>02</span>
              <div>
                <strong>Enregistrer un paiement</strong>
                <small>Retrouver un élève et encaisser</small>
              </div>
              <b>→</b>
            </Link>
            <Link to="/students/import">
              <span>03</span>
              <div>
                <strong>Importer une liste</strong>
                <small>Préparer une rentrée en volume</small>
              </div>
              <b>→</b>
            </Link>
          </div>
        </article>
        <article className="school-note">
          <span>CSB Noutcha KAMGUE</span>
          <h2>Des informations fiables, pour mieux accompagner chaque élève.</h2>
          <p>
            Les mises à jour effectuées ici sont immédiatement disponibles aux équipes autorisées.
          </p>
          <div>
            <i aria-hidden="true" />
            <small>Dogpassi · Douala</small>
          </div>
        </article>
      </div>
    </section>
  );
}

export function AcademicYearsPage() {
  const client = useQueryClient();
  const { years, isPending } = useAcademicYear();
  const me = useAuthStore((state) => state.user);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState('');
  const refresh = () => client.invalidateQueries({ queryKey: ['academic-years'] });
  const create = useMutation({
    mutationFn: (body: unknown) => api.post('/academic-years', body),
    onSuccess: () => {
      setShowForm(false);
      void refresh();
    },
    onError: (error) => setMessage(errorMessage(error)),
  });
  const transition = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      api.post(`/academic-years/${id}/${action}`, {}),
    onSuccess: refresh,
    onError: (error) => setMessage(errorMessage(error)),
  });
  const duplicate = useMutation({
    mutationFn: ({
      source,
      target,
      preview,
    }: {
      source: string;
      target: string;
      preview: boolean;
    }) =>
      api.post<{ classes: number }>(`/academic-years/${source}/duplicate-structure`, {
        targetYearId: target,
        preview,
      }),
    onSuccess: (result, variables) => {
      setMessage(
        variables.preview
          ? `Prévisualisation : ${result.classes} classe(s) seront copiées.`
          : `${result.classes} classe(s) copiées.`,
      );
      if (!variables.preview) void refresh();
    },
    onError: (error) => setMessage(errorMessage(error)),
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    create.mutate({
      name: data.get('name'),
      startDate: data.get('startDate'),
      endDate: data.get('endDate'),
    });
  }
  return (
    <section className="space-y-5">
      <PageTitle
        eyebrow="Référentiel"
        title="Années scolaires"
        subtitle="Créez, activez puis clôturez les périodes pédagogiques."
        action={
          me?.permissions.includes('academic_years.create') ? (
            <button className="button-primary" onClick={() => setShowForm((value) => !value)}>
              Créer une année
            </button>
          ) : null
        }
      />
      {showForm ? (
        <form
          onSubmit={submit}
          className="grid gap-3 rounded-xl border bg-white p-5 md:grid-cols-4"
        >
          <input className="input" name="name" placeholder="2027/2028" required />
          <input className="input" name="startDate" type="date" required />
          <input className="input" name="endDate" type="date" required />
          <button className="button-primary">Enregistrer</button>
        </form>
      ) : null}
      {message ? <Notice message={message} /> : null}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="p-4">Année</th>
              <th className="p-4">Période</th>
              <th className="p-4">Classes</th>
              <th className="p-4">Statut</th>
              <th className="p-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isPending ? (
              <tr>
                <td colSpan={5} className="p-5">
                  Chargement…
                </td>
              </tr>
            ) : (
              years.map((year) => (
                <tr key={year.id}>
                  <td className="p-4 font-semibold">
                    {year.name}
                    {year.isCurrent ? (
                      <span className="ml-2 rounded-full bg-brand-50 px-2 py-1 text-xs text-brand-700">
                        Courante
                      </span>
                    ) : null}
                  </td>
                  <td className="p-4 text-slate-600">
                    {year.startDate} → {year.endDate}
                  </td>
                  <td className="p-4 tabular">{year.classCount}</td>
                  <td className="p-4">
                    <Status value={year.status} />
                  </td>
                  <td className="p-4">
                    <div className="flex flex-wrap gap-2">
                      {year.status === 'DRAFT' &&
                      me?.permissions.includes('academic_years.update') ? (
                        <button
                          className="text-brand-700"
                          onClick={() => transition.mutate({ id: year.id, action: 'activate' })}
                        >
                          Activer
                        </button>
                      ) : null}
                      {year.status === 'ACTIVE' &&
                      me?.permissions.includes('academic_years.close') ? (
                        <button
                          className="text-brand-700"
                          onClick={() => transition.mutate({ id: year.id, action: 'close' })}
                        >
                          Clôturer
                        </button>
                      ) : null}
                      {year.status === 'CLOSED' &&
                      me?.permissions.includes('academic_years.close') ? (
                        <button
                          className="text-brand-700"
                          onClick={() => transition.mutate({ id: year.id, action: 'archive' })}
                        >
                          Archiver
                        </button>
                      ) : null}
                      {year.classCount > 0 ? (
                        <DuplicateAction
                          source={year}
                          targets={years.filter(
                            (target) => target.status === 'DRAFT' && target.id !== year.id,
                          )}
                          onDuplicate={(target, preview) =>
                            duplicate.mutate({ source: year.id, target, preview })
                          }
                        />
                      ) : null}
                    </div>
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

function DuplicateAction({
  source,
  targets,
  onDuplicate,
}: {
  source: AcademicYearDto;
  targets: AcademicYearDto[];
  onDuplicate(target: string, preview: boolean): void;
}) {
  const [target, setTarget] = useState('');
  if (!targets.length) return null;
  return (
    <span className="flex items-center gap-1">
      <select
        aria-label={`Cible de duplication de ${source.name}`}
        className="rounded border px-1 py-0.5"
        value={target}
        onChange={(event) => setTarget(event.target.value)}
      >
        <option value="">Dupliquer vers…</option>
        {targets.map((year) => (
          <option key={year.id} value={year.id}>
            {year.name}
          </option>
        ))}
      </select>
      {target ? (
        <>
          <button className="text-slate-600" onClick={() => onDuplicate(target, true)}>
            Prévoir
          </button>
          <button className="text-brand-700" onClick={() => onDuplicate(target, false)}>
            Copier
          </button>
        </>
      ) : null}
    </span>
  );
}

export function GradeLevelsPage() {
  const client = useQueryClient();
  const me = useAuthStore((state) => state.user);
  const [message, setMessage] = useState('');
  const [dragged, setDragged] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['grade-levels'],
    queryFn: () => api.get<GradeLevelDto[]>('/grade-levels'),
  });
  const organization = useQuery({
    queryKey: ['organization'],
    queryFn: () => api.get<OrganizationTree>('/organization'),
  });
  const refresh = () => client.invalidateQueries({ queryKey: ['grade-levels'] });
  const create = useMutation({
    mutationFn: (body: unknown) => api.post('/grade-levels', body),
    onSuccess: refresh,
    onError: (error) => setMessage(errorMessage(error)),
  });
  const reorder = useMutation({
    mutationFn: (orderedIds: string[]) => api.post('/grade-levels/reorder', { orderedIds }),
    onSuccess: refresh,
    onError: (error) => setMessage(errorMessage(error)),
  });
  const deactivate = useMutation({
    mutationFn: (id: string) => api.post(`/grade-levels/${id}/deactivate`),
    onSuccess: refresh,
    onError: (error) => setMessage(errorMessage(error)),
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    create.mutate({
      name: data.get('name'),
      code: data.get('code'),
      orderIndex: query.data?.length ?? 0,
      organizationalUnitId: data.get('organizationalUnitId'),
    });
    event.currentTarget.reset();
  }
  function drop(targetId: string) {
    if (!dragged || dragged === targetId || !query.data) return;
    const ordered = query.data.map((level) => level.id);
    const from = ordered.indexOf(dragged);
    const to = ordered.indexOf(targetId);
    const moved = ordered.splice(from, 1)[0];
    if (!moved) return;
    ordered.splice(to, 0, moved);
    reorder.mutate(ordered);
    setDragged(null);
  }
  return (
    <section className="space-y-5">
      <PageTitle
        eyebrow="Référentiel"
        title="Niveaux"
        subtitle="Glissez les lignes pour définir l’ordre pédagogique utilisé partout."
      />
      {me?.permissions.includes('grade_levels.manage') ? (
        <form
          onSubmit={submit}
          className="grid gap-3 rounded-xl border bg-white p-5 sm:grid-cols-4"
        >
          <input className="input" name="name" placeholder="Nom · 6e" required />
          <input className="input" name="code" placeholder="Code · 6E" required />
          <select className="input" name="organizationalUnitId" required>
            <option value="">Unité…</option>
            {organization.data
              ?.filter((unit) => unit.status === 'ACTIVE')
              .map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
          </select>
          <button className="button-primary">Ajouter</button>
        </form>
      ) : null}
      {message ? <Notice message={message} /> : null}
      <div className="space-y-2">
        {query.data?.map((level) => (
          <div
            draggable={me?.permissions.includes('grade_levels.manage')}
            onDragStart={() => setDragged(level.id)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => drop(level.id)}
            key={level.id}
            className="grid cursor-grab grid-cols-[40px_1fr_auto_auto] items-center gap-3 rounded-xl border border-slate-200 bg-white p-4"
          >
            <span className="text-slate-400">⋮⋮</span>
            <div>
              <strong>{level.name}</strong>
              <span className="ml-2 font-mono text-xs text-slate-500">{level.code}</span>
              <p className="text-xs text-slate-500">
                {level.organizationalUnitName} · {level.classCount} classe(s)
              </p>
            </div>
            <Status value={level.status} />
            {level.status === 'ACTIVE' && me?.permissions.includes('grade_levels.manage') ? (
              <button className="text-sm text-red-700" onClick={() => deactivate.mutate(level.id)}>
                Désactiver
              </button>
            ) : null}
          </div>
        ))}
      </div>
      <CategoriesPanel />
    </section>
  );
}

function CategoriesPanel() {
  const me = useAuthStore((state) => state.user);
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['student-categories'],
    queryFn: () => api.get<StudentCategoryDto[]>('/student-categories'),
  });
  const create = useMutation({
    mutationFn: (body: unknown) => api.post('/student-categories', body),
    onSuccess: () => client.invalidateQueries({ queryKey: ['student-categories'] }),
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    create.mutate({ code: data.get('code'), name: data.get('name') });
    event.currentTarget.reset();
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="font-semibold">Catégories d’élèves</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {query.data?.map((category) => (
          <span key={category.id} className="rounded-full bg-slate-100 px-3 py-1 text-sm">
            {category.name} · {category.code}
          </span>
        ))}
      </div>
      {me?.permissions.includes('grade_levels.manage') ? (
        <form className="mt-4 flex flex-wrap gap-2" onSubmit={submit}>
          <input className="input max-w-44" name="code" placeholder="Code" required />
          <input className="input max-w-60" name="name" placeholder="Nom" required />
          <button className="button-primary">Ajouter</button>
        </form>
      ) : null}
    </div>
  );
}

export function ClassesPage() {
  const { selectedYear, isReadOnly } = useAcademicYear();
  const client = useQueryClient();
  const me = useAuthStore((state) => state.user);
  const [message, setMessage] = useState('');
  const [selectedLevelId, setSelectedLevelId] = useState('');
  const levels = useQuery({
    queryKey: ['grade-levels'],
    queryFn: () => api.get<GradeLevelDto[]>('/grade-levels'),
  });
  const classes = useQuery({
    queryKey: ['classes', selectedYear?.id],
    queryFn: () =>
      selectedYear
        ? api.get<ClassDto[]>(`/classes?academic_year_id=${selectedYear.id}`)
        : Promise.resolve([]),
    enabled: Boolean(selectedYear),
  });
  const organization = useQuery({
    queryKey: ['organization'],
    queryFn: () => api.get<OrganizationTree>('/organization'),
  });
  const selectedLevel = levels.data?.find((item) => item.id === selectedLevelId);
  const selectedUnit = organization.data?.find(
    (item) => item.id === selectedLevel?.organizationalUnitId,
  );
  const create = useMutation({
    mutationFn: (body: unknown) => api.post('/classes', body),
    onSuccess: () => client.invalidateQueries({ queryKey: ['classes'] }),
    onError: (error) => setMessage(errorMessage(error)),
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedYear) return;
    const data = new FormData(event.currentTarget);
    const levelId = String(data.get('gradeLevelId'));
    const level = levels.data?.find((item) => item.id === levelId);
    const suffixes = String(data.get('suffixes'))
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    create.mutate({
      classes: suffixes.map((suffix) => ({
        academicYearId: selectedYear.id,
        gradeLevelId: levelId,
        organizationalUnitId: level?.organizationalUnitId,
        languageSectionId: data.get('languageSectionId'),
        educationTrackId: data.get('educationTrackId') || null,
        name: `${level?.name ?? ''} ${suffix}`.trim(),
        capacity: Number(data.get('capacity')),
      })),
    });
  }
  const grouped = (levels.data ?? [])
    .map((level) => ({
      level,
      classes: (classes.data ?? []).filter((item) => item.gradeLevelId === level.id),
    }))
    .filter((group) => group.classes.length);
  return (
    <section className="space-y-5">
      <PageTitle
        eyebrow="Référentiel"
        title="Classes"
        subtitle={
          selectedYear
            ? `Structure de ${selectedYear.name}`
            : 'Créez une année scolaire pour commencer.'
        }
      />
      {!isReadOnly && me?.permissions.includes('classes.manage') && selectedYear ? (
        <form
          onSubmit={submit}
          className="grid gap-3 rounded-xl border bg-white p-5 sm:grid-cols-6"
        >
          <select
            className="input"
            name="gradeLevelId"
            required
            value={selectedLevelId}
            onChange={(event) => setSelectedLevelId(event.target.value)}
          >
            <option value="">Niveau…</option>
            {levels.data
              ?.filter((level) => level.status === 'ACTIVE')
              .map((level) => (
                <option key={level.id} value={level.id}>
                  {level.name}
                </option>
              ))}
          </select>
          <select className="input" name="languageSectionId" required disabled={!selectedUnit}>
            <option value="">Section…</option>
            {selectedUnit?.languageSections
              .filter((item) => item.status === 'ACTIVE')
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
          <select
            className="input"
            name="educationTrackId"
            required={selectedUnit?.code === 'SECONDAIRE'}
            disabled={!selectedUnit?.educationTracks.length}
          >
            <option value="">
              {selectedUnit?.code === 'SECONDAIRE' ? 'Filière…' : 'Sans filière'}
            </option>
            {selectedUnit?.educationTracks
              .filter((item) => item.status === 'ACTIVE')
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
          <input className="input" name="suffixes" placeholder="Sections · A, B, C" required />
          <input
            className="input"
            name="capacity"
            type="number"
            min={1}
            defaultValue={60}
            required
          />
          <button className="button-primary">Créer les classes</button>
        </form>
      ) : null}
      {message ? <Notice message={message} /> : null}
      {grouped.map(({ level, classes: items }) => (
        <div key={level.id}>
          <h2 className="mb-3 font-semibold">{level.name}</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex items-start justify-between">
                  <h3 className="text-lg font-semibold">{item.name}</h3>
                  <Status value={item.status} />
                </div>
                <p className="mt-4 text-2xl font-semibold tabular">
                  {item.enrollmentCount}{' '}
                  <span className="text-sm font-normal text-slate-500">
                    / {item.capacity ?? '∞'}
                  </span>
                </p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full ${item.fillRate && item.fillRate > 1 ? 'bg-red-600' : item.fillRate && item.fillRate >= 0.9 ? 'bg-amber-500' : 'bg-brand-600'}`}
                    style={{ width: `${Math.min((item.fillRate ?? 0) * 100, 100)}%` }}
                  />
                </div>
                <p className="mt-3 text-sm text-slate-500">
                  {item.headTeacherName ?? 'Aucun responsable'}
                </p>
                <Link
                  className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-brand-700"
                  to={`/classes/${item.id}`}
                >
                  Voir les détails <span aria-hidden="true">→</span>
                </Link>
              </article>
            ))}
          </div>
        </div>
      ))}
      {selectedYear && !classes.isPending && !classes.data?.length ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-slate-500">
          Aucune classe pour cette année.
        </div>
      ) : null}
    </section>
  );
}

type ClassDetailTab = 'Vue générale' | 'Élèves' | 'Frais scolaires';

export function ClassDetailPage() {
  const { id = '' } = useParams();
  const { selectedYear, isReadOnly } = useAcademicYear();
  const client = useQueryClient();
  const me = useAuthStore((state) => state.user);
  const [tab, setTab] = useState<ClassDetailTab>('Vue générale');
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState('');
  const detail = useQuery({
    queryKey: ['class-summary', id],
    queryFn: () => api.get<ClassDto>(`/classes/${id}/summary`),
    enabled: Boolean(id),
  });
  const levels = useQuery({
    queryKey: ['grade-levels'],
    queryFn: () => api.get<GradeLevelDto[]>('/grade-levels'),
  });
  const students = useQuery({
    queryKey: ['class-students', id, detail.data?.academicYearId],
    queryFn: () =>
      api.get<Paginated<StudentDto>>(
        `/students?academic_year_id=${detail.data?.academicYearId}&class_id=${id}&status=ACTIVE&page_size=100`,
      ),
    enabled: Boolean(detail.data),
  });
  const feeStructures = useQuery({
    queryKey: ['class-fee-structures', detail.data?.academicYearId],
    queryFn: () =>
      api.get<FeeStructureDto[]>(`/fee-structures?academic_year_id=${detail.data?.academicYearId}`),
    enabled: Boolean(detail.data) && Boolean(me?.permissions.includes('fee_structures.read')),
  });
  const update = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch<ClassDto>(`/classes/${id}`, body),
    onSuccess: () => {
      setEditing(false);
      setMessage('Les informations de la classe ont été enregistrées.');
      void client.invalidateQueries({ queryKey: ['class-summary', id] });
      void client.invalidateQueries({ queryKey: ['classes'] });
    },
    onError: (error) => setMessage(errorMessage(error)),
  });
  const classroom = detail.data;
  const applicableFees = (feeStructures.data ?? []).filter(
    (fee) =>
      fee.status !== 'INACTIVE' &&
      (fee.classId === id ||
        (fee.classId === null && fee.gradeLevelId === classroom?.gradeLevelId) ||
        (fee.classId === null && fee.gradeLevelId === null)),
  );
  if (detail.isPending) return <p>Chargement de la classe…</p>;
  if (!classroom)
    return <p className="rounded-xl bg-red-50 p-4 text-red-700">{errorMessage(detail.error)}</p>;
  const capacityLabel = classroom.capacity
    ? `${classroom.enrollmentCount}/${classroom.capacity}`
    : `${classroom.enrollmentCount}`;
  const available =
    classroom.capacity === null
      ? null
      : Math.max(0, classroom.capacity - classroom.enrollmentCount);
  const canEdit = !isReadOnly && Boolean(me?.permissions.includes('classes.manage'));
  const tabs: ClassDetailTab[] = ['Vue générale', 'Élèves', 'Frais scolaires'];
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
        <Link className="font-medium text-brand-700" to="/classes">
          Classes
        </Link>
        <span aria-hidden="true">/</span>
        <span>{classroom.name}</span>
      </div>
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-xl border bg-white p-5">
        <div>
          <p className="text-sm font-semibold text-brand-700">{classroom.gradeLevelName}</p>
          <h1>{classroom.name}</h1>
          <p className="mt-2 text-sm text-slate-500">
            {selectedYear?.name ?? 'Année scolaire'} ·{' '}
            {classroom.headTeacherName ?? 'Aucun responsable de classe'}
          </p>
        </div>
        {canEdit ? (
          <button className="button-primary" onClick={() => setEditing((value) => !value)}>
            {editing ? 'Fermer' : 'Modifier la classe'}
          </button>
        ) : null}
      </header>
      {message ? (
        <p className="rounded-lg bg-brand-50 p-3 text-sm text-brand-900">{message}</p>
      ) : null}
      {editing ? (
        <form
          className="grid gap-3 rounded-xl border bg-white p-5 md:grid-cols-[1.2fr_1fr_1fr_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            update.mutate({
              name: data.get('name'),
              gradeLevelId: data.get('gradeLevelId'),
              capacity: Number(data.get('capacity')),
            });
          }}
        >
          <label className="text-sm font-medium">
            Nom de la classe
            <input className="input mt-1" name="name" defaultValue={classroom.name} required />
          </label>
          <label className="text-sm font-medium">
            Niveau
            <select
              className="input mt-1"
              name="gradeLevelId"
              defaultValue={classroom.gradeLevelId}
            >
              {levels.data
                ?.filter((level) => level.status === 'ACTIVE')
                .map((level) => (
                  <option key={level.id} value={level.id}>
                    {level.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Capacité
            <input
              className="input mt-1"
              name="capacity"
              type="number"
              min={Math.max(1, classroom.enrollmentCount)}
              defaultValue={classroom.capacity ?? 60}
              required
            />
          </label>
          <button className="button-primary self-end" disabled={update.isPending}>
            {update.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </form>
      ) : null}
      <nav className="flex gap-1 overflow-x-auto border-b" aria-label="Sections de la classe">
        {tabs.map((item) => (
          <button
            key={item}
            onClick={() => setTab(item)}
            className={`whitespace-nowrap px-4 py-2.5 text-sm ${tab === item ? 'border-b-2 border-brand-600 font-semibold text-brand-700' : 'text-slate-500'}`}
          >
            {item}
          </button>
        ))}
      </nav>
      {tab === 'Vue générale' ? (
        <div className="grid gap-4 md:grid-cols-3">
          <article className="rounded-xl border bg-white p-5">
            <p className="text-xs font-semibold uppercase text-slate-500">Effectif</p>
            <strong className="mt-2 block text-3xl tabular">{capacityLabel}</strong>
            <p className="mt-2 text-sm text-slate-500">
              {available === null ? 'Capacité non limitée' : `${available} place(s) disponible(s)`}
            </p>
          </article>
          <article className="rounded-xl border bg-white p-5">
            <p className="text-xs font-semibold uppercase text-slate-500">Frais applicables</p>
            <strong className="mt-2 block text-3xl tabular">{applicableFees.length}</strong>
            <button
              className="mt-2 text-sm font-semibold text-brand-700"
              onClick={() => setTab('Frais scolaires')}
            >
              Voir le détail
            </button>
          </article>
          <article className="rounded-xl border bg-white p-5">
            <p className="text-xs font-semibold uppercase text-slate-500">Responsable</p>
            <strong className="mt-2 block text-lg">
              {classroom.headTeacherName ?? 'Non désigné'}
            </strong>
            <p className="mt-2 text-sm text-slate-500">
              {classroom.status === 'ACTIVE' ? 'Classe active' : 'Classe inactive'}
            </p>
          </article>
        </div>
      ) : null}
      {tab === 'Élèves' ? (
        <article className="overflow-hidden rounded-xl border bg-white">
          <div className="flex items-center justify-between border-b p-4">
            <div>
              <h2 className="font-semibold">Élèves inscrits</h2>
              <p className="text-sm text-slate-500">
                {students.data?.meta.total ?? 0} élève(s) dans cette classe
              </p>
            </div>
            <Link className="text-sm font-semibold text-brand-700" to={`/students?class_id=${id}`}>
              Ouvrir la liste complète
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-left text-sm">
              <thead>
                <tr>
                  <th>Matricule</th>
                  <th>Élève</th>
                  <th>Sexe</th>
                  <th>Responsables</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {students.data?.data.map((student) => (
                  <tr key={student.id}>
                    <td className="font-mono text-xs">{student.studentNumber}</td>
                    <td className="font-semibold">
                      {student.lastName} {student.firstName}
                    </td>
                    <td>{student.gender ?? '—'}</td>
                    <td>{student.guardianCount}</td>
                    <td>
                      <Link className="font-semibold text-brand-700" to={`/students/${student.id}`}>
                        Voir la fiche
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!students.isPending && !students.data?.data.length ? (
              <p className="p-8 text-center text-slate-500">Aucun élève actif dans cette classe.</p>
            ) : null}
          </div>
        </article>
      ) : null}
      {tab === 'Frais scolaires' ? (
        <div className="space-y-3">
          {applicableFees.map((fee) => {
            const scope =
              fee.classId === id
                ? 'Cette classe'
                : fee.gradeLevelId
                  ? 'Tout le niveau'
                  : 'Tout l’établissement';
            return (
              <article key={fee.id} className="rounded-xl border bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">
                        {scope}
                      </span>
                      {fee.studentCategoryId ? (
                        <span className="rounded-full bg-gold-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                          Selon la catégorie de l’élève
                        </span>
                      ) : null}
                    </div>
                    <h3 className="mt-3 font-semibold">{fee.name}</h3>
                    <p className="text-sm text-slate-500">
                      {fee.feeTypeName} · {fee.isMandatory ? 'Obligatoire' : 'Facultatif'}
                    </p>
                  </div>
                  <div className="text-right">
                    <strong className="text-xl tabular">
                      {fee.amount.toLocaleString('fr-CM')} FCFA
                    </strong>
                    <p className="text-xs text-slate-500">
                      {fee.installments.length
                        ? `${fee.installments.length} tranche(s)`
                        : 'Sans échéancier'}
                    </p>
                  </div>
                </div>
                {fee.installments.length ? (
                  <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {fee.installments.map((installment) => (
                      <div key={installment.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                        <span>{installment.name}</span>
                        <strong className="mt-1 block tabular">
                          {installment.amount.toLocaleString('fr-CM')} FCFA
                        </strong>
                        <small className="text-slate-500">
                          Échéance : {new Date(installment.dueDate).toLocaleDateString('fr-CM')}
                        </small>
                      </div>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })}
          {!feeStructures.isPending && !applicableFees.length ? (
            <p className="rounded-xl border border-dashed bg-white p-8 text-center text-slate-500">
              Aucun frais scolaire n’est actuellement lié à cette classe ou à son niveau.
            </p>
          ) : null}
          {!me?.permissions.includes('fee_structures.read') ? (
            <p className="rounded-xl border border-dashed bg-white p-8 text-center text-slate-500">
              Vous n’avez pas l’autorisation de consulter les frais scolaires.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function SettingsPage() {
  const client = useQueryClient();
  const me = useAuthStore((state) => state.user);
  const [message, setMessage] = useState('');
  const query = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<SchoolSettingsDto>('/settings'),
  });
  const update = useMutation({
    mutationFn: (body: unknown) => api.patch('/settings', body),
    onSuccess: () => {
      setMessage('Paramètres enregistrés.');
      void client.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (error) => setMessage(errorMessage(error)),
  });
  if (!query.data) return <p>Chargement…</p>;
  const settings = query.data;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    update.mutate({
      schoolName: data.get('schoolName'),
      address: data.get('address') || null,
      phone: data.get('phone') || null,
      email: data.get('email') || null,
      studentNumberPrefix: data.get('studentNumberPrefix'),
      studentNumberPadding: Number(data.get('studentNumberPadding')),
      receiptNumberFormat: data.get('receiptNumberFormat'),
      paymentRefFormat: data.get('paymentRefFormat'),
      discountApprovalThreshold: Number(data.get('discountApprovalThreshold')),
      allowOverpayment: data.get('allowOverpayment') === 'on',
      externalPaymentSlaHours: Number(data.get('externalPaymentSlaHours')),
      smsEnabled: data.get('smsEnabled') === 'on',
      smsMonthlyLimit: Number(data.get('smsMonthlyLimit')),
      notificationStartHour: Number(data.get('notificationStartHour')),
      notificationEndHour: Number(data.get('notificationEndHour')),
      balanceReminderEnabled: data.get('balanceReminderEnabled') === 'on',
    });
  }
  return (
    <section className="space-y-5">
      <PageTitle
        eyebrow="Établissement"
        title="Paramètres"
        subtitle="Identité, numérotation et règles financières."
      />
      {message ? <Notice message={message} /> : null}
      <form onSubmit={submit} className="space-y-5">
        <SettingsSection title="Général">
          <input
            className="input"
            name="schoolName"
            defaultValue={settings.schoolName}
            placeholder="Nom"
          />
          <input
            className="input"
            name="address"
            defaultValue={settings.address ?? ''}
            placeholder="Adresse"
          />
          <input
            className="input"
            name="phone"
            defaultValue={settings.phone ?? ''}
            placeholder="Téléphone"
          />
          <input
            className="input"
            name="email"
            defaultValue={settings.email ?? ''}
            type="email"
            placeholder="E-mail"
          />
        </SettingsSection>
        <SettingsSection title="Numérotation">
          <input
            className="input"
            name="studentNumberPrefix"
            defaultValue={settings.studentNumberPrefix}
          />
          <input
            className="input"
            name="studentNumberPadding"
            type="number"
            defaultValue={settings.studentNumberPadding}
          />
          <input
            className="input"
            name="receiptNumberFormat"
            defaultValue={settings.receiptNumberFormat}
          />
          <input
            className="input"
            name="paymentRefFormat"
            defaultValue={settings.paymentRefFormat}
          />
          <p className="text-sm text-slate-500 sm:col-span-2">
            Aperçu matricule :{' '}
            <strong className="font-mono">
              {settings.studentNumberPrefix}
              {String(42).padStart(settings.studentNumberPadding, '0')}
            </strong>
          </p>
        </SettingsSection>
        <SettingsSection title="Financier">
          <input
            className="input"
            name="discountApprovalThreshold"
            type="number"
            min={0}
            defaultValue={settings.discountApprovalThreshold}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              name="allowOverpayment"
              type="checkbox"
              defaultChecked={settings.allowOverpayment}
            />
            Autoriser les surpaiements
          </label>
        </SettingsSection>
        <SettingsSection title="Paiements externes & notifications">
          <label className="text-sm font-medium">
            SLA de validation (heures)
            <input
              className="input mt-1"
              name="externalPaymentSlaHours"
              type="number"
              min={1}
              defaultValue={settings.externalPaymentSlaHours}
            />
          </label>
          <label className="text-sm font-medium">
            Plafond SMS mensuel (FCFA)
            <input
              className="input mt-1"
              name="smsMonthlyLimit"
              type="number"
              min={0}
              defaultValue={settings.smsMonthlyLimit}
            />
          </label>
          <label className="text-sm font-medium">
            Début des envois
            <input
              className="input mt-1"
              name="notificationStartHour"
              type="number"
              min={0}
              max={23}
              defaultValue={settings.notificationStartHour}
            />
          </label>
          <label className="text-sm font-medium">
            Fin des envois
            <input
              className="input mt-1"
              name="notificationEndHour"
              type="number"
              min={1}
              max={24}
              defaultValue={settings.notificationEndHour}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input name="smsEnabled" type="checkbox" defaultChecked={settings.smsEnabled} />
            Activer les SMS autorisés
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              name="balanceReminderEnabled"
              type="checkbox"
              defaultChecked={settings.balanceReminderEnabled}
            />
            Activer le rappel mensuel de solde
          </label>
        </SettingsSection>
        {me?.permissions.includes('settings.update') ? (
          <button className="button-primary" disabled={update.isPending}>
            Enregistrer les paramètres
          </button>
        ) : null}
      </form>
      <ModuleSettingsPanel />
    </section>
  );
}

function PageTitle({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-sm font-medium text-brand-700">{eyebrow}</p>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}
function Status({ value }: { value: string }) {
  return (
    <span
      className={`rounded-full px-2 py-1 text-xs font-medium ${value === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : value === 'DRAFT' ? 'bg-slate-100 text-slate-700' : 'bg-amber-50 text-amber-800'}`}
    >
      {statusLabels[value] ?? value}
    </span>
  );
}
function Notice({ message }: { message: string }) {
  return <p className="rounded-lg bg-brand-50 p-3 text-sm text-brand-900">{message}</p>;
}
function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-3 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-2">
      <legend className="px-2 font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}
