import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ClassDto,
  CreateStudentBody,
  GuardianRequestStatus,
  GuardianRequestKind,
  GuardianRequestDto,
  GuardianInviteDto,
  Paginated,
  RegistrarDashboard,
  StudentCategoryDto,
  StudentDto,
  StudentGuardianDto,
} from '@cplan/contracts';
import { createPortal } from 'react-dom';
import { api, ApiError } from '@/shared/api/client';
import { useAuthStore } from '@/features/auth/auth-store';
import { useAcademicYear } from '@/features/academic/use-academic-year';
import {
  StudentFinancePanel,
  StudentFinancialOverview,
  StudentPaymentsPanel,
} from '@/features/finance/FinancePages';

const messageOf = (error: unknown) =>
  error instanceof ApiError ? error.message : 'Une erreur est survenue.';
const DRAFT_KEY = 'cplan.student-draft.v1';

export function StudentsListPage() {
  const year = useAcademicYear();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const currentQuery = params.get('q') ?? '';
  useEffect(() => {
    if (search === currentQuery) return;
    const timer = window.setTimeout(() => {
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          if (search) next.set('q', search);
          else next.delete('q');
          next.set('page', '1');
          return next;
        },
        { replace: true },
      );
    }, 300);
    return () => window.clearTimeout(timer);
  }, [currentQuery, search, setParams]);
  const query = new URLSearchParams(params);
  if (year.selectedYear?.id && !query.has('academic_year_id'))
    query.set('academic_year_id', year.selectedYear.id);
  const students = useQuery({
    queryKey: ['students', query.toString()],
    queryFn: () => api.get<Paginated<StudentDto>>(`/students?${query}`),
  });
  const classes = useQuery({
    queryKey: ['classes', year.selectedYear?.id],
    queryFn: () => api.get<ClassDto[]>(`/classes?academic_year_id=${year.selectedYear?.id}`),
    enabled: Boolean(year.selectedYear?.id),
  });
  function updateFilter(name: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    next.set('page', '1');
    setParams(next);
  }
  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-brand-700">Scolarité</p>
          <h1 className="text-2xl font-semibold">Élèves</h1>
          <p className="text-sm text-slate-500">
            Recherche, filtres et inscriptions de l’année sélectionnée.
          </p>
        </div>
        <Link className="button-primary" to="/students/new">
          Ajouter un élève
        </Link>
      </header>
      <div className="grid gap-3 rounded-xl border bg-white p-4 md:grid-cols-4">
        <input
          className="input md:col-span-2"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Nom, prénom ou matricule…"
        />
        <select
          className="input"
          value={params.get('class_id') ?? ''}
          onChange={(event) => updateFilter('class_id', event.target.value)}
        >
          <option value="">Toutes les classes</option>
          {classes.data?.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} · {item.enrollmentCount}/{item.capacity ?? '∞'}
            </option>
          ))}
        </select>
        <select
          className="input"
          value={params.get('status') ?? 'ACTIVE'}
          onChange={(event) => updateFilter('status', event.target.value)}
        >
          <option value="ACTIVE">Actifs</option>
          <option value="INACTIVE">Inactifs</option>
          <option value="SUSPENDED">Suspendus</option>
          <option value="TRANSFERRED">Transférés</option>
          <option value="ARCHIVED">Archivés</option>
        </select>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="p-4">Matricule</th>
              <th>Nom</th>
              <th>Prénom</th>
              <th>Sexe</th>
              <th>Classe</th>
              <th>Responsables</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {students.isPending ? (
              <tr>
                <td className="p-5" colSpan={7}>
                  Chargement…
                </td>
              </tr>
            ) : (
              students.data?.data.map((student) => (
                <tr key={student.id} className="hover:bg-slate-50">
                  <td className="p-4 font-mono text-xs">
                    <Link className="text-brand-700" to={`/students/${student.id}`}>
                      {student.studentNumber}
                    </Link>
                  </td>
                  <td className="font-semibold">
                    <Link
                      className="text-slate-900 hover:text-brand-700"
                      to={`/students/${student.id}`}
                    >
                      {student.lastName}
                    </Link>
                  </td>
                  <td>
                    <Link
                      className="text-slate-700 hover:text-brand-700"
                      to={`/students/${student.id}`}
                    >
                      {student.firstName}
                    </Link>
                  </td>
                  <td>{student.gender ?? '—'}</td>
                  <td>{student.currentEnrollment?.className ?? 'Non affecté'}</td>
                  <td>{student.guardianCount}</td>
                  <td>{student.status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <footer className="flex items-center justify-between border-t p-4 text-sm text-slate-500">
          <span>
            {students.data?.meta.total ?? 0} élève(s) · page {students.data?.meta.page ?? 1}/
            {students.data?.meta.total_pages ?? 0}
          </span>
          <div className="flex gap-2">
            <button
              className="rounded border px-3 py-1 disabled:opacity-40"
              disabled={(students.data?.meta.page ?? 1) <= 1}
              onClick={() => updateFilter('page', String((students.data?.meta.page ?? 1) - 1))}
            >
              Précédent
            </button>
            <button
              className="rounded border px-3 py-1 disabled:opacity-40"
              disabled={(students.data?.meta.page ?? 1) >= (students.data?.meta.total_pages ?? 0)}
              onClick={() => updateFilter('page', String((students.data?.meta.page ?? 1) + 1))}
            >
              Suivant
            </button>
          </div>
        </footer>
      </div>
      {students.error ? <p className="text-sm text-red-700">{messageOf(students.error)}</p> : null}
    </section>
  );
}

type DraftGuardian = {
  firstName: string;
  lastName: string;
  phone: string;
  relationship: 'PERE' | 'MERE' | 'TUTEUR' | 'ONCLE' | 'TANTE' | 'GRAND_PARENT' | 'AUTRE';
  isPrimary: boolean;
};
const emptyGuardian = (): DraftGuardian => ({
  firstName: '',
  lastName: '',
  phone: '+237',
  relationship: 'PERE',
  isPrimary: false,
});
type StudentDraft = {
  fields?: Record<string, string>;
  guardians?: DraftGuardian[];
  levelId?: string;
};
function readStudentDraft(): StudentDraft {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}') as StudentDraft;
  } catch {
    localStorage.removeItem(DRAFT_KEY);
    return {};
  }
}
function saveStudentDraft(patch: Partial<StudentDraft>) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...readStudentDraft(), ...patch }));
}

