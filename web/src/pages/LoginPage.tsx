import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api.ts';
import { Brand } from '../components/Brand.tsx';
import { SITE } from '../site.ts';

/**
 * Sign in or create an account. The landing page's "Create free account"
 * arrives with ?create=1 and opens on that tab.
 */
export function LoginPage({ onSignedIn }: { onSignedIn: () => void }) {
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(params.get('create') === '1');

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

  function choose(create: boolean) {
    setCreating(create);
    setError(null);
  }

  return (
    <div className="auth">
      <aside className="auth__side band-dark">
        <Brand />
        <div>
          <span className="eyebrow">Clause-45 escalation</span>
          <p className="auth__quote">
            Two things are typed by hand — the published indices, and the contract’s particulars.
            Everything else is derived.
          </p>
          <div className="auth__points">
            <span>Free for your first contract — no card needed.</span>
            <span>Every escalation line shown operand by operand.</span>
            <span>Printed as a filed set of A4 sheets.</span>
          </div>
        </div>
        <nav className="row" aria-label="Policies">
          <Link className="navlink" to="/terms">Terms</Link>
          <Link className="navlink" to="/privacy">Privacy</Link>
          <Link className="navlink" to="/refunds">Refunds</Link>
          <Link className="navlink" to="/contact">Contact</Link>
        </nav>
      </aside>

      <main className="auth__main">
        <div>
          <h1 className="title">{creating ? `Create your ${SITE.name} account` : `Sign in to ${SITE.name}`}</h1>
          <p className="subtitle">
            {creating ? 'Free for your first contract.' : 'Pick up where you left off on your contracts.'}
          </p>
        </div>

        <div className="tabs" role="tablist" aria-label="Account">
          <button type="button" role="tab" className="tab" aria-selected={!creating} onClick={() => choose(false)}>
            Sign in
          </button>
          <button type="button" role="tab" className="tab" aria-selected={creating} onClick={() => choose(true)}>
            Create an account
          </button>
        </div>

        <form onSubmit={submit} className="auth__form">
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
          {error && <p className="notice flush">{error}</p>}
          {creating && (
            <p className="hint flush">
              By creating an account you agree to the <Link to="/terms">terms</Link> and
              the <Link to="/privacy">privacy policy</Link>.
            </p>
          )}
          <button type="submit" disabled={busy}>
            {busy ? 'Working…' : creating ? 'Create account and sign in' : 'Sign in'}
          </button>
          {!creating && (
            <p className="hint flush">
              Forgotten your password? <Link to="/contact">Contact us</Link> — there is no email reset yet.
            </p>
          )}
        </form>

        <Link to="/" className="rail-back">← About and pricing</Link>
      </main>
    </div>
  );
}
