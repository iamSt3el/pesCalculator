import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api.ts';
import { SiteFooter } from '../components/SiteFooter.tsx';
import { SITE } from '../site.ts';

export function LoginPage({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (creating) await api.createUser(email, password);
      await api.login(email, password);
      onSignedIn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page page--narrow">
      <Link to="/" className="rail-back">← About and pricing</Link>
      <h1 className="title stack-sm">{SITE.name}</h1>
      <p className="subtitle">Clause-45 billing for PWD road contracts</p>

      <form onSubmit={submit} className="panel stack-form">
        <label className="field">
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                 required autoComplete="username" />
        </label>
        <label className="field">
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                 required autoComplete={creating ? 'new-password' : 'current-password'} minLength={12} />
          {creating && <span className="hint">At least 12 characters.</span>}
        </label>
        {error && <p className="notice">{error}</p>}
        {creating && (
          <p className="hint flush">
            By creating an account you agree to the <Link to="/terms">terms</Link> and
            the <Link to="/privacy">privacy policy</Link>.
          </p>
        )}
        <button type="submit" disabled={busy}>
          {busy ? 'Working…' : creating ? 'Create account and sign in' : 'Sign in'}
        </button>
      </form>

      <p className="hint hint--spaced">
        {creating ? 'Already have an account? ' : 'Need an account? '}
        <a href="#" onClick={(e) => { e.preventDefault(); setCreating(!creating); setError(null); }}>
          {creating ? 'Sign in instead' : 'Create an account'}
        </a>
      </p>
      <SiteFooter />
    </main>
  );
}