export function CreateStudentPage() {
  const navigate = useNavigate();
  const academic = useAcademicYear();
  const [draft] = useState(readStudentDraft);
  const [levelId, setLevelId] = useState(draft.levelId ?? '');
  const [guardians, setGuardians] = useState<DraftGuardian[]>(
    draft.guardians?.length ? draft.guardians : [emptyGuardian()],
  );
  const [message, setMessage] = useState('');
  const [duplicateBody, setDuplicateBody] = useState<CreateStudentBody | null>(null);
  const [confirmation, setConfirmation] = useState<{
    id: string;
    name: string;
    number: string;
    code: string | null;
  } | null>(null);
  const classes = useQuery({
    queryKey: ['classes', academic.selectedYear?.id],
    queryFn: () => api.get<ClassDto[]>(`/classes?academic_year_id=${academic.selectedYear?.id}`),
    enabled: Boolean(academic.selectedYear?.id),
  });
  const categories = useQuery({
    queryKey: ['student-categories'],
    queryFn: () => api.get<StudentCategoryDto[]>('/student-categories'),
  });
  const levels = useMemo(
    () =>
      Array.from(
        new Map((classes.data ?? []).map((item) => [item.gradeLevelId, item.gradeLevelName])),
      ),
    [classes.data],
  );
  const create = useMutation({
    mutationFn: (body: CreateStudentBody) =>
      api.post<{ student: StudentDto; associationCode: string | null }>('/students', body),
    onSuccess: (result) => {
      localStorage.removeItem(DRAFT_KEY);
      setConfirmation({
        id: result.student.id,
        name: `${result.student.firstName} ${result.student.lastName}`,
        number: result.student.studentNumber,
        code: result.associationCode,
      });
    },
    onError: (error, variables) => {
      setMessage(messageOf(error));
      if (error instanceof ApiError && error.status === 409 && error.message.includes('même nom')) {
        setDuplicateBody({ ...variables, confirmDuplicate: true });
      }
    },
  });
  useEffect(() => {
    saveStudentDraft({ guardians, levelId });
  }, [guardians, levelId]);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    const data = new FormData(event.currentTarget);
    if (!academic.selectedYear) return setMessage('Sélectionnez une année scolaire.');
    const classId = String(data.get('classId') ?? '');
    create.mutate({
      student: {
        studentNumber: String(data.get('studentNumber') ?? '').trim() || null,
        firstName: String(data.get('firstName')),
        lastName: String(data.get('lastName')),
        dateOfBirth: String(data.get('dateOfBirth') ?? '') || null,
        placeOfBirth: String(data.get('placeOfBirth') ?? '') || null,
        gender: data.get('gender') as 'M' | 'F',
      },
      enrollment: {
        academicYearId: academic.selectedYear.id,
        classId: classId || null,
        studentCategoryId: String(data.get('studentCategoryId') ?? '') || null,
        enrollmentDate: String(data.get('enrollmentDate')),
        enrollmentType: data.get('enrollmentType') as 'NEW' | 'RE_ENROLLMENT' | 'TRANSFER_IN',
        status: 'ACTIVE',
      },
      guardians: guardians
        .filter((guardian) => guardian.firstName && guardian.phone.length > 4)
        .map((guardian) => ({
          ...guardian,
          isFinancialResponsible: guardian.isPrimary,
          canPay: true,
          canViewFinances: true,
          canReceiveNotifications: true,
        })),
      confirmDuplicate: false,
    });
  }
  if (confirmation)
    return (
      <section className="mx-auto max-w-2xl rounded-xl border border-emerald-200 bg-white p-8 text-center">
        <div className="text-4xl text-emerald-600">✓</div>
        <h1 className="mt-3 text-2xl font-semibold">{confirmation.name} créé</h1>
        <p className="mt-2 text-slate-600">{confirmation.number}</p>
        {confirmation.code ? (
          <p className="mt-4 rounded-lg bg-slate-100 p-3 font-mono text-lg">
            Code d’association : {confirmation.code}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            className="button-primary"
            onClick={() => navigate(`/students/${confirmation.id}`)}
          >
            Voir le dossier
          </button>
          <button
            className="rounded-lg border px-4 py-2"
            onClick={() => {
              setConfirmation(null);
              setGuardians([emptyGuardian()]);
            }}
          >
            Créer un autre élève
          </button>
          <button className="rounded-lg border px-4 py-2" onClick={() => window.print()}>
            Imprimer la fiche
          </button>
        </div>
      </section>
    );
  return (
    <form
      onSubmit={submit}
      className="space-y-5 pb-24"
      onChange={(event) => {
        const fields: Record<string, string> = {};
        new FormData(event.currentTarget).forEach((value, key) => {
          if (typeof value === 'string') fields[key] = value;
        });
        saveStudentDraft({ fields });
      }}
    >
      <header>
        <p className="text-sm font-medium text-brand-700">Nouvelle inscription</p>
        <h1 className="text-2xl font-semibold">Nouvel élève</h1>
        <p className="text-sm text-slate-500">
          Toutes les informations sont regroupées sur une seule page.
        </p>
      </header>
      <FormSection title="1. Informations personnelles">
        <div className="grid gap-3 md:grid-cols-3">
          <input
            className="input"
            name="studentNumber"
            placeholder="Matricule automatique"
            defaultValue={draft.fields?.studentNumber}
          />
          <input
            className="input"
            name="lastName"
            placeholder="Nom"
            defaultValue={draft.fields?.lastName}
            required
          />
          <input
            className="input"
            name="firstName"
            placeholder="Prénom"
            defaultValue={draft.fields?.firstName}
            required
          />
          <input
            className="input"
            name="dateOfBirth"
            type="date"
            defaultValue={draft.fields?.dateOfBirth}
          />
          <input
            className="input"
            name="placeOfBirth"
            placeholder="Lieu de naissance"
            defaultValue={draft.fields?.placeOfBirth}
          />
          <select
            className="input"
            name="gender"
            defaultValue={draft.fields?.gender ?? 'M'}
            required
          >
            <option value="M">Masculin</option>
            <option value="F">Féminin</option>
          </select>
        </div>
      </FormSection>
      <FormSection title="2. Informations scolaires">
        <div className="grid gap-3 md:grid-cols-3">
          <input className="input" value={academic.selectedYear?.name ?? ''} disabled />
          <select
            className="input"
            value={levelId}
            onChange={(event) => setLevelId(event.target.value)}
            required
          >
            <option value="">Niveau</option>
            {levels.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <select className="input" name="classId" defaultValue={draft.fields?.classId ?? ''}>
            <option value="">Non affecté</option>
            {classes.data
              ?.filter((item) => !levelId || item.gradeLevelId === levelId)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} — {item.enrollmentCount}/{item.capacity ?? '∞'}
                </option>
              ))}
          </select>
          <select
            className="input"
            name="studentCategoryId"
            defaultValue={draft.fields?.studentCategoryId ?? ''}
          >
            <option value="">Régime</option>
            {categories.data?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <input
            className="input"
            name="enrollmentDate"
            type="date"
            defaultValue={draft.fields?.enrollmentDate ?? new Date().toISOString().slice(0, 10)}
            required
          />
          <select
            className="input"
            name="enrollmentType"
            defaultValue={draft.fields?.enrollmentType ?? 'NEW'}
          >
            <option value="NEW">Nouvelle inscription</option>
            <option value="RE_ENROLLMENT">Réinscription</option>
            <option value="TRANSFER_IN">Transfert entrant</option>
          </select>
        </div>
      </FormSection>
      <FormSection title="3. Responsables">
        <div className="space-y-3">
          {guardians.map((guardian, index) => (
            <div className="grid gap-3 rounded-lg border p-3 md:grid-cols-6" key={index}>
              <input
                className="input"
                placeholder="Nom"
                value={guardian.lastName}
                onChange={(event) =>
                  setGuardians((items) =>
                    items.map((item, i) =>
                      i === index ? { ...item, lastName: event.target.value } : item,
                    ),
                  )
                }
              />
              <input
                className="input"
                placeholder="Prénom"
                value={guardian.firstName}
                onChange={(event) =>
                  setGuardians((items) =>
                    items.map((item, i) =>
                      i === index ? { ...item, firstName: event.target.value } : item,
                    ),
                  )
                }
              />
              <input
                className="input md:col-span-2"
                placeholder="+237699123456"
                value={guardian.phone}
                onChange={(event) =>
                  setGuardians((items) =>
                    items.map((item, i) =>
                      i === index
                        ? { ...item, phone: event.target.value.replace(/\s/g, '') }
                        : item,
                    ),
                  )
                }
              />
              <select
                className="input"
                value={guardian.relationship}
                onChange={(event) =>
                  setGuardians((items) =>
                    items.map((item, i) =>
                      i === index
                        ? {
                            ...item,
                            relationship: event.target.value as DraftGuardian['relationship'],
                          }
                        : item,
                    ),
                  )
                }
              >
                <option value="PERE">Père</option>
                <option value="MERE">Mère</option>
                <option value="TUTEUR">Tuteur</option>
                <option value="AUTRE">Autre</option>
              </select>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={guardian.isPrimary}
                  onChange={(event) =>
                    setGuardians((items) =>
                      items.map((item, i) => ({
                        ...item,
                        isPrimary:
                          i === index
                            ? event.target.checked
                            : event.target.checked
                              ? false
                              : item.isPrimary,
                      })),
                    )
                  }
                />{' '}
                Principal
              </label>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="mt-3 rounded-lg border px-3 py-2 text-sm"
          onClick={() => setGuardians((items) => [...items, emptyGuardian()])}
        >
          + Ajouter un responsable
        </button>
      </FormSection>
      {message ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{message}</p> : null}
      {duplicateBody ? (
        <button
          type="button"
          className="rounded-lg border border-amber-400 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900"
          onClick={() => {
            setDuplicateBody(null);
            create.mutate(duplicateBody);
          }}
        >
          Confirmer la création malgré le doublon potentiel
        </button>
      ) : null}
      <div className="fixed inset-x-0 bottom-0 z-20 flex justify-end gap-2 border-t bg-white p-4 lg:left-[260px]">
        <Link className="rounded-lg border px-4 py-2.5 text-sm" to="/students">
          Annuler
        </Link>
        <button className="button-primary" disabled={create.isPending}>
          {create.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </form>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-white p-5">
      <h2 className="mb-4 font-semibold">{title}</h2>
      {children}
    </section>
  );
}

type StudentTab =
  | 'Informations'
  | 'Responsables'
  | 'Inscriptions'
  | 'Finances'
  | 'Paiements'
  | 'Documents'
  | 'Historique';
export function StudentDetailPage() {
  const { id = '' } = useParams();
  const client = useQueryClient();
  const me = useAuthStore((state) => state.user);
  const [tab, setTab] = useState<StudentTab>('Informations');
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(false);
  const student = useQuery({
    queryKey: ['student', id],
    queryFn: () => api.get<StudentDto>(`/students/${id}`),
    enabled: Boolean(id),
  });
  const guardians = useQuery({
    queryKey: ['student-guardians', id],
    queryFn: () => api.get<StudentGuardianDto[]>(`/students/${id}/guardians`),
    enabled: Boolean(id),
  });
  const history = useQuery({
    queryKey: ['student-history', id],
    queryFn: () =>
      api.get<Array<{ id: string; kind: string; label: string; occurredAt: string }>>(
        `/students/${id}/history`,
      ),
    enabled: tab === 'Historique' || tab === 'Inscriptions',
  });
  const revoke = useMutation({
    mutationFn: ({ linkId, reason }: { linkId: string; reason: string }) =>
      api.post(`/student-guardians/${linkId}/revoke`, { reason }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['student-guardians', id] }),
    onError: (error) => setMessage(messageOf(error)),
  });
  const update = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch(`/students/${id}`, body),
    onSuccess: () => {
      setEditing(false);
      void client.invalidateQueries({ queryKey: ['student', id] });
    },
    onError: (error) => setMessage(messageOf(error)),
  });
  const value = student.data;
  if (student.isPending) return <p>Chargement…</p>;
  if (!value) return <p className="text-red-700">{messageOf(student.error)}</p>;
  return (
    <section className="space-y-5 print:bg-white">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-white p-5">
        <div>
          <p className="text-sm text-brand-700">{value.studentNumber}</p>
          <h1 className="text-2xl font-semibold">
            {value.firstName} {value.lastName}
          </h1>
          <p className="text-sm text-slate-500">
            {value.currentEnrollment?.className ?? 'Non affecté'} ·{' '}
            {value.currentEnrollment?.academicYearName ?? 'Aucune inscription'} · {value.status}
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <button className="rounded-lg border px-3 py-2" onClick={() => window.print()}>
            Imprimer
          </button>
          <button
            className="button-primary"
            onClick={() => {
              setTab('Informations');
              setEditing((value) => !value);
            }}
          >
            {editing ? 'Fermer' : 'Modifier'}
          </button>
          <AssociationPrintButton student={value} />
        </div>
      </header>
      {value.currentEnrollment && me?.permissions.includes('student_fees.read') ? (
        <StudentFinancialOverview enrollmentId={value.currentEnrollment.id} />
      ) : null}
      <nav className="flex gap-1 overflow-x-auto border-b print:hidden">
        {(
          [
            'Informations',
            'Responsables',
            'Inscriptions',
            'Finances',
            'Paiements',
            'Documents',
            'Historique',
          ] as StudentTab[]
        ).map((item) => (
          <button
            className={`whitespace-nowrap px-3 py-2 text-sm ${tab === item ? 'border-b-2 border-brand-600 font-semibold text-brand-700' : 'text-slate-500'}`}
            key={item}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </nav>
      {message ? <p className="rounded bg-red-50 p-3 text-sm text-red-700">{message}</p> : null}
      {tab === 'Informations' ? (
        editing ? (
          <form
            className="grid gap-3 rounded-xl border bg-white p-5 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              update.mutate({
                firstName: data.get('firstName'),
                lastName: data.get('lastName'),
                dateOfBirth: String(data.get('dateOfBirth') ?? '') || null,
                placeOfBirth: String(data.get('placeOfBirth') ?? '') || null,
                gender: data.get('gender'),
              });
            }}
          >
            <input className="input" name="lastName" defaultValue={value.lastName} required />
            <input className="input" name="firstName" defaultValue={value.firstName} required />
            <input
              className="input"
              name="dateOfBirth"
              type="date"
              defaultValue={value.dateOfBirth ?? ''}
            />
            <input className="input" name="placeOfBirth" defaultValue={value.placeOfBirth ?? ''} />
            <select className="input" name="gender" defaultValue={value.gender ?? 'M'}>
              <option value="M">Masculin</option>
              <option value="F">Féminin</option>
            </select>
            <button className="button-primary" disabled={update.isPending}>
              Enregistrer les modifications
            </button>
          </form>
        ) : (
          <div className="grid gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2">
            <Info label="Date de naissance" value={value.dateOfBirth ?? 'Non renseignée'} />
            <Info label="Lieu de naissance" value={value.placeOfBirth ?? 'Non renseigné'} />
            <Info label="Sexe" value={value.gender ?? 'Non renseigné'} />
            <Info label="Statut" value={value.status} />
          </div>
        )
      ) : null}
      {tab === 'Informations' && value.currentEnrollment ? (
        <TransferClassForm
          enrollment={value.currentEnrollment}
          onTransferred={() => {
            void client.invalidateQueries({ queryKey: ['student', id] });
            void client.invalidateQueries({ queryKey: ['student-history', id] });
          }}
        />
      ) : null}
      {tab === 'Responsables' ? (
        <div className="space-y-3">
          {guardians.data?.length ? (
            guardians.data.map((link) => (
              <article key={link.id} className="rounded-xl border bg-white p-5">
                <div className="flex justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">
                      {link.guardian.firstName} {link.guardian.lastName} · {link.relationship}
                    </h3>
                    <p className="text-sm text-slate-500">
                      {link.guardian.phone} · {link.guardian.email ?? 'Sans e-mail'}
                    </p>
                  </div>
                  <span className="text-sm font-medium">{link.status}</span>
                </div>
                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                  <span>Compte CSB-NK : {link.guardian.hasAccount ? 'Activé' : 'Non créé'}</span>
                  <span>Principal : {link.isPrimary ? 'Oui' : 'Non'}</span>
                  <span>Peut payer : {link.canPay ? 'Oui' : 'Non'}</span>
                </div>
                {link.status === 'ACCEPTED' ? (
                  <button
                    className="mt-4 rounded border border-red-300 px-3 py-2 text-sm text-red-700"
                    onClick={() => {
                      const reason = window.prompt('Motif de révocation');
                      if (reason) revoke.mutate({ linkId: link.id, reason });
                    }}
                  >
                    Révoquer l’accès
                  </button>
                ) : null}
              </article>
            ))
          ) : (
            <p className="rounded-xl border border-dashed bg-white p-6 text-slate-500">
              Aucun responsable enregistré.
            </p>
          )}
          <AddGuardianForm
            studentId={id}
            onCreated={() => client.invalidateQueries({ queryKey: ['student-guardians', id] })}
          />
        </div>
      ) : null}
      {tab === 'Inscriptions' || tab === 'Historique' ? (
        <div className="space-y-3">
          {history.data
            ?.filter((item) => tab === 'Historique' || item.kind === 'ENROLLMENT')
            .map((item) => (
              <div key={item.id} className="rounded-xl border bg-white p-4">
                <p className="font-medium">{item.label}</p>
                <time className="text-xs text-slate-500">
                  {new Date(item.occurredAt).toLocaleString('fr-CM')}
                </time>
              </div>
            ))}
        </div>
      ) : null}
      {tab === 'Finances' && value.currentEnrollment ? (
        <StudentFinancePanel enrollmentId={value.currentEnrollment.id} />
      ) : null}
      {tab === 'Paiements' ? <StudentPaymentsPanel studentId={value.id} /> : null}
      {tab === 'Documents' ? (
        <p className="rounded-xl border border-dashed bg-white p-8 text-center text-slate-500">
          Ce volet sera alimenté dans une phase ultérieure.
        </p>
      ) : null}
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase text-slate-500">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}

function TransferClassForm({
  enrollment,
  onTransferred,
}: {
  enrollment: NonNullable<StudentDto['currentEnrollment']>;
  onTransferred(): void;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const classes = useQuery({
    queryKey: ['classes', enrollment.academicYearId],
    queryFn: () => api.get<ClassDto[]>(`/classes?academic_year_id=${enrollment.academicYearId}`),
  });
  const transfer = useMutation({
    mutationFn: (body: { toClassId: string | null; reason: string }) =>
      api.post(`/enrollments/${enrollment.id}/transfer-class`, body),
    onSuccess: () => {
      setOpen(false);
      setMessage('Changement de classe enregistré dans l’historique.');
      onTransferred();
    },
    onError: (error) => setMessage(messageOf(error)),
  });
  return (
    <section className="rounded-xl border bg-white p-5 print:hidden">
      <button
        className="text-sm font-semibold text-brand-700"
        onClick={() => setOpen((value) => !value)}
      >
        Changer de classe
      </button>
      {open ? (
        <form
          className="mt-4 grid gap-3 md:grid-cols-[1fr_2fr_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            transfer.mutate({
              toClassId: String(data.get('toClassId')) || null,
              reason: String(data.get('reason')),
            });
          }}
        >
          <select className="input" name="toClassId" defaultValue={enrollment.classId ?? ''}>
            <option value="">Non affecté</option>
            {classes.data?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} — {item.enrollmentCount}/{item.capacity ?? '∞'}
              </option>
            ))}
          </select>
          <input
            className="input"
            name="reason"
            placeholder="Motif obligatoire"
            minLength={3}
            required
          />
          <button className="button-primary" disabled={transfer.isPending}>
            Confirmer
          </button>
        </form>
      ) : null}
      {message ? <p className="mt-3 text-sm text-slate-600">{message}</p> : null}
    </section>
  );
}

