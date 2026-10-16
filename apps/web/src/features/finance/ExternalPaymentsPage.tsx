import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';

type ExternalPayment = {
  id: string;
  paymentId: string;
  reference: string;
  studentName: string;
  className: string | null;
  amount: number;
  creditedAmount: number | null;
  paymentMethod: string;
  bankName: string | null;
  paymentDate: string;
  externalReference: string;
  notes: string | null;
  status: string;
  rejectionReason: string | null;
  correctionMessage: string | null;
  duplicateWarning: boolean;
  overdue: boolean;
  submittedAt: string;
  proofs: Array<{ id: string; filename: string | null }>;
};
const money = (value: number) => `${value.toLocaleString('fr-CM')} FCFA`;
const labels: Record<string, string> = {
  AWAITING_VALIDATION: 'À valider',
  CORRECTION_REQUESTED: 'Correction demandée',
  VALIDATED: 'Validé',
  REJECTED: 'Rejeté',
  CANCELLED: 'Annulé',
};

export function ExternalPaymentsPage() {
  const client = useQueryClient();
  const [status, setStatus] = useState('');
  const [overdue, setOverdue] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creditedAmount, setCreditedAmount] = useState('');
  const [valueDate, setValueDate] = useState('');
  const [message, setMessage] = useState('');
  const query = useQuery({
    queryKey: ['external-payments', status, overdue],
    queryFn: () =>
      api.get<ExternalPayment[]>(
        `/external-payments?${new URLSearchParams({ ...(status && { status }), ...(overdue && { overdue: 'true' }) })}`,
      ),
  });
  const selected = useMemo(
    () => query.data?.find((item) => item.id === selectedId) ?? null,
    [query.data, selectedId],
  );
  const refresh = () => void client.invalidateQueries({ queryKey: ['external-payments'] });
  const validate = useMutation({
    mutationFn: (item: ExternalPayment) =>
      api.post(`/external-payments/${item.id}/validate`, {
        ...(creditedAmount ? { creditedAmount: Number(creditedAmount) } : {}),
        ...(valueDate ? { valueDate } : {}),
        ...(message ? { internalNote: message } : {}),
      }),
    onSuccess: () => {
      refresh();
      setSelectedId(null);
    },
  });
  const reject = useMutation({
    mutationFn: (item: ExternalPayment) =>
      api.post(`/external-payments/${item.id}/reject`, { reason: message }),
    onSuccess: () => {
      refresh();
      setSelectedId(null);
    },
  });
  const correction = useMutation({
    mutationFn: (item: ExternalPayment) =>
      api.post(`/external-payments/${item.id}/request-correction`, { message }),
    onSuccess: () => {
      refresh();
      setSelectedId(null);
    },
  });
  const openProof = async (item: ExternalPayment) => {
    const result = await api.get<{ proofs: Array<{ url: string }> }>(
      `/external-payments/${item.id}/proof`,
    );
    if (result.proofs[0]) window.open(result.proofs[0].url, '_blank', 'noopener,noreferrer');
  };
  const pending =
    query.data?.filter((item) =>
      ['AWAITING_VALIDATION', 'CORRECTION_REQUESTED'].includes(item.status),
    ).length ?? 0;
  return (
    <section className="space-y-6">
      <header>
        <p className="text-sm font-medium text-brand-700">Contrôle comptable</p>
        <h1 className="text-2xl font-bold">Paiements externes</h1>
        <p className="mt-1 text-sm text-slate-500">
          {pending} déclaration(s) en attente. Le solde n’est crédité qu’après validation.
        </p>
      </header>
      <div className="grid gap-3 rounded-xl border bg-white p-4 md:grid-cols-[1fr_auto]">
        <select
          className="input"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">Tous les statuts</option>
          {Object.entries(labels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={overdue}
            onChange={(event) => setOverdue(event.target.checked)}
          />
          Uniquement hors SLA
        </label>
      </div>
      <div className="overflow-hidden rounded-xl border bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="p-3">Déclaration</th>
                <th>Élève</th>
                <th>Montant</th>
                <th>Référence externe</th>
                <th>Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {query.data?.map((item) => (
                <tr key={item.id} className={`border-t ${item.overdue ? 'bg-amber-50' : ''}`}>
                  <td className="p-3">
                    <b>{item.reference}</b>
                    <br />
                    <span className="text-xs text-slate-500">
                      {new Date(item.submittedAt).toLocaleString('fr-CM')}
                    </span>
                  </td>
                  <td>
                    {item.studentName}
                    <br />
                    <span className="text-xs text-slate-500">
                      {item.className ?? 'Sans classe'}
                    </span>
                  </td>
                  <td>{money(item.amount)}</td>
                  <td>
                    {item.externalReference}
                    {item.duplicateWarning ? (
                      <span className="ml-2 rounded bg-amber-200 px-2 py-1 text-xs">
                        Doublon possible
                      </span>
                    ) : null}
                  </td>
                  <td>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs">
                      {labels[item.status] ?? item.status}
                    </span>
                  </td>
                  <td>
                    <button
                      className="rounded-lg border px-3 py-2"
                      onClick={() => {
                        setSelectedId(item.id);
                        setCreditedAmount(String(item.amount));
                        setValueDate(item.paymentDate);
                        setMessage('');
                      }}
                    >
                      Examiner
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!query.isLoading && !query.data?.length ? (
            <p className="p-8 text-center text-slate-500">Aucune déclaration.</p>
          ) : null}
        </div>
      </div>
      {selected ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex justify-between">
              <div>
                <p className="text-sm text-brand-700">{selected.reference}</p>
                <h2 className="text-xl font-bold">{selected.studentName}</h2>
              </div>
              <button aria-label="Fermer" onClick={() => setSelectedId(null)}>
                ✕
              </button>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl bg-slate-50 p-4 text-sm">
                <p>
                  Déclaré : <b>{money(selected.amount)}</b>
                </p>
                <p>Date : {new Date(selected.paymentDate).toLocaleDateString('fr-CM')}</p>
                <p>Banque : {selected.bankName ?? '—'}</p>
                <p>Référence : {selected.externalReference}</p>
                <button
                  className="mt-3 text-brand-700 underline"
                  onClick={() => void openProof(selected)}
                >
                  Ouvrir le justificatif privé
                </button>
              </div>
              <div className="space-y-3">
                <label className="block text-sm font-medium">
                  Montant crédité
                  <input
                    className="input mt-1"
                    type="number"
                    min="1"
                    value={creditedAmount}
                    onChange={(event) => setCreditedAmount(event.target.value)}
                  />
                </label>
                <label className="block text-sm font-medium">
                  Date de valeur
                  <input
                    className="input mt-1"
                    type="date"
                    value={valueDate}
                    onChange={(event) => setValueDate(event.target.value)}
                  />
                </label>
                <label className="block text-sm font-medium">
                  Note / motif
                  <textarea
                    className="input mt-1 min-h-24"
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="Obligatoire pour un rejet ou une correction"
                  />
                </label>
              </div>
            </div>
            {['AWAITING_VALIDATION', 'CORRECTION_REQUESTED'].includes(selected.status) ? (
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button
                  className="rounded-lg border px-4 py-2"
                  disabled={message.trim().length < 3 || correction.isPending}
                  onClick={() => correction.mutate(selected)}
                >
                  Demander correction
                </button>
                <button
                  className="rounded-lg border border-red-300 px-4 py-2 text-red-700"
                  disabled={message.trim().length < 3 || reject.isPending}
                  onClick={() => reject.mutate(selected)}
                >
                  Rejeter
                </button>
                <button
                  className="button-primary"
                  disabled={!creditedAmount || validate.isPending}
                  onClick={() => validate.mutate(selected)}
                >
                  Valider et créditer
                </button>
              </div>
            ) : (
              <p className="mt-5 rounded-lg bg-slate-50 p-3">
                Cette déclaration a déjà été traitée.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
