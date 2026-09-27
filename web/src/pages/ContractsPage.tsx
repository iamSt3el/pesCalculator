import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, type ContractSummary } from '../api.ts';
import { Spinner } from '../components/Spinner.tsx';
import { formatDate, formatRupees, formatWhen } from '../format.ts';
import { contractsBand, isoDay, planState } from '../billing.ts';
import { Band } from '../components/Band.tsx';
import { LockIcon } from '../components/LockIcon.tsx';
import { useEntitlement } from '../entitlement.tsx';
import { contractStats } from '../stats.ts';

const STATUS: Record<ContractSummary['status'], { pill: string; label: string }> = {
  ready: { pill: 'pill pill--ok', label: 'Ready' },
  provisional: { pill: 'pill pill--warn', label: 'Provisional' },
  blank: { pill: 'pill pill--idle', label: 'Not started' },
};

function Status({ row }: { row: ContractSummary }) {
  const { pill, label } = STATUS[row.status];
  const detail = row.status === 'provisional'
    ? `${row.problemCount} thing${row.problemCount === 1 ? '' : 's'} to fix`
    : null;
  return (
    <>
      <span className={pill}>{label}</span>
      {detail && <span className="cell-sub">{detail}</span>}
    </>
  );
}

/** How many contracts, how many are ready to print, and what they come to. */
function Stats({ rows }: { rows: ContractSummary[] }) {
  const { count, ready, payable } = contractStats(rows);
  return (
    <div className="stat-strip">
      <div className="stat"><span className="eyebrow eyebrow--flush">Contracts</span><span className="stat__value">{count}</span></div>
      <div className="stat"><span className="eyebrow eyebrow--flush">Ready to print</span><span className="stat__value">{ready}</span></div>
      <div className="stat">
        <span className="eyebrow eyebrow--flush">Escalation payable, all contracts</span>
        <span className={`stat__value${payable < 0 ? ' num--negative' : ''}`}>₹{formatRupees(payable, 0)}</span>
      </div>
    </div>
  );
}

export function ContractsPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ContractSummary[] | null>(null);
  const [agreementNo, setAgreementNo] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { view, refresh } = useEntitlement();
  const e = view?.configured ? view.entitlement : null;
  const band = view ? contractsBand(view, new Date()) : null;
  const ended = view ? planState(view) === 'ended' : false;

  // Creating and deleting change the contract count, so the plan is re-read too.
  const load = () => {
    api.listContracts().then(setRows).catch((err: Error) => setError(err.message));
    void refresh();
  };
  useEffect(load, []);

  async function create(ev: FormEvent) {
    ev.preventDefault();
    setBusy(true);
    try {
      const { id } = await api.createContract(agreementNo.trim());
      navigate(`/c/${id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function remove(row: ContractSummary) {
    setConfirming(null);
    try {
      await api.deleteContract(row.id);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <main className="app-main">
      <div className="app-head">
        <div>
          <h1 className="title">Contracts</h1>
          <p className="subtitle">Every agreement this account has prepared</p>
        </div>
        <form onSubmit={create} className="inline-create">
          <label className="sr-only" htmlFor="agreement-no">Agreement number</label>
          <input id="agreement-no" value={agreementNo} onChange={(ev) => setAgreementNo(ev.target.value)}
                 placeholder={e?.readOnly ? 'Subscribe to start new contracts' : 'Agreement number, e.g. 168 of 2023-24'}
                 disabled={e?.readOnly ?? false} required />
          <button type="submit" disabled={busy || !agreementNo.trim() || (e ? !e.canCreate : false)}>
            New contract
          </button>
        </form>
      </div>

      {error && <p className="notice">{error}</p>}

      {band === 'read_only' && e && (
        <Band lock action={<Link to="/plans" className="button">{ended ? 'Renew' : 'See plans'}</Link>}>
          <strong>
            {ended ? 'Your plan has ended.' : 'The free plan keeps one contract editable.'}{' '}
            All {e.contractCount} contracts are read-only — nothing has been deleted.
          </strong>
          <span className="band__detail">
            You can still open and print every bill. Subscribe to edit them again, or delete down to
            one contract to keep editing it on the free plan.
          </span>
        </Band>
      )}
      {band === 'retrying' && (
        <Band action={<Link to="/profile" className="ghost">Your account</Link>}>
          Razorpay could not collect your last payment and will retry on its own. You keep unlimited
          contracts meanwhile; if every retry fails, the plan ends.
        </Band>
      )}
      {band === 'ending_soon' && view?.subscription?.currentEnd && (
        <Band tone="neutral">
          Your plan ends on {formatDate(isoDay(view.subscription.currentEnd))}.
          {e && e.contractCount > 1
            ? ` After that your ${e.contractCount} contracts can only be viewed and printed until you subscribe again.`
            : ' After that you are back on the free plan.'}
        </Band>
      )}

      {e && !e.canCreate && !e.readOnly && (
        <Band action={<Link to="/plans" className="button">See plans</Link>}>
          The free plan holds one contract. Subscribe for unlimited contracts — or delete the one below
          to start a new one for free.
        </Band>
      )}

      {rows && rows.length > 0 && <Stats rows={rows} />}

      {rows === null ? <Spinner />
        : rows.length === 0 ? (
          <div className="panel">
            <div className="empty">
              <p className="empty__title">Start your first contract</p>
              <p className="empty__body">
                Give it an agreement number at the top right. You can fill in the particulars,
                the days worked and the rates chart afterwards — the bill builds up
                as you go, and tells you what it still needs.
              </p>
            </div>
          </div>
        ) : (
          <div className="panel panel--flush scroller">
            <table className="grid">
              <thead>
                <tr>
                  <th>Agreement</th>
                  <th>Work</th>
                  <th>Status</th>
                  <th className="r">Payable</th>
                  <th>Last edited</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {e?.readOnly && <LockIcon label="Read-only" />}
                      <Link to={`/c/${r.id}`} className="cell-link">{r.agreementNo}</Link>
                      {r.contractor && <span className="cell-sub">{r.contractor}</span>}
                    </td>
                    <td className="work">
                      {r.workName || <span className="hint">—</span>}
                    </td>
                    <td><Status row={r} /></td>
                    <td className="num">
                      {r.payable === null
                        ? <span className="num--muted">—</span>
                        : <span className={r.payable < 0 ? 'num--negative' : undefined}>
                            ₹{formatRupees(r.payable)}
                          </span>}
                    </td>
                    <td className="hint">{formatWhen(r.updatedAt)}</td>
                    <td className="actions">
                      {confirming === r.id ? (
                        <span className="confirm">
                          <span className="confirm__text">Delete this agreement and its figures?</span>
                          <button className="danger small" onClick={() => void remove(r)}>Delete</button>
                          <button className="ghost small" onClick={() => setConfirming(null)}>Keep</button>
                        </span>
                      ) : (
                        <button className="erase" aria-label={`Delete agreement ${r.agreementNo}`}
                                onClick={() => setConfirming(r.id)}>×</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </main>
  );
}
