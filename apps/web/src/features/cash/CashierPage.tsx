import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AllocationPreviewDto, CashSessionDto, PaymentDto } from '@cplan/contracts';
import { api, downloadApiFile } from '@/shared/api/client';

type QuickStudent = {
  studentId: string;
  enrollmentId: string;
  studentNumber: string;
  fullName: string;
  className: string | null;
  guardianPhones: string[];
  balance: { totalDue: number; totalPaid: number; balance: number };
};
const money = (value: number) => `${value.toLocaleString('fr-CM')} FCFA`;
const tenders = ['CASH', 'BANK_TRANSFER', 'BANK_DEPOSIT', 'CHEQUE', 'OTHER'] as const;

export function CashierPage() {
  const client = useQueryClient();
  const searchRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [student, setStudent] = useState<QuickStudent | null>(null);
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<(typeof tenders)[number]>('CASH');
  const [receipt, setReceipt] = useState<PaymentDto | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setTerm(q), 250);
    return () => clearTimeout(timer);
  }, [q]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'F2') {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === 'Escape') {
        setStudent(null);
        setQ('');
        setAmount(0);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const session = useQuery({
    queryKey: ['cash-session'],
    queryFn: () => api.get<CashSessionDto | null>('/cash-sessions/current'),
  });
  const results = useQuery({
    queryKey: ['cash-search', term],
    queryFn: () => api.get<QuickStudent[]>(`/students/quick-search?q=${encodeURIComponent(term)}`),
    enabled: term.length >= 2,
  });
  const preview = useQuery({
    queryKey: ['cash-preview', student?.enrollmentId, amount],
    queryFn: () =>
      api.get<AllocationPreviewDto>(
        `/payments/simulate-allocation?enrollment_id=${student?.enrollmentId}&amount=${amount}`,
      ),
    enabled: Boolean(student && amount > 0),
  });
  const open = useMutation({
    mutationFn: (openingFloat: number) =>
      api.post<CashSessionDto>('/cash-sessions/open', { openingFloat }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['cash-session'] }),
  });
  const collect = useMutation({
    mutationFn: (body: object) =>
      api.post<PaymentDto>('/payments/cash', body, { idempotencyKey: crypto.randomUUID() }),
    onSuccess: (payment) => {
      setReceipt(payment);
      setStudent(null);
      setQ('');
      setAmount(0);
      void client.invalidateQueries({ queryKey: ['cash-session'] });
    },
  });
  const close = useMutation({
    mutationFn: (body: { declaredAmounts: Record<string, number>; varianceReason?: string }) =>
      api.post<CashSessionDto>(`/cash-sessions/${session.data?.id}/close`, body),
    onSuccess: () => client.invalidateQueries({ queryKey: ['cash-session'] }),
  });
  if (session.isLoading) return <p>Chargement de la caisse…</p>;
  if (session.error)
    return (
      <section className="mx-auto max-w-xl rounded-2xl border border-red-200 bg-white p-6 text-center">
        <h1 className="text-xl font-bold">Caisse indisponible</h1>
        <p className="mt-2 text-sm text-red-700">Impossible de récupérer la session de caisse.</p>
        <button className="button-primary mt-4" onClick={() => void session.refetch()}>
          Réessayer
        </button>
      </section>
    );
  if (!session.data)
    return (
      <section className="mx-auto max-w-xl space-y-5">
        <header>
          <p className="text-sm font-medium text-brand-700">Caisse</p>
          <h1 className="text-2xl font-bold">Ouvrir ma session</h1>
          <p className="text-sm text-slate-500">
            Une session ouverte est obligatoire avant tout encaissement.
          </p>
        </header>
        <form
          className="rounded-2xl border bg-white p-6"
          onSubmit={(e) => {
            e.preventDefault();
            open.mutate(Number(new FormData(e.currentTarget).get('float')));
          }}
        >
          <label className="text-sm font-medium">
            Fond de caisse
            <input
              className="input mt-2"
              name="float"
              type="number"
              min="0"
              defaultValue="0"
              autoFocus
            />
          </label>
          {open.error ? <p className="mt-3 text-sm text-red-700">{open.error.message}</p> : null}
          <button className="button-primary mt-4 w-full" disabled={open.isPending}>
            Ouvrir la caisse
          </button>
        </form>
      </section>
    );
  const current = session.data;
  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-brand-700">Caisse</p>
          <h1 className="text-2xl font-bold">Caisse ouverte</h1>
          <p className="text-sm text-slate-500">
            {current.cashierName} · depuis {new Date(current.openedAt).toLocaleString('fr-CM')}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-slate-500">Total encaissé</p>
          <strong className="text-2xl tabular">{money(current.collectedTotal)}</strong>
        </div>
      </header>
      <div className="grid gap-6 xl:grid-cols-[1.4fr_.8fr]">
        <div className="space-y-4 rounded-2xl border bg-white p-5">
          <label className="text-sm font-semibold">
            Rechercher un élève <span className="font-normal text-slate-400">(F2)</span>
            <input
              ref={searchRef}
              className="input mt-2"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setStudent(null);
              }}
              placeholder="Nom, matricule ou téléphone du parent"
              autoFocus
            />
          </label>
          {!student && results.data?.length ? (
            <div className="divide-y rounded-xl border">
              {results.data.map((item) => (
                <button
                  className="flex w-full justify-between p-3 text-left hover:bg-slate-50"
                  key={item.enrollmentId}
                  onClick={() => {
                    setStudent(item);
                    setQ(item.fullName);
                  }}
                >
                  <span>
                    <strong>{item.fullName}</strong>
                    <small className="block text-slate-500">
                      {item.studentNumber} · {item.className ?? 'Non affecté'}
                    </small>
                  </span>
                  <strong className="text-red-700">{money(item.balance.balance)}</strong>
                </button>
              ))}
            </div>
          ) : null}
          {student ? (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                collect.mutate({
                  enrollmentId: student.enrollmentId,
                  amount,
                  paymentMethod: method,
                  externalReference: f.get('reference') || undefined,
                  note: f.get('note') || undefined,
                  confirmOverpayment: amount > student.balance.balance,
                });
              }}
            >
              <div className="grid grid-cols-3 gap-3 rounded-xl bg-slate-50 p-4 text-sm">
                <div>
                  <span className="text-slate-500">Dû</span>
                  <strong className="block">{money(student.balance.totalDue)}</strong>
                </div>
                <div>
                  <span className="text-slate-500">Payé</span>
                  <strong className="block">{money(student.balance.totalPaid)}</strong>
                </div>
                <div>
                  <span className="text-slate-500">Solde</span>
                  <strong className="block text-red-700">{money(student.balance.balance)}</strong>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm">
                  Montant
                  <input
                    className="input mt-1 text-lg font-bold"
                    type="number"
                    min="1"
                    value={amount || ''}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    required
                  />
                </label>
                <label className="text-sm">
                  Mode
                  <select
                    className="input mt-1"
                    value={method}
                    onChange={(e) => setMethod(e.target.value as typeof method)}
                  >
                    {tenders.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
              </div>
              {method !== 'CASH' ? (
                <label className="text-sm">
                  Référence externe
                  <input className="input mt-1" name="reference" required />
                </label>
              ) : null}
              <label className="text-sm">
                Note
                <input className="input mt-1" name="note" />
              </label>
              {preview.data ? (
                <div className="rounded-xl border p-3">
                  <p className="mb-2 text-sm font-semibold">Affectation automatique</p>
                  {preview.data.allocations.map((a) => (
                    <div
                      className="flex justify-between text-sm"
                      key={`${a.studentFeeAssignmentId}-${a.studentFeeInstallmentId}`}
                    >
                      <span>{a.label}</span>
                      <strong>{money(a.amount)}</strong>
                    </div>
                  ))}
                  {preview.data.unallocatedAmount ? (
                    <p className="mt-2 text-sm text-amber-700">
                      Avance non affectée : {money(preview.data.unallocatedAmount)}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {collect.error ? (
                <p className="text-sm text-red-700">{collect.error.message}</p>
              ) : null}
              <button className="button-primary w-full" disabled={collect.isPending || !amount}>
                Valider l’encaissement (Entrée)
              </button>
            </form>
          ) : (
            <p className="rounded-xl border border-dashed p-8 text-center text-slate-500">
              Sélectionnez un élève pour commencer.
            </p>
          )}
        </div>
        <aside className="space-y-4">
          <div className="rounded-2xl border bg-white p-5">
            <h2 className="font-semibold">Derniers encaissements</h2>
            <div className="mt-3 divide-y">
              {current.recentPayments.map((p) => (
                <div className="flex justify-between py-3 text-sm" key={p.id}>
                  <span>
                    {p.studentNames.join(', ')}
                    <small className="block text-slate-500">{p.reference}</small>
                  </span>
                  <strong>{money(p.amount)}</strong>
                </div>
              ))}
            </div>
          </div>
          <details className="rounded-2xl border bg-white p-5">
            <summary className="cursor-pointer font-semibold">Clôturer la session</summary>
            <form
              className="mt-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const declaredAmounts = Object.fromEntries(
                  tenders.map((t) => [t, Number(f.get(t) ?? 0)]),
                );
                const reason = String(f.get('reason') || '');
                close.mutate({ declaredAmounts, ...(reason ? { varianceReason: reason } : {}) });
              }}
            >
              {tenders.map((t) => (
                <label className="block text-sm" key={t}>
                  {t}
                  <input
                    className="input mt-1"
                    name={t}
                    type="number"
                    min="0"
                    defaultValue={
                      t === 'CASH'
                        ? current.openingFloat +
                          current.recentPayments
                            .filter((p) => p.paymentMethod === 'CASH')
                            .reduce((s, p) => s + p.amount, 0)
                        : 0
                    }
                  />
                </label>
              ))}
              <label className="block text-sm">
                Motif d’écart
                <input className="input mt-1" name="reason" />
              </label>
              {close.error ? <p className="text-sm text-red-700">{close.error.message}</p> : null}
              <button className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
                Clôturer
              </button>
            </form>
          </details>
        </aside>
      </div>
      {receipt ? (
        <div className="fixed inset-0 grid place-items-center bg-slate-950/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center">
            <p className="text-emerald-700">✓ Paiement enregistré</p>
            <h2 className="mt-2 text-3xl font-bold">{money(receipt.amount)}</h2>
            <p className="mt-1 font-mono text-sm">{receipt.receiptNumber}</p>
            <div className="mt-5 flex gap-3">
              <button
                className="button-primary flex-1"
                onClick={() =>
                  receipt.receiptId &&
                  downloadApiFile(
                    `/receipts/${receipt.receiptId}/pdf`,
                    `${receipt.receiptNumber}.pdf`,
                  )
                }
              >
                Imprimer le reçu
              </button>
              <button className="rounded-lg border px-4" onClick={() => setReceipt(null)}>
                Suivant
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
