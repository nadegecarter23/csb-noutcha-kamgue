import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Paginated, SchoolServicesOverviewDto, StudentDto } from '@cplan/contracts';
import { api } from '@/shared/api/client';
import { useAcademicYear } from '@/features/academic/use-academic-year';
import { useAuthStore } from '@/features/auth/auth-store';
export function SchoolServicesPage() {
  const academic = useAcademicYear();
  const user = useAuthStore((s) => s.user);
  const client = useQueryClient();
  const [tab, setTab] = useState<'library' | 'canteen' | 'transport' | 'inventory'>('library');
  const [form, setForm] = useState(false);
  const data = useQuery({
    queryKey: ['school-services'],
    queryFn: () => api.get<SchoolServicesOverviewDto>('/school-services'),
  });
  const students = useQuery({
    queryKey: ['students-services', academic.selectedYear?.id],
    queryFn: () =>
      api.get<Paginated<StudentDto>>(
        `/students?academic_year_id=${academic.selectedYear?.id}&page_size=100`,
      ),
    enabled: Boolean(academic.selectedYear?.id),
  });
  const refresh = () => void client.invalidateQueries({ queryKey: ['school-services'] });
  const mutate = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => api.post(path, body),
    onSuccess: () => {
      setForm(false);
      refresh();
    },
  });
  const canManage = Boolean(user?.permissions.includes('school_services.manage'));
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (tab === 'library') {
      const kind = String(f.get('kind'));
      if (kind === 'book')
        mutate.mutate({
          path: '/library/books',
          body: {
            isbn: String(f.get('isbn')) || null,
            title: String(f.get('title')),
            author: String(f.get('author')),
            stock: Number(f.get('stock')),
          },
        });
      else
        mutate.mutate({
          path: '/library/loans',
          body: {
            bookId: String(f.get('book')),
            enrollmentId: String(f.get('student')),
            dueAt: String(f.get('due')),
          },
        });
    }
    if (tab === 'canteen')
      mutate.mutate({
        path: '/canteen/meals',
        body: {
          date: String(f.get('date')),
          menu: String(f.get('menu')),
          planned: Number(f.get('planned')),
          served: Number(f.get('served')),
        },
      });
    if (tab === 'transport')
      mutate.mutate({
        path: '/transport/routes',
        body: {
          name: String(f.get('name')),
          vehicle: String(f.get('vehicle')),
          driver: String(f.get('driver')),
          capacity: Number(f.get('capacity')),
          stops: String(f.get('stops'))
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean),
        },
      });
    if (tab === 'inventory')
      mutate.mutate({
        path: '/inventory/items',
        body: {
          code: String(f.get('code')),
          name: String(f.get('name')),
          unit: String(f.get('unit')),
          quantity: Number(f.get('quantity')),
          reorderLevel: Number(f.get('reorder')),
        },
      });
  };
  return (
    <section className="services-page">
      <header>
        <div>
          <h1>Services de l’établissement</h1>
          <p>Pilotez les services quotidiens et leurs niveaux d’activité.</p>
        </div>
        {canManage ? (
          <button className="button-primary" onClick={() => setForm((v) => !v)}>
            + Ajouter
          </button>
        ) : null}
      </header>
      <div className="service-tabs">
        {(
          [
            ['library', 'Bibliothèque'],
            ['canteen', 'Cantine'],
            ['transport', 'Transport'],
            ['inventory', 'Stocks'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? 'active' : ''}
            onClick={() => {
              setTab(id);
              setForm(false);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {form ? (
        <form className="service-form" onSubmit={submit}>
          {tab === 'library' ? (
            <>
              <label>
                Opération
                <select name="kind">
                  <option value="loan">Nouvel emprunt</option>
                  <option value="book">Nouveau livre</option>
                </select>
              </label>
              <label>
                Livre
                <select name="book">
                  {data.data?.books
                    .filter((x) => x.available > 0)
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.title} ({x.available})
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Élève
                <select name="student">
                  {students.data?.data.flatMap((x) =>
                    x.currentEnrollment
                      ? [
                          <option key={x.currentEnrollment.id} value={x.currentEnrollment.id}>
                            {x.lastName} {x.firstName}
                          </option>,
                        ]
                      : [],
                  )}
                </select>
              </label>
              <label>
                Retour prévu
                <input name="due" type="date" />
              </label>
              <label>
                ISBN
                <input name="isbn" />
              </label>
              <label>
                Titre
                <input name="title" />
              </label>
              <label>
                Auteur
                <input name="author" />
              </label>
              <label>
                Exemplaires
                <input name="stock" type="number" min="1" defaultValue="1" />
              </label>
            </>
          ) : tab === 'canteen' ? (
            <>
              <label>
                Date
                <input name="date" type="date" required />
              </label>
              <label className="wide">
                Menu
                <textarea name="menu" required />
              </label>
              <label>
                Repas planifiés
                <input name="planned" type="number" min="0" required />
              </label>
              <label>
                Repas servis
                <input name="served" type="number" min="0" required />
              </label>
            </>
          ) : tab === 'transport' ? (
            <>
              <label>
                Nom de la ligne
                <input name="name" required />
              </label>
              <label>
                Véhicule
                <input name="vehicle" required />
              </label>
              <label>
                Chauffeur
                <input name="driver" required />
              </label>
              <label>
                Capacité
                <input name="capacity" type="number" min="1" required />
              </label>
              <label className="wide">
                Arrêts, séparés par des virgules
                <input name="stops" required />
              </label>
            </>
          ) : (
            <>
              <label>
                Code
                <input name="code" required />
              </label>
              <label>
                Article
                <input name="name" required />
              </label>
              <label>
                Unité
                <input name="unit" required placeholder="ramette, kg…" />
              </label>
              <label>
                Quantité
                <input name="quantity" type="number" min="0" step=".01" required />
              </label>
              <label>
                Seuil d’alerte
                <input name="reorder" type="number" min="0" step=".01" required />
              </label>
            </>
          )}
          <button className="button-primary">Enregistrer</button>
        </form>
      ) : null}
      <div className="service-content">
        {tab === 'library' ? (
          <>
            <div className="service-cards">
              {data.data?.books.map((x) => (
                <article key={x.id}>
                  <span>{x.author}</span>
                  <h2>{x.title}</h2>
                  <strong>
                    {x.available}/{x.stock}
                  </strong>
                  <small>exemplaires disponibles</small>
                </article>
              ))}
            </div>
            <div className="service-list">
              {data.data?.loans.map((x) => (
                <article key={x.id}>
                  <div>
                    <strong>{x.studentName}</strong>
                    <span>
                      {x.bookTitle} · retour {new Date(x.dueAt).toLocaleDateString('fr-CM')}
                    </span>
                  </div>
                  <em className={x.status.toLowerCase()}>
                    {x.status === 'OVERDUE'
                      ? 'En retard'
                      : x.status === 'RETURNED'
                        ? 'Rendu'
                        : 'Emprunté'}
                  </em>
                  {x.status !== 'RETURNED' && canManage ? (
                    <button
                      onClick={() => mutate.mutate({ path: `/library/loans/${x.id}/return` })}
                    >
                      Enregistrer le retour
                    </button>
                  ) : null}
                </article>
              ))}
            </div>
          </>
        ) : tab === 'canteen' ? (
          <div className="service-cards">
            {data.data?.meals.map((x) => (
              <article key={x.id}>
                <span>{new Date(x.date).toLocaleDateString('fr-CM')}</span>
                <h2>{x.menu}</h2>
                <strong>
                  {x.served}/{x.planned}
                </strong>
                <small>repas servis</small>
              </article>
            ))}
          </div>
        ) : tab === 'transport' ? (
          <div className="service-cards">
            {data.data?.routes.map((x) => (
              <article key={x.id}>
                <span>
                  {x.vehicle} · {x.driver}
                </span>
                <h2>{x.name}</h2>
                <p>{x.stops.join(' → ')}</p>
                <strong>
                  {x.enrolled}/{x.capacity}
                </strong>
                <small>places occupées</small>
              </article>
            ))}
          </div>
        ) : (
          <div className="service-list">
            {data.data?.inventory.map((x) => (
              <article key={x.id}>
                <div>
                  <strong>{x.name}</strong>
                  <span>
                    {x.code} · seuil {x.reorderLevel} {x.unit}
                  </span>
                </div>
                <b>
                  {x.quantity} {x.unit}
                </b>
                <em className={x.status.toLowerCase()}>
                  {x.status === 'OK'
                    ? 'Disponible'
                    : x.status === 'LOW'
                      ? 'À commander'
                      : 'Rupture'}
                </em>
                {canManage ? (
                  <button
                    onClick={() => {
                      const raw = window.prompt('Quantité à ajouter (négative pour une sortie)');
                      if (raw)
                        mutate.mutate({
                          path: `/inventory/items/${x.id}/movements`,
                          body: { quantity: Number(raw), reason: 'Ajustement manuel' },
                        });
                    }}
                  >
                    Mouvement
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
