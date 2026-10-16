import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ApiError, NetworkError } from '@/shared/api/client';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Frontière d'erreur globale.
 *
 * Un dashboard financier ne doit JAMAIS afficher une page blanche : l'agent
 * qui l'utilise ne saurait pas si son encaissement a été enregistré. On
 * affiche toujours un message, et la référence technique permet au support de
 * retrouver la trace serveur correspondante.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Sera remplacé par Sentry en Phase 17.
    console.error('Erreur non interceptée :', error, info.componentStack);
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const isNetwork = error instanceof NetworkError;
    const requestId = error instanceof ApiError ? error.requestId : null;

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">
            {isNetwork ? 'Connexion impossible' : 'Une erreur est survenue'}
          </h1>

          <p className="mt-2 text-sm text-slate-600">
            {isNetwork
              ? 'Vérifiez votre connexion réseau, puis réessayez.'
              : "L'opération n'a pas pu aboutir. Aucune donnée n'a été modifiée."}
          </p>

          {requestId && (
            <p className="mt-4 rounded bg-slate-100 px-3 py-2 font-mono text-xs text-slate-500">
              Référence technique : {requestId}
            </p>
          )}

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={this.reset}
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Réessayer
            </button>
            <button
              type="button"
              onClick={() => window.location.assign('/')}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Retour à l'accueil
            </button>
          </div>
        </div>
      </div>
    );
  }
}
