import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '@/shared/api/client';

export function ForgotPasswordPage() {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<'request' | 'reset' | 'done'>('request');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      if (step === 'request') {
        const result = await api.post<{ devCode?: string }>('/auth/password/forgot', { phone });
        if (result.devCode) setCode(result.devCode);
        setStep('reset');
      } else {
        await api.post('/auth/password/reset', { phone, code, newPassword: password });
        setStep('done');
      }
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Une erreur est survenue.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthCard title="Réinitialiser le mot de passe">
      {step === 'done' ? (
        <div className="space-y-4">
          <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
            Votre mot de passe a été modifié.
          </p>
          <Link className="block text-center text-sm font-medium text-brand-700" to="/login">
            Retour à la connexion
          </Link>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={submit}>
          <Field label="Téléphone">
            <input
              className="input"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              disabled={step === 'reset'}
              required
            />
          </Field>
          {step === 'reset' ? (
            <>
              <Field label="Code à 6 chiffres">
                <input
                  className="input"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                  required
                />
              </Field>
              <Field label="Nouveau mot de passe">
                <input
                  className="input"
                  type="password"
                  minLength={8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </Field>
            </>
          ) : null}
          {message ? <p className="text-sm text-red-700">{message}</p> : null}
          <button className="button-primary w-full" disabled={busy}>
            {busy
              ? 'Veuillez patienter…'
              : step === 'request'
                ? 'Recevoir un code'
                : 'Changer le mot de passe'}
          </button>
          <Link className="block text-center text-sm text-slate-600" to="/login">
            Retour
          </Link>
        </form>
      )}
    </AuthCard>
  );
}
export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="auth-shell">
      <section className="auth-story">
        <div className="auth-brand">
          <img src="/brand/csb-nk-logo.png" alt="Logo officiel du CSB Noutcha KAMGUE" />
          <div>
            <strong>CSB Noutcha KAMGUE</strong>
            <span>Dogpassi · Douala</span>
          </div>
        </div>
        <div className="auth-message">
          <h2>
            La vie scolaire,
            <br />
            simplement organisée.
          </h2>
          <p>
            Un espace sûr pour accompagner les élèves, les familles et les équipes du collège au
            quotidien.
          </p>
        </div>
        <p className="auth-signature">Apprendre · Persévérer · Réussir</p>
      </section>
      <main className="auth-panel">
        <div className="auth-card">
          <div className="auth-mobile-brand">
            <img src="/brand/csb-nk-logo.png" alt="Logo officiel du CSB Noutcha KAMGUE" />
            <span>CSB Noutcha KAMGUE</span>
          </div>
          <p className="auth-context">Espace établissement</p>
          <h1>{title}</h1>
          {children}
          <footer>Besoin d’aide ? Contactez l’administration du complexe.</footer>
        </div>
      </main>
    </div>
  );
}
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}
