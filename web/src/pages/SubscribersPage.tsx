import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, type Subscriber } from '../api.ts';
import { isoDay, PERIOD_LABEL, subscriberCategory, type SubscriberCategory } from '../billing.ts';
import { Spinner } from '../components/Spinner.tsx';
import { useEntitlement } from '../entitlement.tsx';
import { formatDate } from '../format.ts';

type Filter = 'all' | Exclude<SubscriberCategory, 'admin'>;
const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'All' }, { key: 'paying', label: 'Paying' }, { key: 'granted', label: 'Granted' },
  { key: 'free', label: 'Free' }, { key: 'ended', label: 'Ended' },
];

const STATUS: Record<SubscriberCategory, { pill: string; label: string }> = {
  admin: { pill: 'pill pill--ok', label: 'Administrator' },
  paying: { pill: 'pill pill--ok', label: 'Active' },
  granted: { pill: 'pill pill--ok', label: 'Granted' },
  free: { pill: 'pill pill--idle', label: 'Free' },
  ended: { pill: 'pill pill--bad', label: 'Ended' },
};

function statusOf(s: Subscriber) {
  if (s.subscription?.status === 'pending' && s.entitlement.source === 'subscription') {
    return { pill: 'pill pill--warn', label: 'Payment retrying' };
  }
  return STATUS[subscriberCategory(s)];
}

export function SubscribersPage() {
  const { view } = useEntitlement();
  const [rows, setRows] = useState<Subscriber[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [granting, setGranting] = useState<number | null>(null);
  const [until, setUntil] = useState('');
  const [note, setNote] = useState('');

  const load = () => { api.subscribers().then(setRows).catch((e: Error) => setError(e.message)); };
  useEffect(load, []);

  if (view && view.entitlement.source !== 'admin') {
    return <main className="app-main"><p className="notice">Administrator access required.</p></main>;
  }

  const counts = (rows ?? []).reduce<Record<string, number>>((acc, r) => {
    const c = subscriberCategory(r);
    acc[c] = (acc[c] ?? 0) + 1;
    return acc;
  }, {});
  const shown = (rows ?? []).filter((r) =>
    (filter === 'all' || subscriberCategory(r) === filter)
    && r.email.toLowerCase().includes(search.trim().toLowerCase()));

  function openGrant(r: Subscriber) {
    setGranting(r.id);
    setUntil(r.grant?.until ?? '');
    setNote(r.grant?.note ?? '');
    setError(null);
  }

  async function submitGrant(ev: FormEvent) {
    ev.preventDefault();
    if (granting === null) return;
    try {
      await api.grant(granting, until, note);
      setGranting(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not grant access');
    }
  }

  async function revoke(id: number) {
    try {
      await api.revokeGrant(id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not revoke');
    }
  }

  return (
    <main className="app-main">
      <div className="app-head">
        <div>
          <h1 className="title">Subscribers</h1>
          <p className="subtitle">Every account, what it pays for, and until when. Administrators are always unlimited.</p>
        </div>
      </div>

      {error && <p className="notice">{error}</p>}

      <div className="filters">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" className="filter" aria-pressed={filter === f.key}
                  onClick={() => setFilter(f.key)}>
            {f.label} <span className="num">{f.key === 'all' ? rows?.length ?? 0 : counts[f.key] ?? 0}</span>
          </button>
        ))}
        <input aria-label="Find an account" placeholder="Find an account by email" className="grow"
               value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {rows === null ? <Spinner /> : (
        <div className="panel panel--flush scroller">
          <table className="grid">
            <thead>
              <tr><th>Account</th><th>Plan</th><th>Status</th><th>Paid until</th><th>Source</th><th className="r">Contracts</th><th /></tr>
            </thead>
            <tbody>
              {shown.flatMap((r) => {
                const status = statusOf(r);
                const row = (
                  <tr key={r.id}>
                    <td>{r.email}<span className="cell-sub">Joined {formatDate(isoDay(r.createdAt))}</span></td>
                    <td>{r.subscription ? PERIOD_LABEL[r.subscription.period] : r.entitlement.source === 'grant' ? '—' : 'Free'}</td>
                    <td><span className={status.pill}>{status.label}</span></td>
                    <td>{r.entitlement.paidUntil ? formatDate(r.entitlement.paidUntil) : <span className="hint">—</span>}</td>
                    <td>
                      {r.grant ? <>Granted<span className="cell-sub">{r.grant.note || '—'}</span></>
                        : r.subscription ? <>Razorpay<span className="cell-sub num num--left">{r.subscription.razorpayId}</span></>
                        : <span className="hint">—</span>}
                    </td>
                    <td className="num">
                      {r.entitlement.contractCount}
                      {r.entitlement.readOnly && <span className="cell-sub">read-only</span>}
                    </td>
                    <td className="actions">
                      {r.role === 'admin' ? null : (
                        <span className="row row--tight">
                          <button className="ghost small" onClick={() => openGrant(r)}>
                            {r.grant ? 'Change' : 'Grant…'}
                          </button>
                          {r.grant && <button className="danger small" onClick={() => void revoke(r.grant!.id)}>Revoke</button>}
                        </span>
                      )}
                    </td>
                  </tr>
                );
                if (granting !== r.id) return [row];
                return [row, (
                  <tr key={`${r.id}-grant`}>
                    <td colSpan={7}>
                      <form onSubmit={submitGrant} className="form-bar stack-sm">
                        <label className="field">
                          Unlimited contracts until
                          <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} required />
                        </label>
                        <label className="field">
                          Note, for your own records
                          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500}
                                 placeholder="e.g. Paid by UPI, ref …" />
                        </label>
                        <button type="submit">Grant access</button>
                        <button type="button" className="ghost" onClick={() => setGranting(null)}>Cancel</button>
                      </form>
                      <p className="hint">
                        A grant runs alongside any Razorpay subscription; the account is unlimited until
                        whichever date is later. The account is not charged.
                      </p>
                    </td>
                  </tr>
                )];
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
