import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type {
  AcademicYearDto,
  ClassDto,
  ImportBatchDto,
  Paginated,
  StudentDto,
} from '@cplan/contracts';
import { api, downloadApiFile } from '@/shared/api/client';
import { useAcademicYear } from '@/features/academic/use-academic-year';

const example = JSON.stringify(
  [
    {
      lastName: 'FOTSO',
      firstName: 'Nathan',
      gender: 'M',
      className: '6e A',
      guardian1FirstName: 'Jean',
      guardian1LastName: 'Fotso',
      guardian1Phone: '+237699000000',
      guardian1Relationship: 'PERE',
    },
  ],
  null,
  2,
);
export function ImportStudentsPage() {
  const year = useAcademicYear();
  const [rows, setRows] = useState(example);
  const [file, setFile] = useState<{ name: string; base64: string } | null>(null);
  const [batch, setBatch] = useState<ImportBatchDto | null>(null);
  const [message, setMessage] = useState('');
  const run = useMutation({
    mutationFn: async (action: 'create' | 'validate' | 'execute') => {
      if (action === 'create')
        return api.post<ImportBatchDto>(
          '/imports',
          file
            ? {
                academicYearId: year.selectedYear?.id,
                fileBase64: file.base64,
                filename: file.name,
              }
            : { academicYearId: year.selectedYear?.id, rows: JSON.parse(rows) as unknown[] },
        );
      if (!batch) throw new Error('Créez d’abord le lot.');
      return api.post<ImportBatchDto>(`/imports/${batch.id}/${action}`);
    },
    onSuccess: (value) => {
      setBatch(value);
      setMessage('Opération terminée.');
    },
    onError: (error) => setMessage(error.message),
  });
  return (
    <section className="space-y-6">
      <header>
        <p className="text-sm font-medium text-brand-700">Rentrée scolaire</p>
        <h1 className="text-2xl font-bold">Importer des élèves</h1>
        <p className="mt-1 text-sm text-slate-500">
          Préparez, validez, corrigez puis exécutez. L’import est reprenable.
        </p>
      </header>
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="rounded-2xl border bg-white p-5">
          <div className="flex justify-between">
            <h2 className="font-semibold">Fichier Excel</h2>
            <button
              className="rounded-lg border px-3 py-2 text-sm"
              onClick={() =>
                void downloadApiFile(
                  `/imports/template?type=STUDENTS&academic_year_id=${year.selectedYear?.id ?? ''}`,
                  'modele-eleves-csb-nk.xlsx',
                )
              }
            >
              Télécharger le modèle Excel
            </button>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            Sélectionnez le modèle rempli. Les lignes existantes ne sont jamais modifiées.
          </p>
          <input
            aria-label="Fichier Excel à importer"
            accept=".xlsx"
            className="input mt-4"
            type="file"
            onChange={(event) => {
              const selected = event.target.files?.[0];
              if (!selected) return setFile(null);
              const reader = new FileReader();
              reader.onload = () =>
                setFile({ name: selected.name, base64: String(reader.result).split(',')[1] ?? '' });
              reader.readAsDataURL(selected);
            }}
          />
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-slate-500">Saisie JSON avancée</summary>
            <textarea
              aria-label="Lignes à importer"
              className="input mt-3 min-h-56 font-mono text-xs"
              value={rows}
              onChange={(event) => {
                setRows(event.target.value);
                setFile(null);
              }}
            />
          </details>
          <button
            className="button-primary mt-4"
            disabled={run.isPending || !year.selectedYear}
            onClick={() => run.mutate('create')}
          >
            1 · Créer le lot {file ? `· ${file.name}` : ''}
          </button>
        </div>
        <aside className="rounded-2xl border bg-slate-950 p-5 text-white">
          <h2 className="font-semibold">Progression</h2>
          <div className="mt-4 space-y-3 text-sm">
            <p>
              Statut <strong className="float-right">{batch?.status ?? 'À préparer'}</strong>
            </p>
            <p>
              Lignes <strong className="float-right">{batch?.totalRows ?? 0}</strong>
            </p>
            <p>
              Valides{' '}
              <strong className="float-right text-emerald-300">{batch?.validRows ?? 0}</strong>
            </p>
            <p>
              Erreurs <strong className="float-right text-red-300">{batch?.errorRows ?? 0}</strong>
            </p>
            <p>
              Importées <strong className="float-right">{batch?.importedRows ?? 0}</strong>
            </p>
          </div>
          <div className="mt-6 grid gap-2">
            <button
              className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40"
              disabled={!batch || run.isPending}
              onClick={() => run.mutate('validate')}
            >
              2 · Valider
            </button>
            <button
              className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold disabled:opacity-40"
              disabled={!batch || batch.errorRows > 0 || run.isPending}
              onClick={() => run.mutate('execute')}
            >
              3 · Exécuter / reprendre
            </button>
            {batch ? (
              <button
                className="rounded-lg border border-slate-600 px-3 py-2 text-sm"
                onClick={() =>
                  void downloadApiFile(`/imports/${batch.id}/report`, 'rapport-import.xlsx')
                }
              >
                Rapport Excel
              </button>
            ) : null}
          </div>
          {message ? <p className="mt-4 text-sm text-slate-300">{message}</p> : null}
        </aside>
      </div>
    </section>
  );
}

