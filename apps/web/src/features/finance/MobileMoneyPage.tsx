import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
type Investigation = {
  id: string;
  reference: string;
  provider: string | null;
  providerReference: string | null;
  amount: number;
  status: string;
  statusReason: string | null;
  studentName: string | null;
  investigationAt: string | null;
};
type Event = {
  id: string;
  provider: string;
  eventId: string;
  paymentId: string | null;
  status: string;
  signatureValid: boolean | null;
  amount: number | null;
  reason: string | null;
  receivedAt: string;
  processedAt: string | null;
};
const money = (value: number) => `${value.toLocaleString('fr-CM')} FCFA`;
export function MobileMoneyPage() {
  const client = useQueryClient();
  const pending = useQuery({
    queryKey: ['mobile-money-investigations'],
    queryFn: () => api.get<Investigation[]>('/payments/pending-investigation'),
  });
  const events = useQuery({
    queryKey: ['provider-events'],
    queryFn: () => api.get<Event[]>('/admin/provider-events'),
  });
  const check = useMutation({
    mutationFn: (id: string) => api.post(`/payments/${id}/force-check`),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['mobile-money-investigations'] });
      void client.invalidateQueries({ queryKey: ['provider-events'] });
    },
  });
  const reconciliation = useMutation({
    mutationFn: () =>
      api.post<{ checkedAt: string; anomalies: number }>('/admin/reconciliation/mobile-money'),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['provider-events'] }),
  });
  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-brand-700">Contrôle des opérateurs</p>
          <h1 className="text-2xl font-bold">Mobile Money</h1>
          <p className="mt-1 text-sm text-slate-500">
            Investigations, événements signés et rapprochement. Aucune anomalie n’est corrigée
            automatiquement.
          </p>
        </div>
        <button
          className="button-primary"
          disabled={reconciliation.isPending}
          onClick={() => reconciliation.mutate()}
        >
          {reconciliation.isPending ? 'Rapprochement…' : 'Lancer le rapprochement'}
        </button>
      </header>
      {reconciliation.data ? (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          {reconciliation.data.anomalies} anomalie(s) détectée(s) —{' '}
          {new Date(reconciliation.data.checkedAt).toLocaleString('fr-CM')}
        </p>
      ) : null}
      <article className="overflow-hidden rounded-xl border bg-white">
        <header className="border-b bg-slate-50 px-4 py-3">
          <h2 className="font-semibold">Paiements en investigation</h2>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase text-slate-500">
                <th className="p-3">Référence</th>
                <th>Élève</th>
                <th>Opérateur</th>
                <th>Montant</th>
                <th>Motif</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {pending.data?.map((item) => (
                <tr className="border-t" key={item.id}>
                  <td className="p-3 font-mono text-xs">{item.reference}</td>
                  <td>{item.studentName ?? '—'}</td>
                  <td>{item.provider}</td>
                  <td>{money(item.amount)}</td>
                  <td>{item.statusReason ?? 'Statut incertain'}</td>
                  <td>
                    <button
                      className="rounded-lg border px-3 py-2"
                      disabled={check.isPending}
                      onClick={() => check.mutate(item.id)}
                    >
                      Vérifier
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!pending.isLoading && !pending.data?.length ? (
            <p className="p-6 text-center text-slate-500">Aucune investigation ouverte.</p>
          ) : null}
        </div>
      </article>
      <article className="overflow-hidden rounded-xl border bg-white">
        <header className="border-b bg-slate-50 px-4 py-3">
          <h2 className="font-semibold">Événements opérateurs</h2>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase text-slate-500">
                <th className="p-3">Reçu le</th>
                <th>Opérateur</th>
                <th>Événement</th>
                <th>Signature</th>
                <th>Statut</th>
                <th>Montant</th>
              </tr>
            </thead>
            <tbody>
              {events.data?.map((item) => (
                <tr className="border-t" key={item.id}>
                  <td className="p-3">{new Date(item.receivedAt).toLocaleString('fr-CM')}</td>
                  <td>{item.provider}</td>
                  <td className="font-mono text-xs">{item.eventId}</td>
                  <td>
                    {item.signatureValid === null
                      ? '—'
                      : item.signatureValid
                        ? 'Valide'
                        : 'Invalide'}
                  </td>
                  <td>{item.status}</td>
                  <td>{item.amount === null ? '—' : money(item.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