function AddGuardianForm({ studentId, onCreated }: { studentId: string; onCreated(): void }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post(`/students/${studentId}/guardians`, body),
    onSuccess: () => {
      setOpen(false);
      setMessage('Responsable ajouté — association en attente.');
      onCreated();
    },
    onError: (error) => setMessage(messageOf(error)),
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    create.mutate({
      firstName: data.get('firstName'),
      lastName: data.get('lastName'),
      phone: String(data.get('phone')).replace(/\s/g, ''),
      relationship: data.get('relationship'),
      isPrimary: data.get('isPrimary') === 'on',
      isFinancialResponsible: data.get('isPrimary') === 'on',
      canPay: true,
      canViewFinances: true,
      canReceiveNotifications: true,
    });
  }
  return (
    <div className="rounded-xl border border-dashed bg-white p-4 print:hidden">
      <button
        className="text-sm font-semibold text-brand-700"
        onClick={() => setOpen((value) => !value)}
      >
        + Ajouter un responsable
      </button>
      {open ? (
        <form className="mt-4 grid gap-3 md:grid-cols-5" onSubmit={submit}>
          <input className="input" name="lastName" placeholder="Nom" required />
          <input className="input" name="firstName" placeholder="Prénom" required />
          <input className="input" name="phone" placeholder="+237699123456" required />
          <select className="input" name="relationship">
            <option value="PERE">Père</option>
            <option value="MERE">Mère</option>
            <option value="TUTEUR">Tuteur</option>
            <option value="AUTRE">Autre</option>
          </select>
          <button className="button-primary" disabled={create.isPending}>
            Rattacher
          </button>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isPrimary" /> Responsable principal
          </label>
        </form>
      ) : null}
      {message ? <p className="mt-3 text-sm text-slate-600">{message}</p> : null}
    </div>
  );
}

