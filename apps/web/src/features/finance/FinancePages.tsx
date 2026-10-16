import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BalanceDto,
  FeeStructureDto,
  FeeTypeDto,
  GradeLevelDto,
  PaymentDto,
  StudentFeeDto,
} from '@cplan/contracts';
import { api, downloadApiFile } from '@/shared/api/client';
import { humanLabel } from '@/shared/ui/format';
import { useAcademicYear } from '@/features/academic/use-academic-year';

const money = (value: number) => `${value.toLocaleString('fr-CM')} FCFA`;
const badge = (status: string) =>
  status === 'SUCCESS' || status === 'PAID'
    ? 'bg-emerald-50 text-emerald-700'
    : status === 'REVERSED' || status === 'FAILED'
      ? 'bg-red-50 text-red-700'
      : 'bg-amber-50 text-amber-800';

export function FeeStructuresPage() {
  const year = useAcademicYear();
  const client = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const yearId = year.selectedYear?.id;
  const types = useQuery({
    queryKey: ['fee-types'],
    queryFn: () => api.get<FeeTypeDto[]>('/fee-types'),
  });
  const levels = useQuery({
    queryKey: ['grade-levels'],
    queryFn: () => api.get<GradeLevelDto[]>('/grade-levels'),
  });
  const structures = useQuery({
    queryKey: ['fee-structures', yearId],
    queryFn: () => api.get<FeeStructureDto[]>(`/fee-structures?academic_year_id=${yearId}`),
    enabled: Boolean(yearId),
  });
  const grouped = useMemo(
    () =>
      Object.entries(
        (structures.data ?? []).reduce<Record<string, FeeStructureDto[]>>((groups, item) => {
          (groups[item.feeTypeName] ??= []).push(item);
          return groups;
        }, {}),
      ),
    [structures.data],
  );
  const create = useMutation({
    mutationFn: (body: unknown) => api.post<FeeStructureDto>('/fee-structures', body),
    onSuccess: () => {
      setShowForm(false);
      void client.invalidateQueries({ queryKey: ['fee-structures'] });
    },
  });
  const status = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'activate' | 'deactivate' }) =>
      api.post(`/fee-structures/${id}/${action}`),
    onSuccess: () => client.invalidateQueries({ queryKey: ['fee-structures'] }),
  });
  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-brand-700">Configuration financière</p>
          <h1 className="text-2xl font-bold">Frais scolaires</h1>
          <p className="mt-1 text-sm text-slate-500">
            Tarifs applicables pour {year.selectedYear?.name ?? 'l’année sélectionnée'}.
          </p>
        </div>
        <button className="button-primary" onClick={() => setShowForm((value) => !value)}>
          + Créer un frais
        </button>
      </header>
      {showForm && yearId ? (
        <form
          className="grid gap-4 rounded-2xl border bg-white p-5 shadow-sm md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const installments = [1, 2, 3]
              .map((index) => ({
                name: String(form.get(`i${index}Name`) ?? ''),
                amount: Number(form.get(`i${index}Amount`) ?? 0),
                dueDate: String(form.get(`i${index}Date`) ?? ''),
                orderIndex: index - 1,
              }))
              .filter((item) => item.name && item.amount && item.dueDate);
            create.mutate({
              academicYearId: yearId,
              feeTypeId: form.get('feeTypeId'),
              gradeLevelId: form.get('gradeLevelId') || null,
              name: form.get('name'),
              amount: Number(form.get('amount')),
              isMandatory: form.get('mandatory') === 'on',
              allowPartialPayment: form.get('partial') === 'on',
              allowFullPayment: true,
              allowFreeAmount: true,
              enforceInstallmentOrder: form.get('strict') === 'on',
              opensAt: form.get('opensAt') || null,
              dueDate: form.get('dueDate') || null,
              installments,
            });
          }}
        >
          <div className="md:col-span-2">
            <h2 className="font-semibold">Nouvelle structure tarifaire</h2>
            <p className="text-sm text-slate-500">
              Le total des tranches doit correspondre exactement au montant.
            </p>
          </div>
          <label className="text-sm">
            Type de frais
            <select className="input mt-1" name="feeTypeId" required>
              {types.data?.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Nom
            <input className="input mt-1" name="name" placeholder="Pension 6e" required />
          </label>
          <label className="text-sm">
            Montant
            <input className="input mt-1" name="amount" type="number" min="1" required />
          </label>
          <label className="text-sm">
            Niveau
            <select className="input mt-1" name="gradeLevelId">
              <option value="">Tous les niveaux</option>
              {levels.data?.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Ouverture
            <input className="input mt-1" name="opensAt" type="date" />
          </label>
          <label className="text-sm">
            Échéance globale
            <input className="input mt-1" name="dueDate" type="date" />
          </label>
          <div className="space-y-2 md:col-span-2">
            <p className="text-sm font-semibold">Tranches (facultatives)</p>
            {[1, 2, 3].map((index) => (
              <div className="grid gap-2 sm:grid-cols-3" key={index}>
                <input className="input" name={`i${index}Name`} placeholder={`Tranche ${index}`} />
                <input
                  className="input"
                  name={`i${index}Amount`}
                  type="number"
                  min="0"
                  placeholder="Montant"
                />
                <input className="input" name={`i${index}Date`} type="date" />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-4 text-sm md:col-span-2">
            <label>
              <input name="mandatory" type="checkbox" defaultChecked /> Frais obligatoire
            </label>
            <label>
              <input name="partial" type="checkbox" defaultChecked /> Paiement partiel
            </label>
            <label>
              <input name="strict" type="checkbox" /> Ordre strict des tranches
            </label>
          </div>
          {create.error ? (
            <p className="text-sm text-red-700 md:col-span-2">{create.error.message}</p>
          ) : null}
          <button className="button-primary md:col-span-2" disabled={create.isPending}>
            Créer la structure
          </button>
        </form>
      ) : null}
      {grouped.map(([type, items]) => (
        <article className="overflow-hidden rounded-2xl border bg-white" key={type}>
          <header className="flex justify-between bg-slate-50 px-5 py-3">
            <h2 className="font-semibold uppercase tracking-wide">{type}</h2>
            <span className="text-sm text-slate-500">{items?.length ?? 0} structure(s)</span>
          </header>
          <div className="divide-y">
            {items?.map((item) => (
              <div
                className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center"
                key={item.id}
              >
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className="text-xs text-slate-500">
                    {item.installments.length
                      ? `${item.installments.length} tranches`
                      : 'Paiement libre'}{' '}
                    · montant figé à l’affectation
                  </p>
                </div>
                <strong className="tabular">{money(item.amount)}</strong>
                <span className={`rounded-full px-2 py-1 text-xs ${badge(item.status)}`}>
                  {humanLabel(item.status)}
                </span>
                <button
                  className="rounded-lg border px-3 py-2 text-sm"
                  disabled={status.isPending}
                  onClick={() =>
                    status.mutate({
                      id: item.id,
                      action: item.status === 'ACTIVE' ? 'deactivate' : 'activate',
                    })
                  }
                >
                  {item.status === 'ACTIVE' ? 'Désactiver' : 'Activer'}
                </button>
              </div>
            ))}
          </div>
        </article>
      ))}
      {!structures.isLoading && !structures.data?.length ? (
        <p className="rounded-xl border border-dashed bg-white p-8 text-center text-slate-500">
          Aucune structure pour cette année.
        </p>
      ) : null}
    </section>
  );
}

interface PaymentPage {
  data: PaymentDto[];
  meta: { page: number; total: number; total_pages: number };
}
export function PaymentsPage() {
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const payments = useQuery({
    queryKey: ['payments', status],
    queryFn: () =>
      api.get<PaymentPage>(`/payments?page_size=50${status ? `&status=${status}` : ''}`),
  });
  const detail = useQuery({
    queryKey: ['payment', selected],
    queryFn: () =>
      api.get<
        PaymentDto & {
          allocations: Array<{ id: string; label: string; amount: number; studentName: string }>;
        }
      >(`/payments/${selected}`),
    enabled: Boolean(selected),
  });
  const total = payments.data?.data.reduce((sum, item) => sum + item.amount, 0) ?? 0;
  return (
    <section className="space-y-5">
      <header>
        <p className="text-sm font-medium text-brand-700">Registre financier</p>
        <h1 className="text-2xl font-bold">Paiements</h1>
        <p className="mt-1 text-sm text-slate-500">
          Total affiché : <strong className="tabular text-slate-900">{money(total)}</strong>
        </p>
      </header>
      <div className="flex gap-3 rounded-xl border bg-white p-4">
        <select
          aria-label="Filtrer par statut"
          className="input max-w-64"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">Tous les statuts</option>
          {['PENDING', 'AWAITING_VALIDATION', 'SUCCESS', 'FAILED', 'REVERSED'].map((item) => (
            <option key={item} value={item}>
              {humanLabel(item)}
            </option>
          ))}
        </select>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="p-3">Référence</th>
              <th>Élève</th>
              <th>Montant</th>
              <th>Moyen</th>
              <th>Date</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {payments.data?.data.map((item) => (
              <tr
                className="cursor-pointer border-t hover:bg-slate-50"
                key={item.id}
                onClick={() => setSelected(item.id)}
              >
                <td className="p-3 font-mono text-xs">{item.reference}</td>
                <td>{item.studentNames.join(', ') || 'À affecter'}</td>
                <td className={`tabular font-semibold ${item.amount < 0 ? 'text-red-700' : ''}`}>
                  {money(item.amount)}
                </td>
                <td>{humanLabel(item.paymentMethod)}</td>
                <td>{item.paidAt ? new Date(item.paidAt).toLocaleDateString('fr-CM') : '—'}</td>
                <td>
                  <span className={`rounded-full px-2 py-1 text-xs ${badge(item.status)}`}>
                    {humanLabel(item.status)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected && detail.data ? (
        <aside className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex justify-between">
            <div>
              <p className="font-mono text-sm">{detail.data.reference}</p>
              <h2 className="mt-1 text-xl font-bold">{money(detail.data.amount)}</h2>
            </div>
            <button aria-label="Fermer le détail" onClick={() => setSelected(null)}>
              ✕
            </button>
          </div>
          <div className="mt-5 space-y-2">
            {detail.data.allocations.map((item) => (
              <div className="flex justify-between border-b py-2" key={item.id}>
                <span>
                  {item.studentName} · {item.label}
                </span>
                <strong>{money(item.amount)}</strong>
              </div>
            ))}
          </div>
          {detail.data.receiptId ? (
            <button
              className="button-primary mt-5"
              onClick={() =>
                void downloadApiFile(
                  `/receipts/${detail.data?.receiptId}/pdf`,
                  `${detail.data?.receiptNumber}.pdf`,
                )
              }
            >
              Télécharger le reçu
            </button>
          ) : null}
        </aside>
      ) : null}
    </section>
  );
}

type StudentStatement = {
  balance: { totalDue: number; totalPaid: number; balance: number };
  fees: Array<{ id: string; name: string; status: string }>;
  payments: Array<{
    id: string;
    reference: string;
    amount: number;
    method: string;
    status: string;
    paidAt: string | null;
    receiptId: string | null;
  }>;
};

export function StudentFinancialOverview({ enrollmentId }: { enrollmentId: string }) {
  const statement = useQuery({
    queryKey: ['student-statement', enrollmentId],
    queryFn: () => api.get<StudentStatement>(`/enrollments/${enrollmentId}/statement`),
  });
  if (statement.isPending)
    return (
      <div className="rounded-xl border bg-white p-5 text-sm text-slate-500">
        Chargement de la situation financière…
      </div>
    );
  if (!statement.data) return null;
  const { balance, fees, payments } = statement.data;
  const state =
    fees.length === 0
      ? {
          label: 'Aucun frais affecté',
          detail: 'La situation financière commencera après l’affectation des frais.',
          tone: 'bg-slate-100 text-slate-700',
        }
      : balance.totalPaid === 0
        ? {
            label: 'Paiement non commencé',
            detail: `${money(balance.totalDue)} restent à régler.`,
            tone: 'bg-amber-50 text-amber-800',
          }
        : balance.balance <= 0
          ? {
              label: 'Scolarité réglée',
              detail: 'Tous les frais affectés sont intégralement payés.',
              tone: 'bg-emerald-50 text-emerald-800',
            }
          : {
              label: 'Paiement commencé',
              detail: `${money(balance.totalPaid)} déjà versés sur ${money(balance.totalDue)}.`,
              tone: 'bg-brand-50 text-brand-800',
            };
  return (
    <article className="overflow-hidden rounded-xl border bg-white">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Situation financière actuelle
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className={`rounded-full px-3 py-1 text-sm font-semibold ${state.tone}`}>
              {state.label}
            </span>
            <p className="text-sm text-slate-600">{state.detail}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-5 text-right">
          <div>
            <span className="block text-xs text-slate-500">Dû</span>
            <strong className="tabular">{money(balance.totalDue)}</strong>
          </div>
          <div>
            <span className="block text-xs text-slate-500">Payé</span>
            <strong className="tabular text-emerald-700">{money(balance.totalPaid)}</strong>
          </div>
          <div>
            <span className="block text-xs text-slate-500">Reste</span>
            <strong className="tabular text-amber-800">{money(balance.balance)}</strong>
          </div>
        </div>
      </div>
      <div className="p-5">
        <h2 className="text-sm font-semibold">Derniers mouvements</h2>
        {payments.length ? (
          <div className="mt-3 grid gap-2 lg:grid-cols-3">
            {payments.slice(0, 3).map((payment) => (
              <div key={payment.id} className="rounded-lg bg-slate-50 p-3">
                <div className="flex justify-between gap-2">
                  <span className="font-mono text-xs text-slate-500">{payment.reference}</span>
                  <strong className="text-sm tabular">{money(payment.amount)}</strong>
                </div>
                <p className="mt-2 text-xs text-slate-600">
                  {humanLabel(payment.method)} · {humanLabel(payment.status)}
                </p>
                <time className="text-xs text-slate-500">
                  {payment.paidAt
                    ? new Date(payment.paidAt).toLocaleString('fr-CM')
                    : 'Date non disponible'}
                </time>
                {payment.receiptId ? (
                  <button
                    className="mt-2 block text-xs font-semibold text-brand-700"
                    onClick={() =>
                      void downloadApiFile(
                        `/receipts/${payment.receiptId}/pdf`,
                        `recu-${payment.reference}.pdf`,
                      )
                    }
                  >
                    Télécharger le reçu
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 rounded-lg border border-dashed p-4 text-sm text-slate-500">
            Aucun paiement enregistré dans l’historique de cette inscription.
          </p>
        )}
      </div>
    </article>
  );
}

export function StudentFinancePanel({ enrollmentId }: { enrollmentId: string }) {
  const fees = useQuery({
    queryKey: ['enrollment-fees', enrollmentId],
    queryFn: () => api.get<StudentFeeDto[]>(`/enrollments/${enrollmentId}/fees`),
  });
  const balance = useQuery({
    queryKey: ['enrollment-balance', enrollmentId],
    queryFn: () => api.get<BalanceDto>(`/enrollments/${enrollmentId}/balance`),
  });
  return (
    <div className="space-y-4">
      {balance.data ? (
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            ['Total dû', balance.data.totalDue],
            ['Payé', balance.data.totalPaid],
            ['Remises', balance.data.totalDiscount],
            ['Solde', balance.data.balance],
          ].map(([label, value]) => (
            <div className="rounded-xl border bg-white p-4" key={String(label)}>
              <p className="text-xs uppercase text-slate-500">{label}</p>
              <strong className="mt-1 block text-lg tabular">{money(Number(value))}</strong>
            </div>
          ))}
        </div>
      ) : null}
      <div className="space-y-2">
        {fees.data?.map((fee) => (
          <article className="rounded-xl border bg-white p-4" key={fee.id}>
            <div className="flex justify-between gap-3">
              <div>
                <h3 className="font-semibold">{fee.feeTypeName}</h3>
                <p className="text-sm text-slate-500">{fee.structureName}</p>
              </div>
              <div className="text-right">
                <strong>{money(fee.finalAmount)}</strong>
                <p className="text-xs text-slate-500">Payé {money(fee.paidAmount)}</p>
              </div>
            </div>
            {fee.installments.length ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {fee.installments.map((item) => (
                  <div className="rounded-lg bg-slate-50 p-3 text-sm" key={item.id}>
                    <p>
                      {item.name} · {item.dueDate}
                    </p>
                    <strong>
                      {money(item.paidAmount)} / {money(item.amount)}
                    </strong>
                  </div>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}

export function StudentPaymentsPanel({ studentId }: { studentId: string }) {
  const payments = useQuery({
    queryKey: ['student-payments', studentId],
    queryFn: () => api.get<PaymentPage>(`/payments?student_id=${studentId}&page_size=50`),
  });
  return (
    <div className="space-y-2">
      {payments.data?.data.map((item) => (
        <div
          className="flex flex-wrap justify-between gap-3 rounded-xl border bg-white p-4"
          key={item.id}
        >
          <div>
            <p className="font-mono text-xs">{item.reference}</p>
            <p className="text-sm text-slate-500">
              {item.paidAt
                ? new Date(item.paidAt).toLocaleString('fr-CM')
                : humanLabel(item.status)}
            </p>
          </div>
          <div className="text-right">
            <strong>{money(item.amount)}</strong>
            <p className="text-xs">
              {humanLabel(item.paymentMethod)} · {humanLabel(item.status)}
            </p>
            {item.receiptId ? (
              <button
                className="mt-2 text-xs font-semibold text-brand-700"
                onClick={() =>
                  void downloadApiFile(
                    `/receipts/${item.receiptId}/pdf`,
                    `recu-${item.reference}.pdf`,
                  )
                }
              >
                Télécharger le reçu
              </button>
            ) : null}
          </div>
        </div>
      ))}
      {!payments.isLoading && !payments.data?.data.length ? (
        <p className="rounded-xl border border-dashed bg-white p-8 text-center text-slate-500">
          Aucun paiement n’a encore été enregistré pour cet élève.
        </p>
      ) : null}
    </div>
  );
}
