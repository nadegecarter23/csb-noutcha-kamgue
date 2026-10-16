import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '@/shared/api/client';
import { useAuthStore } from '../auth-store';
import { homeRouteFor } from '../home-route';
import { AuthCard, Field } from './ForgotPasswordPage';

export function LoginPage() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { user, signIn } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  if (user) return <Navigate to={homeRouteFor(user)} replace />;
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signIn(identifier, password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? homeRouteFor(useAuthStore.getState().user), { replace: true });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Impossible de joindre le serveur.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthCard title="Heureux de vous revoir">
      <p className="mb-6 text-sm leading-6 text-slate-500">
        Connectez-vous à votre espace du Complexe Scolaire Bilingue Noutcha KAMGUE.
      </p>
      <form className="space-y-4" onSubmit={submit}>
        <Field label="E-mail ou téléphone">
          <input
            className="input"
            placeholder="nom@college.cm ou +237…"
            autoComplete="username"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            required
          />
        </Field>
        <Field label="Mot de passe">
          <input
            className="input"
            type="password"
            placeholder="Votre mot de passe"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </Field>
        {error ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        <div className="text-right">
          <Link className="text-sm text-brand-700 hover:underline" to="/forgot-password">
            Mot de passe oublié ?
          </Link>
        </div>
        <button className="button-primary w-full" disabled={busy}>
          {busy ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
    </AuthCard>
  );
}