function AssociationPrintButton({ student }: { student: StudentDto }) {
  const [sheet, setSheet] = useState<{ invite: GuardianInviteDto; qr: string } | null>(null);
  const create = useMutation({
    mutationFn: () =>
      api.post<GuardianInviteDto>(`/students/${student.id}/invites`, {
        type: 'QR_CODE',
        maxUses: 1,
      }),
    onSuccess: async (invite) => {
      if (!invite.linkUrl) return;
      const { toDataURL } = await import('qrcode');
      const qr = await toDataURL(invite.linkUrl, {
        width: 280,
        margin: 1,
        errorCorrectionLevel: 'M',
      });
      setSheet({ invite, qr });
      window.setTimeout(() => {
        document.body.classList.add('association-print-mode');
        window.addEventListener(
          'afterprint',
          () => document.body.classList.remove('association-print-mode'),
          { once: true },
        );
        window.print();
      }, 50);
    },
  });
  return (
    <>
      <button
        className="rounded-lg border px-3 py-2"
        onClick={() => create.mutate()}
        disabled={create.isPending}
      >
        {create.isPending ? 'Préparation…' : 'Fiche d’association'}
      </button>
      {sheet
        ? createPortal(
            <article className="association-sheet mx-auto max-w-xl p-10 text-center">
              <p className="text-lg font-semibold">CSB Noutcha KAMGUE</p>
              <h1 className="mt-8 text-2xl font-bold">
                {student.firstName} {student.lastName}
              </h1>
              <p>Matricule : {student.studentNumber}</p>
              <p>Classe : {student.currentEnrollment?.className ?? 'Non affecté'}</p>
              <h2 className="mt-8 text-lg font-semibold">
                Associer cet élève à votre application CSB-NK
              </h2>
              <ol className="mx-auto mt-4 max-w-sm list-decimal text-left text-sm">
                <li>Téléchargez l’application CSB-NK.</li>
                <li>Créez votre compte parent.</li>
                <li>Scannez ce QR code.</li>
              </ol>
              <img
                className="mx-auto mt-6 h-64 w-64"
                src={sheet.qr}
                alt="QR code d’association opaque"
              />
              <p className="mt-5">Ou saisissez le code :</p>
              <p className="font-mono text-2xl font-bold tracking-wider">
                {sheet.invite.shortCode}
              </p>
              <p className="mt-4 text-sm">
                Valable jusqu’au {new Date(sheet.invite.expiresAt).toLocaleDateString('fr-CM')}
              </p>
            </article>,
            document.body,
          )
        : null}
    </>
  );
}

