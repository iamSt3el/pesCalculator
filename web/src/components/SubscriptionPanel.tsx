import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api.ts';
import { formatPaise, isoDay, PERIOD_LABEL, planState } from '../billing.ts';
import { useEntitlement } from '../entitlement.tsx';
import { formatDate } from '../format.ts';

const STATUS = {
  admin: { pill: 'pill pill--ok', label: 'Administrator' },
  free: { pill: 'pill pill--idle', label: 'Free' },
  active: { pill: 'pill pill--ok', label: 'Active' },
  retrying: { pill: 'pill pill--warn', label: 'Payment retrying' },
  ending: { pill: 'pill pill--idle', label: 'Ending' },
  ended: { pill: 'pill pill--bad', label: 'Ended' },
  granted: { pill: 'pill pill--ok', label: 'Granted' },
} as const;

/** The plan, its one date that matters, and at most one action. */
export function SubscriptionPanel() {
  const { view, refresh } = useEntitlement();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!view?.configured) return null;
  const state = planState(view);
  const { entitlement: e, subscription: s } = view;
  const end = s?.currentEnd ? formatDate(isoDay(s.currentEnd)) : '—';
  const lastCharge = view.charges[0];

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      await api.cancelSubscription();
      await refresh();
      setConfirming(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not cancel');
    } finally {
      setBusy(false);
    }
  }

  const name = s && (state === 'active' || state === 'retrying' || state === 'ending')
    ? `Unlimited — ${PERIOD_LABEL[s.period].toLowerCase()}`
    : state === 'granted' || state === 'admin' ? 'Unlimited contracts'
    : state === 'ended' ? 'Plan ended' : 'Free plan';

  return (
    <>
      <div className="section-head" id="subscription"><h2>Subscription</h2></div>
      <div className="panel summary">
        <div className="spread">
          <span className="rail-title">{name}</span>
          <span className={STATUS[state].pill}>{state === 'ending' ? `Ends ${end}` : STATUS[state].label}</span>
        </div>

        {state === 'free' && (
          <>
            <p className="flush">{e.contractCount} of {e.limit} contract used. Subscribe for unlimited contracts.</p>
            <div><Link to="/plans" className="button">See plans</Link></div>
          </>
        )}
        {state === 'admin' && <p className="flush">Administrators are never limited.</p>}
        {state === 'active' && (
          <p className="flush">
            Renews on {end}{lastCharge ? ` for ${formatPaise(lastCharge.amountPaise)}` : ''}, through Razorpay.
          </p>
        )}
        {state === 'retrying' && (
          <>
            <p className="flush">
              Razorpay could not collect the last payment and will try again automatically. You keep
              unlimited contracts meanwhile.
            </p>
            <p className="hint flush">If every retry fails, the plan ends and you can subscribe again.</p>
          </>
        )}
        {state === 'ending' && (
          <p className="flush">
            Auto-renew is off and nothing more will be charged. Unlimited contracts until {end}; after that,
            subscribe again to keep editing more than one.
          </p>
        )}
        {state === 'ended' && (
          <>
            <p className="flush">
              {e.readOnly
                ? `Your ${e.contractCount} contracts are read-only. Nothing has been deleted — open and print them any time.`
                : 'You are back on the free plan.'}
            </p>
            <div><Link to="/plans" className="button">Renew</Link></div>
          </>
        )}
        {state === 'granted' && (
          <p className="flush">
            An administrator gave this account unlimited contracts until {formatDate(view.grant?.until ?? '')}.
            No payment is due.
          </p>
        )}

        {(state === 'active' || state === 'retrying') && (
          <div className="divider">
            {confirming ? (
              <span className="confirm">
                <span className="confirm__text">Stop renewing? You keep unlimited contracts until {end}.</span>
                <button className="danger small" disabled={busy} onClick={() => void cancel()}>Stop renewing</button>
                <button className="ghost small" onClick={() => setConfirming(false)}>Keep</button>
              </span>
            ) : (
              <button className="danger" onClick={() => setConfirming(true)}>Cancel auto-renew</button>
            )}
          </div>
        )}
        {error && <p className="notice flush">{error}</p>}
      </div>

      {view.charges.length > 0 && (
        <>
          <div className="section-head" id="payments"><h2>Payments</h2></div>
          <div className="panel panel--flush">
            <table className="grid">
              <thead>
                <tr><th>Date</th><th>Plan</th><th className="r">Amount</th><th>Reference</th></tr>
              </thead>
              <tbody>
                {view.charges.map((c) => (
                  <tr key={c.paymentId}>
                    <td>{formatDate(isoDay(c.paidAt))}</td>
                    <td>{PERIOD_LABEL[c.period]}</td>
                    <td className="num">{formatPaise(c.amountPaise)}</td>
                    <td className="num num--left">{c.paymentId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint stack-sm">Razorpay emails a receipt for every payment.</p>
        </>
      )}
    </>
  );
}
