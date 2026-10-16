import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { ClassDto } from '@cplan/contracts';
import { api, downloadApiFile } from '@/shared/api/client';
import { humanLabel } from '@/shared/ui/format';
import { useAcademicYear } from '@/features/academic/use-academic-year';

const money = (value: number) => `${value.toLocaleString('fr-CM')} FCFA`;
const pct = (value: number) => `${value.toLocaleString('fr-CM', { maximumFractionDigits: 1 })} %`;
type Collection = {
  id: string;
  name: string;
  students: number;
  expected: number;
  collected: number;
  balance: number;
  collectionRate: number;
  warning?: boolean;
};
type Dashboard = {
  students: number;
  expected: number;
  collected: number;
  balance: number;
  collectionRate: number;
  paymentsToday?: number;
  awaitingValidation?: number;
  overdueValidation?: number;
  trends: Array<{ period: string; amount: number }>;
  methods?: Array<{ method: string; provider: string | null; count: number; amount: number }>;
  byLevel?: Collection[];
  byClass?: Collection[];
};
function Header({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <header>
      <p className="text-sm font-semibold text-brand-700">{eyebrow}</p>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </header>
  );
}
function Kpis({ data, director = false }: { data: Dashboard; director?: boolean }) {
  const values = [
    ['Effectif', data.students, '/students'],
    ['Attendu', money(data.expected), '/reports'],
    ['Encaissé', money(data.collected), '/payments'],
    ['Reste à recouvrer', money(data.balance), '/reports/advanced'],
  ];
  return (
    <div className="grid gap-3 md:grid-cols-4">
      {values.map(([label, value, to]) => (
        <Link
          to={String(to)}
          key={String(label)}
          className="rounded-2xl border bg-white p-5 shadow-sm hover:border-brand-300"
        >
          <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
          <strong className="mt-2 block text-xl tabular">{value}</strong>
        </Link>
      ))}
      <div className="rounded-2xl bg-slate-950 p-5 text-white md:col-span-4">
        <div className="flex justify-between">
          <span>Taux de recouvrement</span>
          <strong>{pct(data.collectionRate)}</strong>
        </div>
        <div className="mt-3 h-3 rounded-full bg-slate-700">
          <div
            className="h-3 rounded-full bg-emerald-400"
            style={{ width: `${Math.min(100, data.collectionRate)}%` }}
          />
        </div>
        {director ? (
          <p className="mt-2 text-xs text-slate-300">
            Chaque ligne permet de descendre jusqu’au détail de la classe.
          </p>
        ) : null}
      </div>
    </div>
  );
}
function Trend({ rows }: { rows: Dashboard['trends'] }) {
  const max = Math.max(1, ...rows.map((r) => r.amount));
  return (
    <article className="rounded-2xl border bg-white p-5">
      <h2 className="font-semibold">Évolution des encaissements</h2>
      <div className="mt-5 flex h-48 items-end gap-1">
        {rows.slice(-30).map((row) => (
          <div
            key={row.period}
            className="group relative min-w-1 flex-1 rounded-t bg-brand-600"
            style={{ height: `${Math.max(3, (row.amount / max) * 100)}%` }}
            title={`${new Date(row.period).toLocaleDateString('fr-CM')} · ${money(row.amount)}`}
          />
        ))}
      </div>
    </article>
  );
}
function DashboardLoadError({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <section className="rounded-2xl border border-red-200 bg-white p-8 text-center">
      <h1 className="text-xl font-bold">{label} indisponible</h1>
      <p className="mt-2 text-sm text-red-700">
        Les données financières n’ont pas pu être chargées.
      </p>
      <button className="button-primary mt-4" onClick={onRetry}>
        Réessayer
      </button>
    </section>
  );
}
export function AccountantDashboardPage() {
  const year = useAcademicYear();
  const id = year.selectedYear?.id;
  const query = useQuery({
    queryKey: ['accountant-dashboard', id],
    queryFn: () => api.get<Dashboard>(`/reports/accountant-dashboard?academic_year_id=${id}`),
    enabled: Boolean(id),
    staleTime: 60_000,
  });
  if (query.isPending) return <p>Chargement du tableau de bord…</p>;
  if (query.error || !query.data)
    return <DashboardLoadError label="Vue comptable" onRetry={() => void query.refetch()} />;
  const data = query.data;
  return (
    <section className="space-y-6">
      <Header
        eyebrow="Comptabilité"
        title="Pilotage des encaissements"
        description={`Situation temps réel · ${year.selectedYear?.name ?? ''}`}
      />
      <Kpis data={data} />
      <div className="grid gap-4 md:grid-cols-3">
        <Link to="/payments?quick=today" className="rounded-xl border bg-white p-4">
          <span className="text-sm text-slate-500">Paiements du jour</span>
          <strong className="mt-1 block">{money(data.paymentsToday ?? 0)}</strong>
        </Link>
        <Link to="/external-payments" className="rounded-xl border bg-white p-4">
          <span className="text-sm text-slate-500">En validation</span>
          <strong className="mt-1 block">{data.awaitingValidation ?? 0}</strong>
        </Link>
        <Link
          to="/external-payments?overdue=true"
          className="rounded-xl border border-amber-200 bg-amber-50 p-4"
        >
          <span className="text-sm text-amber-800">SLA dépassé</span>
          <strong className="mt-1 block">{data.overdueValidation ?? 0}</strong>
        </Link>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Trend rows={data.trends} />
        <article className="rounded-2xl border bg-white p-5">
          <h2 className="font-semibold">Répartition par moyen</h2>
          <div className="mt-4 space-y-3">
            {data.methods?.map((item) => (
              <div
                key={`${item.method}-${item.provider}`}
                className="flex justify-between border-b pb-2"
              >
                <span>
                  {humanLabel(item.method)}
                  {item.provider ? ` · ${item.provider}` : ''}
                </span>
                <strong>{money(item.amount)}</strong>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
export function DirectorDashboardPage() {
  const year = useAcademicYear();
  const id = year.selectedYear?.id;
  const query = useQuery({
    queryKey: ['director-dashboard', id],
    queryFn: () => api.get<Dashboard>(`/reports/director-dashboard?academic_year_id=${id}`),
    enabled: Boolean(id),
    staleTime: 60_000,
  });
  if (query.isPending) return <p>Chargement de la vue Direction…</p>;
  if (query.error || !query.data)
    return <DashboardLoadError label="Vue direction" onRetry={() => void query.refetch()} />;
  return (
    <section className="space-y-6">
      <Header
        eyebrow="Direction"
        title="Situation financière"
        description={`Vue consolidée · ${year.selectedYear?.name ?? ''}`}
      />
      <Kpis data={query.data} director />
      <Trend rows={query.data.trends} />
      <article className="overflow-x-auto rounded-2xl border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="p-3">Classe</th>
              <th>Élèves</th>
              <th>Attendu</th>
              <th>Encaissé</th>
              <th>Reste</th>
              <th>Recouvrement</th>
            </tr>
          </thead>
          <tbody>
            {query.data.byClass
              ?.sort((a, b) => a.collectionRate - b.collectionRate)
              .map((row) => (
                <tr className={row.warning ? 'border-t bg-amber-50' : 'border-t'} key={row.id}>
                  <td className="p-3">
                    <Link
                      className="font-semibold text-brand-700"
                      to={`/reports/class-status?class=${row.id}`}
                    >
                      {row.name}
                      {row.warning ? ' ⚠' : ''}
                    </Link>
                  </td>
                  <td>{row.students}</td>
                  <td>{money(row.expected)}</td>
                  <td>{money(row.collected)}</td>
                  <td>{money(row.balance)}</td>
                  <td>{pct(row.collectionRate)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </article>
    </section>
  );
}
type StatusRow = {
  enrollmentId: string;
  studentId: string;
  studentNumber: string;
  studentName: string;
  className: string;
  expected: number;
  collected: number;
  balance: number;
  situation: string;
};
export function ClassPaymentStatusPage() {
  const year = useAcademicYear();
  const [klass, setKlass] = useState(new URLSearchParams(location.search).get('class') ?? '');
  const [situation, setSituation] = useState('');
  const classes = useQuery({
    queryKey: ['classes', year.selectedYear?.id],
    queryFn: () => api.get<ClassDto[]>(`/classes?academic_year_id=${year.selectedYear?.id}`),
    enabled: Boolean(year.selectedYear?.id),
  });
  const query = useQuery({
    queryKey: ['class-payment-status', klass, situation],
    queryFn: () =>
      api.get<{
        data: StatusRow[];
        totals: {
          students: number;
          expected: number;
          collected: number;
          balance: number;
          collectionRate: number;
        };
      }>(
        `/reports/class-payment-status?class_id=${klass}${situation ? `&situation=${situation}` : ''}`,
      ),
    enabled: Boolean(klass),
  });
  return (
    <section className="space-y-5">
      <Header
        eyebrow="Comptabilité"
        title="État des paiements"
        description="À jour signifie que toutes les échéances arrivées sont payées, même si des tranches futures restent dues."
      />
      <div className="grid gap-3 rounded-xl border bg-white p-4 md:grid-cols-3">
        <select className="input" value={klass} onChange={(e) => setKlass(e.target.value)}>
          <option value="">Choisir une classe</option>
          {classes.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select className="input" value={situation} onChange={(e) => setSituation(e.target.value)}>
          <option value="">Toutes les situations</option>
          <option value="ON_TRACK">À jour</option>
          <option value="PARTIAL">Partiel</option>
          <option value="UNPAID">Non payé</option>
          <option value="OVERDUE">En retard</option>
        </select>
        {klass ? (
          <button
            className="button-primary"
            onClick={() =>
              void downloadApiFile(`/print/class-payment-status/${klass}`, 'etat-paiements.pdf')
            }
          >
            Imprimer PDF
          </button>
        ) : null}
      </div>
      {query.data ? (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-50">
              <tr>
                <th className="p-3">Élève</th>
                <th>Matricule</th>
                <th>À payer</th>
                <th>Payé</th>
                <th>Reste</th>
                <th>Situation</th>
              </tr>
            </thead>
            <tbody>
              {query.data.data.map((row) => (
                <tr className="border-t" key={row.enrollmentId}>
                  <td className="p-3">
                    <Link className="font-medium text-brand-700" to={`/students/${row.studentId}`}>
                      {row.studentName}
                    </Link>
                  </td>
                  <td>{row.studentNumber}</td>
                  <td>{money(row.expected)}</td>
                  <td>{money(row.collected)}</td>
                  <td>{money(row.balance)}</td>
                  <td>{humanLabel(row.situation)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 bg-slate-950 font-semibold text-white">
              <tr>
                <td className="p-3" colSpan={2}>
                  TOTAL · {query.data.totals.students} élèves
                </td>
                <td>{money(query.data.totals.expected)}</td>
                <td>{money(query.data.totals.collected)}</td>
                <td>{money(query.data.totals.balance)}</td>
                <td>{pct(query.data.totals.collectionRate)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed bg-white p-8 text-center text-slate-500">
          Sélectionnez une classe.
        </p>
      )}
    </section>
  );
}
const presets = [
  'Élèves n’ayant rien payé',
  'Élèves à jour',
  '1ère tranche payée',
  '2e tranche non payée',
  'Impayés > 100 000 FCFA',
  'Orange Money du mois',
  'Mobile Money de la semaine',
  'Paiements externes rejetés',
  'En attente depuis plus de 48 h',
];
export function AdvancedReportsPage() {
  const [chosen, setChosen] = useState(1);
  const [threshold, setThreshold] = useState(100000);
  const query = useMutation({
    mutationFn: () =>
      api.post<unknown[]>('/reports/custom-query', {
        preset: chosen,
        criteria: { min_amount: threshold },
        preview: false,
      }),
  });
  return (
    <section className="space-y-5">
      <Header
        eyebrow="Comptabilité"
        title="États financiers"
        description="Neuf requêtes prêtes à l’emploi, paramétrables et enregistrables."
      />
      <div className="grid gap-3 md:grid-cols-3">
        {presets.map((label, index) => (
          <button
            key={label}
            onClick={() => setChosen(index + 1)}
            className={`rounded-xl border p-4 text-left ${chosen === index + 1 ? 'border-brand-500 bg-brand-50' : 'bg-white'}`}
          >
            <span className="text-xs text-slate-400">ÉTAT {index + 1}</span>
            <strong className="mt-1 block">{label}</strong>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 rounded-xl border bg-white p-4">
        <input
          className="input max-w-64"
          aria-label="Seuil d’impayé"
          type="number"
          value={threshold}
          onChange={(e) => setThreshold(Number(e.target.value))}
        />
        <button className="button-primary" onClick={() => query.mutate()}>
          Exécuter
        </button>
      </div>
      {query.data ? (
        <pre className="max-h-96 overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">
          {JSON.stringify(query.data, null, 2)}
        </pre>
      ) : null}
    </section>
  );
}
type ExportRow = {
  exportId: string;
  type: string;
  format: string;
  status: string;
  rowCount: number | null;
  requestedAt: string;
  downloadUrl?: string;
};
export function ExportsPage() {
  const client = useQueryClient();
  const [type, setType] = useState('STUDENTS_LIST');
  const [format, setFormat] = useState('XLSX');
  const history = useQuery({
    queryKey: ['exports'],
    queryFn: () => api.get<ExportRow[]>('/exports'),
    refetchInterval: 10_000,
  });
  const create = useMutation({
    mutationFn: () =>
      api.post<ExportRow>('/exports', {
        type,
        format,
        filters: {},
        options: { includeTotals: true },
      }),
    onSuccess: (row) => {
      void client.invalidateQueries({ queryKey: ['exports'] });
      if (row.downloadUrl) window.location.assign(row.downloadUrl);
    },
  });
  const download = async (id: string) => {
    const result = await api.get<{ downloadUrl: string }>(`/exports/${id}/download`);
    window.location.assign(result.downloadUrl);
  };
  return (
    <section className="space-y-5">
      <Header
        eyebrow="Documents & données"
        title="Exports & impressions"
        description="PDF officiels, classeurs Excel et CSV UTF-8 compatibles avec Excel Windows."
      />
      <div className="grid gap-4 rounded-2xl border bg-white p-5 md:grid-cols-[1fr_180px_auto]">
        <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
          {[
            'STUDENTS_LIST',
            'STUDENTS_BY_CLASS',
            'PAID_STUDENTS',
            'UNPAID_STUDENTS',
            'STUDENT_FINANCIAL_STATEMENT',
            'PAYMENTS_BY_PERIOD',
            'PAYMENTS_BY_OPERATOR',
            'PAYMENTS_BY_CLASS',
            'RECEIPTS',
            'OUTSTANDING',
          ].map((v) => (
            <option key={v} value={v}>
              {humanLabel(v)}
            </option>
          ))}
        </select>
        <select className="input" value={format} onChange={(e) => setFormat(e.target.value)}>
          {['XLSX', 'PDF', 'CSV'].map((v) => (
            <option key={v} value={v}>
              {humanLabel(v)}
            </option>
          ))}
        </select>
        <button
          className="button-primary"
          disabled={create.isPending}
          onClick={() => create.mutate()}
        >
          Générer
        </button>
      </div>
      {create.error ? <p className="text-sm text-red-700">{create.error.message}</p> : null}
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="p-3">État</th>
              <th>Format</th>
              <th>Date</th>
              <th>Lignes</th>
              <th>Statut</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {history.data?.map((row) => (
              <tr className="border-t" key={row.exportId}>
                <td className="p-3">{humanLabel(row.type)}</td>
                <td>{row.format}</td>
                <td>{new Date(row.requestedAt).toLocaleString('fr-CM')}</td>
                <td>{row.rowCount ?? '—'}</td>
                <td>{humanLabel(row.status)}</td>
                <td>
                  {row.status === 'READY' ? (
                    <button
                      className="font-semibold text-brand-700"
                      onClick={() => void download(row.exportId)}
                    >
                      Télécharger
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