export function GuardianRequestsPage() {
  const [status, setStatus] = useState<GuardianRequestStatus>('PENDING');
  const [kind, setKind] = useState<GuardianRequestKind>('LINK_REQUEST');
  const client = useQueryClient();
  const requests = useQuery({
    queryKey: ['guardian-requests', status, kind],
    queryFn: () =>
      api.get<GuardianRequestDto[]>(`/guardian-requests?status=${status}&kind=${kind}`),
  });
  const decide = useMutation({
    mutationFn: ({
      id,
      action,
      reason,
    }: {
      id: string;
      action: 'approve' | 'reject';
      reason: string;
    }) => api.post(`/guardian-requests/${id}/${action}`, { reason }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['guardian-requests'] }),
  });
  return (
    <section className="space-y-5">
      <header>
        <p className="text-sm font-medium text-brand-700">Responsables</p>
        <h1 className="text-2xl font-semibold">Demandes d’association</h1>
      </header>
      <div className="flex gap-2">
        <button
          className={`rounded-lg px-4 py-2 ${kind === 'LINK_REQUEST' ? 'bg-slate-900 text-white' : 'border'}`}
          onClick={() => setKind('LINK_REQUEST')}
        >
          Demandes
        </button>
        <button
          className={`rounded-lg px-4 py-2 ${kind === 'DISPUTE' ? 'bg-slate-900 text-white' : 'border'}`}
          onClick={() => setKind('DISPUTE')}
        >
          Litiges
        </button>
        <select
          className="input ml-auto w-auto"
          value={status}
          onChange={(event) => setStatus(event.target.value as GuardianRequestStatus)}
        >
          <option value="PENDING">En attente</option>
          <option value="APPROVED">Approuvées</option>
          <option value="REJECTED">Rejetées</option>
        </select>
      </div>
      <div className="space-y-3">
        {requests.data?.map((request) => (
          <article className="rounded-xl border bg-white p-5" key={request.id}>
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <h2 className="font-semibold">{request.requesterName}</h2>
                <p className="text-sm text-slate-500">
                  {request.claimedStudentNumber ??
                    request.claimedStudentName ??
                    'Élève à identifier'}{' '}
                  · {request.relationship ?? 'Parenté à définir'}
                </p>
                <p className="mt-2 text-sm">{request.message}</p>
              </div>
              {request.status === 'PENDING' ? (
                <div className="flex gap-2">
                  <button
                    className="button-primary"
                    onClick={() =>
                      decide.mutate({
                        id: request.id,
                        action: 'approve',
                        reason: 'Demande vérifiée',
                      })
                    }
                  >
                    Approuver
                  </button>
                  <button
                    className="rounded-lg border px-3 py-2"
                    onClick={() => {
                      const reason = window.prompt('Motif du rejet');
                      if (reason) decide.mutate({ id: request.id, action: 'reject', reason });
                    }}
                  >
                    Rejeter
                  </button>
                </div>
              ) : (
                <span>{request.status}</span>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function RegistrarIndicators() {
  const academic = useAcademicYear();
  const stats = useQuery({
    queryKey: ['registrar-dashboard', academic.selectedYear?.id],
    queryFn: () =>
      api.get<RegistrarDashboard>(
        `/dashboard/registrar?academic_year_id=${academic.selectedYear?.id}`,
      ),
    enabled: Boolean(academic.selectedYear?.id),
  });
  const cards = [
    [
      'Élèves actifs',
      stats.data?.activeStudents ?? 0,
      '/students?status=ACTIVE',
      'Effectif actuel',
    ],
    [
      'Nouvelles inscriptions',
      stats.data?.newEnrollments ?? 0,
      '/students?enrollment_type=NEW',
      'Cette année',
    ],
    [
      'Réinscriptions',
      stats.data?.reenrollments ?? 0,
      '/students?enrollment_type=RE_ENROLLMENT',
      'Cette année',
    ],
    ['Sans classe', stats.data?.unassignedStudents ?? 0, '/students?class_id=none', 'À affecter'],
    [
      'Parents en attente',
      stats.data?.pendingGuardianLinks ?? 0,
      '/guardian-requests',
      'À vérifier',
    ],
  ] as const;
  return (
    <div className="registrar-summary">
      {cards.map(([label, value, to, context], index) => (
        <Link key={label} to={to} className={index >= 3 && value > 0 ? 'needs-attention' : ''}>
          <span>{context}</span>
          <strong className="tabular">{stats.isPending ? '—' : value}</strong>
          <small>{label}</small>
        </Link>
      ))}
    </div>
  );
}
