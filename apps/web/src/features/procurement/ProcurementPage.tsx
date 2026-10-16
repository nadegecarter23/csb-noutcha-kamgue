import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ExpenseDto, ProcurementOverviewDto, SupplierDto } from '@cplan/contracts';
import { api, apiUpload } from '@/shared/api/client';
import { useAuthStore } from '@/features/auth/auth-store';

type Tab = 'overview' | 'expenses' | 'purchases' | 'suppliers';
type Modal = 'supplier' | 'category' | 'purchase' | 'expense' | 'payment' | null;
type PurchaseLine = { description: string; quantity: number; unitPrice: number };
const money = (value: number) =>
  new Intl.NumberFormat('fr-CM', {
    style: 'currency',
    currency: 'XAF',
    maximumFractionDigits: 0,
  }).format(value);
const dateLabel = (value: string | null) =>
  value ? new Intl.DateTimeFormat('fr-CM').format(new Date(`${value}T00:00:00`)) : '—';
const statusLabels: Record<string, string> = {
  DRAFT: 'Brouillon',
  SUBMITTED: 'À approuver',
  APPROVED: 'Approuvé',
  REJECTED: 'Rejeté',
  ORDERED: 'Commandé',
  PARTIALLY_RECEIVED: 'Réception partielle',
  RECEIVED: 'Réceptionné',
  PARTIALLY_PAID: 'Partiellement payé',
  PAID: 'Payé',
  CANCELLED: 'Annulé',
  ACTIVE: 'Actif',
  INACTIVE: 'Inactif',
};