export function ReenrollmentPage() {
  const years = useQuery({
    queryKey: ['academic-years'],
    queryFn: () => api.get<AcademicYearDto[]>('/academic-years'),
  });
  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [classId, setClassId] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [result, setResult] = useState<{
    created: number;
    skipped: number;
    errors: Array<{ studentId: string; message: string }>;
  } | null>(null);
  const students = useQuery({
    queryKey: ['reenroll-students', sourceId],
    queryFn: () =>
      api.get<Paginated<StudentDto>>(`/students?academic_year_id=${sourceId}&page_size=100`),
    enabled: Boolean(sourceId),
  });
  const classes = useQuery({
    queryKey: ['classes', targetId],
    queryFn: () => api.get<ClassDto[]>(`/classes?academic_year_id=${targetId}`),
    enabled: Boolean(targetId),
  });
  const run = useMutation({
    mutationFn: (preview: boolean) => {
      const target = classes.data?.find((item) => item.id === classId);
      if (!target) throw new Error('Sélectionnez une classe cible.');
      return api.post<{
        created: number;
        skipped: number;
        errors: Array<{ studentId: string; message: string }>;
      }>(`/enrollments/bulk-reenroll${preview ? '/preview' : ''}`, {
        sourceAcademicYearId: sourceId,
        targetAcademicYearId: targetId,
        studentIds: selected,
        classByGradeLevel: Object.fromEntries(
          (students.data?.data ?? [])
            .filter((item) => selected.includes(item.id) && item.currentEnrollment?.gradeLevelId)
            .map((item) => [item.currentEnrollment?.gradeLevelId, target.id]),
        ),
        completeSource: true,
        preview,
      });
    },
    onSuccess: setResult,
  });
  return (
    <section className="space-y-6">
      <header>
        <p className="text-sm font-medium text-brand-700">Rentrée scolaire</p>
        <h1 className="text-2xl font-bold">Réinscription en masse</h1>
        <p className="mt-1 text-sm text-slate-500">
          La nouvelle inscription est créée sans altérer l’historique financier précédent.
        </p>
      </header>
      <div className="grid gap-4 rounded-2xl border bg-white p-5 md:grid-cols-3">
        <label className="text-sm">
          Année source
          <select
            className="input mt-1"
            value={sourceId}
            onChange={(event) => {
              setSourceId(event.target.value);
              setSelected([]);
            }}
          >
            <option value="">Choisir</option>
            {years.data?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Année cible
          <select
            className="input mt-1"
            value={targetId}
            onChange={(event) => setTargetId(event.target.value)}
          >
            <option value="">Choisir</option>
            {years.data
              ?.filter((item) => item.id !== sourceId)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
        </label>
        <label className="text-sm">
          Classe cible
          <select
            className="input mt-1"
            value={classId}
            onChange={(event) => setClassId(event.target.value)}
          >
            <option value="">Choisir</option>
            {classes.data?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.enrollmentCount}/{item.capacity ?? '∞'}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="overflow-hidden rounded-2xl border bg-white">
        <div className="flex justify-between bg-slate-50 p-4">
          <strong>{selected.length} élève(s) sélectionné(s)</strong>
          <button
            className="text-sm text-brand-700"
            onClick={() => setSelected((students.data?.data ?? []).map((item) => item.id))}
          >
            Tout sélectionner
          </button>
        </div>
        {students.data?.data.map((student) => (
          <label className="flex items-center gap-3 border-t p-4" key={student.id}>
            <input
              type="checkbox"
              checked={selected.includes(student.id)}
              onChange={(event) =>
                setSelected((current) =>
                  event.target.checked
                    ? [...current, student.id]
                    : current.filter((id) => id !== student.id),
                )
              }
            />
            <span className="flex-1">
              <strong>
                {student.lastName} {student.firstName}
              </strong>
              <small className="block text-slate-500">
                {student.studentNumber} · {student.currentEnrollment?.className}
              </small>
            </span>
          </label>
        ))}
      </div>
      <div className="flex gap-3">
        <button
          className="rounded-lg border px-4 py-2.5 text-sm font-semibold"
          disabled={!selected.length || run.isPending}
          onClick={() => run.mutate(true)}
        >
          Prévisualiser
        </button>
        <button
          className="button-primary"
          disabled={!selected.length || run.isPending}
          onClick={() => run.mutate(false)}
        >
          Réinscrire
        </button>
      </div>
      {result ? (
        <div className="rounded-xl bg-brand-50 p-4 text-sm text-brand-900">
          {result.created} à créer/créé(s) · {result.skipped} ignoré(s) · {result.errors.length}{' '}
          erreur(s)
        </div>
      ) : null}
    </section>
  );
}
