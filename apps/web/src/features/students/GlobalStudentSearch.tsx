import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { GlobalSearchResult } from '@cplan/contracts';
import { api } from '@/shared/api/client';

const groups = [
  { key: 'students', label: 'Élèves', path: (id: string) => `/students/${id}` },
  { key: 'guardians', label: 'Responsables', path: () => '/students' },
  { key: 'payments', label: 'Paiements', path: (id: string) => `/payments?payment=${id}` },
  { key: 'receipts', label: 'Reçus', path: () => '/payments' },
] as const;

export function GlobalStudentSearch() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === 'Escape') setOpen(false);
    };
    const openSearch = () => setOpen(true);
    window.addEventListener('keydown', listener);
    window.addEventListener('cplan:search', openSearch);
    return () => {
      window.removeEventListener('keydown', listener);
      window.removeEventListener('cplan:search', openSearch);
    };
  }, []);
  const result = useQuery({
    queryKey: ['global-search', query],
    queryFn: () =>
      api.get<GlobalSearchResult>(
        `/search?q=${encodeURIComponent(query)}&types=students,guardians,payments,receipts`,
      ),
    enabled: open && query.trim().length >= 2,
    staleTime: 30_000,
  });
  if (!open) return null;
  const first = result.data?.students[0];
  return (
    <div className="search-overlay" onMouseDown={() => setOpen(false)}>
      <div
        className="search-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Recherche globale"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="search-field">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-4-4" />
          </svg>
          <input
            autoFocus
            placeholder="Rechercher un élève, un responsable, un reçu ou un paiement…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && first) {
                setOpen(false);
                navigate(`/students/${first.id}`);
              }
            }}
          />
          <kbd>Échap</kbd>
        </div>
        <div className="search-results">
          {query.length < 2 ? (
            <div className="search-hint">
              <strong>Que recherchez-vous ?</strong>
              <span>
                Saisissez au moins deux caractères. Vous pouvez utiliser un nom, un matricule ou une
                référence.
              </span>
            </div>
          ) : null}
          {result.isPending ? <p className="search-status">Recherche en cours…</p> : null}
          {groups.map((group) => {
            const items = result.data?.[group.key] ?? [];
            return items.length ? (
              <section key={group.key}>
                <p>{group.label}</p>
                {items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setOpen(false);
                      navigate(group.path(item.id));
                    }}
                  >
                    <span>{item.label}</span>
                    <small>{item.subtitle}</small>
                  </button>
                ))}
              </section>
            ) : null;
          })}
          {query.length >= 2 &&
          !result.isPending &&
          !Object.values(result.data ?? {}).some((items) => items.length) ? (
            <p className="search-status">
              Aucun résultat. Vérifiez l’orthographe ou essayez un matricule.
            </p>
          ) : null}
        </div>
        <footer>Entrée pour ouvrir le premier résultat · Échap pour fermer</footer>
      </div>
    </div>
  );
}