export function ProcurementPage() {
  const client = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<Tab>('overview');
  const [modal, setModal] = useState<Modal>(null);
  const [selectedExpense, setSelectedExpense] = useState<ExpenseDto | null>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<SupplierDto | null>(null);
  const [query, setQuery] = useState('');
  const [lines, setLines] = useState<PurchaseLine[]>([
    { description: '', quantity: 1, unitPrice: 0 },
  ]);
  const overview = useQuery({
    queryKey: ['procurement'],
    queryFn: () => api.get<ProcurementOverviewDto>('/procurement/overview'),
  });
  const refresh = () => void client.invalidateQueries({ queryKey: ['procurement'] });
  const mutation = useMutation({
    mutationFn: ({
      path,
      body,
      key,
      method = 'post',
    }: {
      path: string;
      body?: unknown;
      key?: string;
      method?: 'post' | 'patch';
    }) =>
      method === 'patch'
        ? api.patch(path, body)
        : api.post(path, body, key ? { idempotencyKey: key } : undefined),
    onSuccess: () => {
      setModal(null);
      setSelectedExpense(null);
      setSelectedSupplier(null);
      refresh();
    },
  });
  const permissions = new Set(user?.permissions ?? []);
  const can = (permission: string) => permissions.has(permission);
  const filteredExpenses = useMemo(
    () =>
      overview.data?.expenses.filter((x) =>
        `${x.reference} ${x.supplierName} ${x.invoiceNumber ?? ''} ${x.description}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ) ?? [],
    [overview.data, query],
  );
  const filteredPurchases = useMemo(
    () =>
      overview.data?.purchaseOrders.filter((x) =>
        `${x.reference} ${x.supplierName}`.toLowerCase().includes(query.toLowerCase()),
      ) ?? [],
    [overview.data, query],
  );
  const act = (path: string, body?: unknown) => mutation.mutate({ path, body });
  const reject = (path: string) => {
    const reason = window.prompt('Motif du rejet (obligatoire)');
    if (reason?.trim()) act(path, { decision: 'REJECT', reason: reason.trim() });
  };
  const openDocument = async (id: string) => {
    const result = await api.get<{ url: string }>(`/expenses/${id}/document`);
    window.open(result.url, '_blank', 'noopener,noreferrer');
  };
  const submitForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const f = new FormData(form);
    if (modal === 'supplier')
      mutation.mutate({
        path: selectedSupplier ? `/suppliers/${selectedSupplier.id}` : '/suppliers',
        method: selectedSupplier ? 'patch' : 'post',
        body: {
          code: String(f.get('code')),
          name: String(f.get('name')),
          taxId: String(f.get('taxId')) || null,
          phone: String(f.get('phone')) || null,
          email: String(f.get('email')) || null,
          address: String(f.get('address')) || null,
          paymentTermsDays: Number(f.get('terms')),
          ...(selectedSupplier ? { status: String(f.get('status')) } : {}),
        },
      });
    if (modal === 'category')
      mutation.mutate({
        path: '/expense-categories',
        body: {
          code: String(f.get('code')),
          name: String(f.get('name')),
          description: String(f.get('description')) || null,
        },
      });
    if (modal === 'purchase')
      mutation.mutate({
        path: '/purchase-orders',
        body: {
          supplierId: String(f.get('supplierId')),
          expectedDate: String(f.get('expectedDate')) || null,
          notes: String(f.get('notes')) || null,
          lines: lines.filter((x) => x.description.trim() && x.quantity > 0 && x.unitPrice > 0),
        },
      });
    if (modal === 'expense') {
      let attachmentFileId: string | null = null;
      const file = f.get('attachment');
      if (file instanceof File && file.size) {
        const upload = new FormData();
        upload.append('file', file);
        attachmentFileId = (await apiUpload<{ id: string }>('/expense-documents', upload)).id;
      }
      mutation.mutate({
        path: '/expenses',
        body: {
          supplierId: String(f.get('supplierId')),
          categoryId: String(f.get('categoryId')),
          purchaseOrderId: String(f.get('purchaseOrderId')) || null,
          invoiceNumber: String(f.get('invoiceNumber')) || null,
          invoiceDate: String(f.get('invoiceDate')),
          dueDate: String(f.get('dueDate')),
          description: String(f.get('description')),
          amount: Number(f.get('amount')),
          attachmentFileId,
        },
      });
    }
    if (modal === 'payment' && selectedExpense) {
      const method = String(f.get('method'));
      mutation.mutate({
        path: `/expenses/${selectedExpense.id}/pay`,
        key: crypto.randomUUID(),
        body: {
          amount: Number(f.get('amount')),
          method,
          externalReference: String(f.get('externalReference')) || null,
          paidAt: new Date(String(f.get('paidAt'))).toISOString(),
          note: String(f.get('note')) || null,
        },
      });
    }
  };
  if (overview.isLoading)
    return <div className="procurement-loading">Chargement des achats et dépenses…</div>;
  if (overview.isError)
    return (
      <div className="procurement-error">
        <strong>Le module n’a pas pu être chargé.</strong>
        <button onClick={() => void overview.refetch()}>Réessayer</button>
      </div>
    );
  const data = overview.data;
  if (!data) return null;
  return (
    <section className="procurement-page">
      <header className="procurement-hero">
        <div>
          <span className="eyebrow">Gestion financière</span>
          <h1>Dépenses, achats & fournisseurs</h1>
          <p>De la demande d’achat au règlement fournisseur, avec validation et traçabilité.</p>
        </div>
        <div className="hero-actions">
          {can('suppliers.manage') ? (
            <button className="button-secondary" onClick={() => setModal('supplier')}>
              Nouveau fournisseur
            </button>
          ) : null}
          {can('expenses.create') ? (
            <button className="button-primary" onClick={() => setModal('expense')}>
              + Saisir une dépense
            </button>
          ) : null}
        </div>
      </header>
      <nav className="procurement-tabs" aria-label="Sections du module">
        {(
          [
            ['overview', 'Vue d’ensemble'],
            ['expenses', 'Dépenses'],
            ['purchases', 'Achats'],
            ['suppliers', 'Fournisseurs'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            {label}
            {id === 'expenses' ? (
              <span>{data.expenses.length}</span>
            ) : id === 'purchases' ? (
              <span>{data.purchaseOrders.length}</span>
            ) : null}
          </button>
        ))}
      </nav>
      {tab === 'overview' ? (
        <>
          <div className="procurement-kpis">
            <article>
              <span>À approuver</span>
              <strong>{data.summary.pendingApprovalCount}</strong>
              <small>bons et dépenses</small>
            </article>
            <article>
              <span>À payer</span>
              <strong>{money(data.summary.payableAmount)}</strong>
              <small>dettes fournisseurs</small>
            </article>
            <article className={data.summary.overdueAmount ? 'alert' : ''}>
              <span>En retard</span>
              <strong>{money(data.summary.overdueAmount)}</strong>
              <small>échéances dépassées</small>
            </article>
            <article>
              <span>Payé ce mois</span>
              <strong>{money(data.summary.paidThisMonth)}</strong>
              <small>règlements enregistrés</small>
            </article>
          </div>
          <div className="procurement-dashboard-grid">
            <div className="procurement-panel">
              <div className="panel-title">
                <div>
                  <span>À traiter</span>
                  <h2>File d’approbation</h2>
                </div>
                <button onClick={() => setTab('expenses')}>Tout voir</button>
              </div>
              {data.expenses
                .filter((x) => x.status === 'SUBMITTED')
                .slice(0, 4)
                .map((x) => (
                  <ExpenseRow
                    key={x.id}
                    expense={x}
                    compact
                    actions={
                      can('expenses.approve') ? (
                        <>
                          <button
                            onClick={() =>
                              act(`/expenses/${x.id}/decision`, { decision: 'APPROVE' })
                            }
                          >
                            Approuver
                          </button>
                          <button
                            className="danger"
                            onClick={() => reject(`/expenses/${x.id}/decision`)}
                          >
                            Rejeter
                          </button>
                        </>
                      ) : null
                    }
                  />
                ))}
              {!data.expenses.some((x) => x.status === 'SUBMITTED') ? (
                <p className="empty-state">Aucune dépense en attente.</p>
              ) : null}
            </div>
            <div className="procurement-panel">
              <div className="panel-title">
                <div>
                  <span>Échéances</span>
                  <h2>Prochains paiements</h2>
                </div>
                <button onClick={() => setTab('expenses')}>Échéancier</button>
              </div>
              {data.expenses
                .filter((x) => ['APPROVED', 'PARTIALLY_PAID'].includes(x.status))
                .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
                .slice(0, 4)
                .map((x) => (
                  <div className="due-row" key={x.id}>
                    <div>
                      <strong>{x.supplierName}</strong>
                      <span>
                        {x.reference} · échéance {dateLabel(x.dueDate)}
                      </span>
                    </div>
                    <b>{money(x.balance)}</b>
                  </div>
                ))}
            </div>
          </div>
        </>
      ) : null}
      {tab !== 'overview' ? (
        <div className="procurement-toolbar">
          <label>
            <span>Rechercher</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Référence, fournisseur, facture…"
            />
          </label>
          {tab === 'purchases' && can('purchases.create') ? (
            <button
              className="button-primary"
              onClick={() => {
                setLines([{ description: '', quantity: 1, unitPrice: 0 }]);
                setModal('purchase');
              }}
            >
              + Bon d’achat
            </button>
          ) : null}
          {tab === 'suppliers' && can('expenses.create') ? (
            <button className="button-secondary" onClick={() => setModal('category')}>
              Nouvelle catégorie
            </button>
          ) : null}
        </div>
      ) : null}
      {tab === 'expenses' ? (
        <div className="procurement-table">
          <div className="table-head">
            <span>Dépense</span>
            <span>Échéance</span>
            <span>Montant</span>
            <span>Solde</span>
            <span>Statut</span>
            <span>Actions</span>
          </div>
          {filteredExpenses.map((expense) => (
            <ExpenseRow
              key={expense.id}
              expense={expense}
              actions={
                <>
                  {expense.attachmentFileId && can('expenses.read') ? (
                    <button onClick={() => void openDocument(expense.id)}>Justificatif</button>
                  ) : null}
                  {['DRAFT', 'REJECTED'].includes(expense.status) && can('expenses.create') ? (
                    <button onClick={() => act(`/expenses/${expense.id}/submit`)}>Soumettre</button>
                  ) : null}
                  {expense.status === 'SUBMITTED' && can('expenses.approve') ? (
                    <>
                      <button
                        onClick={() =>
                          act(`/expenses/${expense.id}/decision`, { decision: 'APPROVE' })
                        }
                      >
                        Approuver
                      </button>
                      <button
                        className="danger"
                        onClick={() => reject(`/expenses/${expense.id}/decision`)}
                      >
                        Rejeter
                      </button>
                    </>
                  ) : null}
                  {['APPROVED', 'PARTIALLY_PAID'].includes(expense.status) &&
                  can('expenses.pay') ? (
                    <button
                      className="pay"
                      onClick={() => {
                        setSelectedExpense(expense);
                        setModal('payment');
                      }}
                    >
                      Payer
                    </button>
                  ) : null}
                </>
              }
            />
          ))}
        </div>
      ) : null}
      {tab === 'purchases' ? (
        <div className="purchase-grid">
          {filteredPurchases.map((order) => (
            <article className="purchase-card" key={order.id}>
              <header>
                <div>
                  <span>{order.reference}</span>
                  <h2>{order.supplierName}</h2>
                </div>
                <Status value={order.status} />
              </header>
              <div className="purchase-total">
                <strong>{money(order.totalAmount)}</strong>
                <span>
                  {order.lines.length} ligne{order.lines.length > 1 ? 's' : ''}
                </span>
              </div>
              <ul>
                {order.lines.slice(0, 3).map((line) => (
                  <li key={line.id}>
                    <span>
                      {line.description} × {line.quantity}
                    </span>
                    <b>{money(line.lineTotal)}</b>
                  </li>
                ))}
              </ul>
              <footer>
                <span>Livraison {dateLabel(order.expectedDate)}</span>
                <div>
                  {['DRAFT', 'REJECTED'].includes(order.status) && can('purchases.create') ? (
                    <button onClick={() => act(`/purchase-orders/${order.id}/submit`)}>
                      Soumettre
                    </button>
                  ) : null}
                  {order.status === 'SUBMITTED' && can('purchases.approve') ? (
                    <>
                      <button
                        onClick={() =>
                          act(`/purchase-orders/${order.id}/decision`, { decision: 'APPROVE' })
                        }
                      >
                        Approuver
                      </button>
                      <button
                        className="danger"
                        onClick={() => reject(`/purchase-orders/${order.id}/decision`)}
                      >
                        Rejeter
                      </button>
                    </>
                  ) : null}
                  {['APPROVED', 'ORDERED', 'PARTIALLY_RECEIVED'].includes(order.status) &&
                  can('purchases.receive') ? (
                    <button onClick={() => act(`/purchase-orders/${order.id}/receive`)}>
                      Réceptionner
                    </button>
                  ) : null}
                </div>
              </footer>
            </article>
          ))}
        </div>
      ) : null}
      {tab === 'suppliers' ? (
        <>
          <div className="supplier-grid">
            {data.suppliers
              .filter((x) => `${x.code} ${x.name}`.toLowerCase().includes(query.toLowerCase()))
              .map((supplier) => (
                <article key={supplier.id}>
                  <header>
                    <span>{supplier.code}</span>
                    <Status value={supplier.status} />
                  </header>
                  <h2>{supplier.name}</h2>
                  <p>
                    {supplier.phone ?? 'Téléphone non renseigné'}
                    <br />
                    {supplier.email ?? 'Courriel non renseigné'}
                  </p>
                  <div>
                    <span>Encours fournisseur</span>
                    <strong>{money(supplier.outstandingAmount)}</strong>
                  </div>
                  <footer>
                    <span>Paiement à {supplier.paymentTermsDays} jours</span>
                    {can('suppliers.manage') ? (
                      <button
                        onClick={() => {
                          setSelectedSupplier(supplier);
                          setModal('supplier');
                        }}
                      >
                        Modifier
                      </button>
                    ) : null}
                  </footer>
                </article>
              ))}
          </div>
          <div className="category-strip">
            <strong>Catégories de dépenses</strong>
            {data.categories.map((category) => (
              <span key={category.id}>
                {category.code} · {category.name}
              </span>
            ))}
          </div>
        </>
      ) : null}
      {mutation.isError ? (
        <div className="procurement-toast" role="alert">
          {mutation.error instanceof Error ? mutation.error.message : 'Une erreur est survenue.'}
        </div>
      ) : null}
      {modal ? (
        <div
          className="procurement-modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <form className="procurement-modal" onSubmit={(e) => void submitForm(e)}>
            <header>
              <div>
                <span>
                  {modal === 'payment'
                    ? 'Règlement'
                    : modal === 'purchase'
                      ? 'Commande'
                      : modal === 'expense'
                        ? 'Engagement'
                        : 'Référentiel'}
                </span>
                <h2>
                  {modal === 'supplier'
                    ? selectedSupplier
                      ? 'Modifier le fournisseur'
                      : 'Nouveau fournisseur'
                    : modal === 'category'
                      ? 'Nouvelle catégorie'
                      : modal === 'purchase'
                        ? 'Créer un bon d’achat'
                        : modal === 'expense'
                          ? 'Saisir une dépense'
                          : `Payer ${selectedExpense?.reference ?? ''}`}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setModal(null);
                  setSelectedSupplier(null);
                }}
                aria-label="Fermer"
              >
                ×
              </button>
            </header>
            <div className="modal-fields">
              {modal === 'supplier' ? (
                <>
                  <Field label="Code">
                    <input name="code" defaultValue={selectedSupplier?.code} required />
                  </Field>
                  <Field label="Raison sociale">
                    <input name="name" defaultValue={selectedSupplier?.name} required />
                  </Field>
                  <Field label="NIU">
                    <input name="taxId" defaultValue={selectedSupplier?.taxId ?? ''} />
                  </Field>
                  <Field label="Téléphone">
                    <input name="phone" defaultValue={selectedSupplier?.phone ?? ''} />
                  </Field>
                  <Field label="Courriel">
                    <input name="email" type="email" defaultValue={selectedSupplier?.email ?? ''} />
                  </Field>
                  <Field label="Délai de paiement">
                    <input
                      name="terms"
                      type="number"
                      min="0"
                      defaultValue={selectedSupplier?.paymentTermsDays ?? 30}
                      required
                    />
                  </Field>
                  {selectedSupplier ? (
                    <Field label="Statut">
                      <select name="status" defaultValue={selectedSupplier.status}>
                        <option value="ACTIVE">Actif</option>
                        <option value="INACTIVE">Inactif</option>
                      </select>
                    </Field>
                  ) : null}
                  <Field label="Adresse" wide>
                    <textarea name="address" defaultValue={selectedSupplier?.address ?? ''} />
                  </Field>
                </>
              ) : modal === 'category' ? (
                <>
                  <Field label="Code">
                    <input name="code" required />
                  </Field>
                  <Field label="Libellé">
                    <input name="name" required />
                  </Field>
                  <Field label="Description" wide>
                    <textarea name="description" />
                  </Field>
                </>
              ) : modal === 'purchase' ? (
                <>
                  <Field label="Fournisseur">
                    <select name="supplierId" required>
                      {data.suppliers
                        .filter((x) => x.status === 'ACTIVE')
                        .map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label="Livraison souhaitée">
                    <input name="expectedDate" type="date" />
                  </Field>
                  <Field label="Notes" wide>
                    <textarea name="notes" />
                  </Field>
                  <div className="line-editor">
                    <div>
                      <strong>Lignes du bon</strong>
                      <button
                        type="button"
                        onClick={() =>
                          setLines([...lines, { description: '', quantity: 1, unitPrice: 0 }])
                        }
                      >
                        + Ajouter
                      </button>
                    </div>
                    {lines.map((line, index) => (
                      <div className="line-input" key={index}>
                        <input
                          aria-label="Désignation"
                          placeholder="Désignation"
                          value={line.description}
                          onChange={(e) =>
                            setLines(
                              lines.map((x, i) =>
                                i === index ? { ...x, description: e.target.value } : x,
                              ),
                            )
                          }
                        />
                        <input
                          aria-label="Quantité"
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={line.quantity}
                          onChange={(e) =>
                            setLines(
                              lines.map((x, i) =>
                                i === index ? { ...x, quantity: Number(e.target.value) } : x,
                              ),
                            )
                          }
                        />
                        <input
                          aria-label="Prix unitaire"
                          type="number"
                          min="1"
                          value={line.unitPrice}
                          onChange={(e) =>
                            setLines(
                              lines.map((x, i) =>
                                i === index ? { ...x, unitPrice: Number(e.target.value) } : x,
                              ),
                            )
                          }
                        />
                        {lines.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => setLines(lines.filter((_, i) => i !== index))}
                          >
                            ×
                          </button>
                        ) : null}
                      </div>
                    ))}
                    <strong className="line-total">
                      Total : {money(lines.reduce((s, x) => s + x.quantity * x.unitPrice, 0))}
                    </strong>
                  </div>
                </>
              ) : modal === 'expense' ? (
                <>
                  <Field label="Fournisseur">
                    <select name="supplierId" required>
                      {data.suppliers
                        .filter((x) => x.status === 'ACTIVE')
                        .map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label="Catégorie">
                    <select name="categoryId" required>
                      {data.categories
                        .filter((x) => x.status === 'ACTIVE')
                        .map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label="Bon d’achat lié">
                    <select name="purchaseOrderId">
                      <option value="">Sans bon d’achat</option>
                      {data.purchaseOrders
                        .filter((x) =>
                          ['APPROVED', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED'].includes(
                            x.status,
                          ),
                        )
                        .map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.reference} · {x.supplierName}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label="N° de facture">
                    <input name="invoiceNumber" />
                  </Field>
                  <Field label="Date de facture">
                    <input
                      name="invoiceDate"
                      type="date"
                      defaultValue={new Date().toISOString().slice(0, 10)}
                      required
                    />
                  </Field>
                  <Field label="Échéance">
                    <input name="dueDate" type="date" required />
                  </Field>
                  <Field label="Montant (FCFA)">
                    <input name="amount" type="number" min="1" required />
                  </Field>
                  <Field label="Justificatif">
                    <input
                      name="attachment"
                      type="file"
                      accept="application/pdf,image/png,image/jpeg"
                    />
                  </Field>
                  <Field label="Description" wide>
                    <textarea name="description" required />
                  </Field>
                </>
              ) : (
                <>
                  <div className="payment-balance">
                    <span>Solde à régler</span>
                    <strong>{money(selectedExpense?.balance ?? 0)}</strong>
                    <small>{selectedExpense?.supplierName}</small>
                  </div>
                  <Field label="Montant">
                    <input
                      name="amount"
                      type="number"
                      min="1"
                      max={selectedExpense?.balance}
                      defaultValue={selectedExpense?.balance}
                      required
                    />
                  </Field>
                  <Field label="Moyen">
                    <select name="method">
                      <option value="BANK_TRANSFER">Virement bancaire</option>
                      <option value="MOBILE_MONEY">Mobile Money</option>
                      <option value="CASH">Espèces</option>
                      <option value="CHEQUE">Chèque</option>
                      <option value="BANK_DEPOSIT">Dépôt bancaire</option>
                      <option value="OTHER">Autre</option>
                    </select>
                  </Field>
                  <Field label="Date et heure">
                    <input
                      name="paidAt"
                      type="datetime-local"
                      defaultValue={new Date().toISOString().slice(0, 16)}
                      required
                    />
                  </Field>
                  <Field label="Référence externe">
                    <input name="externalReference" />
                  </Field>
                  <Field label="Note" wide>
                    <textarea name="note" />
                  </Field>
                </>
              )}
            </div>
            <footer>
              <button
                type="button"
                className="button-secondary"
                onClick={() => {
                  setModal(null);
                  setSelectedSupplier(null);
                }}
              >
                Annuler
              </button>
              <button className="button-primary" disabled={mutation.isPending}>
                {mutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </footer>
          </form>
        </div>
      ) : null}
    </section>
  );
}

function Field({
  label,
  wide = false,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={wide ? 'wide' : ''}>
      <span>{label}</span>
      {children}
    </label>
  );
}
function Status({ value }: { value: string }) {
  return <em className={`proc-status ${value.toLowerCase()}`}>{statusLabels[value] ?? value}</em>;
}
function ExpenseRow({
  expense,
  actions,
  compact = false,
}: {
  expense: ExpenseDto;
  actions?: React.ReactNode;
  compact?: boolean;
}) {
  if (compact)
    return (
      <div className="approval-row">
        <div>
          <strong>{expense.supplierName}</strong>
          <span>
            {expense.reference} · {expense.description}
          </span>
        </div>
        <b>{money(expense.amount)}</b>
        <div>{actions}</div>
      </div>
    );
  return (
    <article className="expense-row">
      <div>
        <strong>{expense.reference}</strong>
        <span>{expense.supplierName}</span>
        <small>
          {expense.invoiceNumber ? `Facture ${expense.invoiceNumber}` : expense.description}
        </small>
      </div>
      <span>{dateLabel(expense.dueDate)}</span>
      <b>{money(expense.amount)}</b>
      <b className={expense.balance ? 'balance' : ''}>{money(expense.balance)}</b>
      <Status value={expense.status} />
      <div className="row-actions">{actions}</div>
    </article>
  );
}
