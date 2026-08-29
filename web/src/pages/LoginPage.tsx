import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../api.ts';

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
    <main style={{ maxWidth: 350, margin: '15vh auto', padding: 20 }}>
      <h1 className="title">Price Escalation</h1>
      <p className="subtitle">Clause-45 billing for PWD road contracts</p>

      <form onSubmit={submit} className="panel" style={{ display: 'grid', gap: 14, marginTop: 26 }}>
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
        <button type="submit" disabled={busy}>
          {busy ? 'Working…' : creating ? 'Create account and sign in' : 'Sign in'}
        </button>
      </form>

      <p className="hint" style={{ marginTop: 18 }}>
        {creating ? 'Already have an account? ' : 'Need an account? '}
        <a href="#" onClick={(e) => { e.preventDefault(); setCreating(!creating); setError(null); }}>
          {creating ? 'Sign in instead' : 'Create an account'}
        </a>
      </p>
    </main>
  );
}
