import { QueryClient } from '@tanstack/react-query';
import { ApiError, NetworkError } from './client';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Inutile de réessayer une erreur métier : la réponse ne changera pas.
        if (error instanceof ApiError && error.status < 500) return false;
        // Une coupure réseau, en revanche, mérite une seconde chance.
        if (error instanceof NetworkError) return failureCount < 2;
        return failureCount < 1;
      },
    },
    mutations: {
      // Une mutation ne se rejoue JAMAIS automatiquement : rejouer un
      // encaissement créerait un double paiement (docs/04 §7).
      retry: false,
    },
  },
});
