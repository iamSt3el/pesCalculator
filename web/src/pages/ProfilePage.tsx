import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, type Profile } from '../api.ts';
import { validatePasswordChange, MIN_PASSWORD } from '../password.ts';
import { RunningHead } from '../components/RunningHead.tsx';
import { Spinner } from '../components/Spinner.tsx';

const ROLE_LABEL: Record<Profile['role'], string> = {
  admin: 'Administrator',
  user: 'Standard account',
};

function joinedOn(iso: string): string {
  const when = new Date(iso);
  return Number.isNaN(when.getTime())
    ? '—'
    : when.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

export function ProfilePage({ onSignOut }: { onSignOut: () => void }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.profile().then(setProfile).catch((e: Error) => setLoadError(e.message));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setDone(false);

    const complaint = validatePasswordChange({ current, next, confirm });
    if (complaint) { setError(complaint); return; }

    setBusy(true);
    setError(null);
    try {
      await api.changePassword(current, next);
      setCurrent(''); setNext(''); setConfirm('');
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change the password');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page page--medium">
      <RunningHead identity="Your account" sub="Sign-in details for this site" />
      <div className="page-head">
        <div>
          <h1 className="title">Your account</h1>
        </div>
        <button className="ghost" onClick={onSignOut}>Sign out</button>
      </div>

      <Link to="/" className="rail-back">← All contracts</Link>

      {loadError && <p className="notice">{loadError}</p>}

      <div className="section-head"><h2>Details</h2></div>
      {profile === null && !loadError ? <Spinner /> : profile && (
        <div className="panel grid-fields">
          <div className="stack">
            <span className="eyebrow eyebrow--flush">Email</span>
            <span>{profile.email}</span>
          </div>
          <div className="stack">
            <span className="eyebrow eyebrow--flush">Role</span>
            <span>{ROLE_LABEL[profile.role]}</span>
          </div>
          <div className="stack">
            <span className="eyebrow eyebrow--flush">Joined</span>
            <span>{joinedOn(profile.createdAt)}</span>
          </div>
          <div className="stack">
            <span className="eyebrow eyebrow--flush">Contracts owned</span>
            <span>{profile.contractCount}</span>
          </div>
        </div>
      )}

      <div className="section-head"><h2>Change password</h2></div>
      <form onSubmit={submit} className="panel stack-form">
        <label className="field">
          Current password
          <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)}
                 required autoComplete="current-password" />
        </label>
        <label className="field">
          New password
          <input type="password" value={next} onChange={(e) => setNext(e.target.value)}
                 required autoComplete="new-password" minLength={MIN_PASSWORD} />
          <span className="hint">At least {MIN_PASSWORD} characters.</span>
        </label>
        <label className="field">
          Confirm new password
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                 required autoComplete="new-password" minLength={MIN_PASSWORD} />
        </label>

        {error && <p className="notice">{error}</p>}
        {done && (
          <p className="notice notice--ok">
            Password changed. Any other device signed in to this account has been signed out.
          </p>
        )}

        <button type="submit" disabled={busy}>{busy ? 'Changing…' : 'Change password'}</button>
      </form>

      <p className="hint hint--spaced">
        There is no email-based recovery. If you forget this password, an administrator
        must reset it directly in the database.
      </p>
    </main>
  );
}
