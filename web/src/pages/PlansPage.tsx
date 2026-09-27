import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Period, type PlanPrice } from '../api.ts';
import {
  formatPaise, nextRenewal, PERIOD_EVERY, PERIOD_LABEL, PERIOD_PER, PERIODS, planState,
} from '../billing.ts';
import { RunningHead } from '../components/RunningHead.tsx';
import { Spinner } from '../components/Spinner.tsx';
import { useEntitlement } from '../entitlement.tsx';
import { formatDate } from '../format.ts';

/** A plan that is running blocks a second one: Razorpay would take two mandates. */
const RUNNING = new Set(['active', 'retrying', 'ending']);

export function PlansPage() {
  const { view } = useEntitlement();
  const [plans, setPlans] = useState<PlanPrice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('yearly');

  useEffect(() => { api.plans().then(setPlans).catch((e: Error) => setError(e.message)); }, []);

  const state = view ? planState(view) : 'free';
  const chosen = plans?.find((p) => p.period === period);
  const today = new Date();
  const e = view?.entitlement;

  return (
    <main className="page">
      <RunningHead identity="Price Escalation" sub="Choose a plan" />
      <Link to="/" className="rail-back">← All contracts</Link>
      <div className="page-head stack-sm">
        <div>
          <h1 className="title">Choose a plan</h1>
          <p className="subtitle">
            Every paid plan is the same plan — unlimited contracts. Only how often you are billed changes.
          </p>
        </div>
      </div>

      {error && <p className="notice">{error}</p>}
      {RUNNING.has(state) && (
        <p className="notice notice--ok">
          This account already has a subscription. Manage it from <Link to="/profile">Your account</Link>.
        </p>
      )}

      {plans === null && !error ? <Spinner /> : plans && (
        <div className="plans">
          <div>
            <p className="eyebrow">Billing period</p>
            <div className="plan-list" role="radiogroup" aria-label="Billing period">
              <div className="plan-row plan-row--current">
                <span aria-hidden="true">—</span>
                <span>
                  <strong>Free</strong>
                  <span className="plan-row__sub">One contract, kept for as long as you like</span>
                </span>
                <span className="row row--tight">
                  {state === 'free' && <span className="pill pill--idle">Current plan</span>}
                  <span className="plan-row__price">₹0</span>
                </span>
              </div>
              {PERIODS.map((p) => {
                const price = plans.find((x) => x.period === p);
                return (
                  <label key={p} className="plan-row">
                    <input type="radio" name="period" value={p} checked={period === p}
                           onChange={() => setPeriod(p)} />
                    <span>
                      <strong>{PERIOD_LABEL[p]}</strong>
                      <span className="plan-row__sub">{PERIOD_EVERY[p]}, renews automatically</span>
                    </span>
                    <span>
                      <span className="plan-row__price">{price ? formatPaise(price.amountPaise) : '—'}</span>
                      <span className="plan-row__sub">{PERIOD_PER[p]}</span>
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="section-head"><h2>Free and paid, side by side</h2></div>
            <table className="grid">
              <thead><tr><th /><th>Free</th><th>Paid</th></tr></thead>
              <tbody>
                <tr><td>Contracts</td><td className="num num--left">1</td><td className="strong">Unlimited</td></tr>
                <tr><td>Rates chart, calculation, printed bill</td><td>Included</td><td>Included</td></tr>
                <tr><td>If the plan ends</td><td className="hint">—</td><td>Contracts turn read-only. Nothing is deleted.</td></tr>
                <tr><td>Cancel</td><td className="hint">—</td><td>Any time; access runs to the paid-until date</td></tr>
              </tbody>
            </table>
          </div>

          <aside className="panel summary">
            <span className="eyebrow eyebrow--flush">Your selection</span>
            <div>
              <div className="summary__price">{chosen ? formatPaise(chosen.amountPaise) : '—'}</div>
              <div className="hint">{PERIOD_EVERY[period]}, renews automatically</div>
            </div>
            <div>
              <div className="ledger-line"><span>Plan</span><span>Unlimited contracts</span></div>
              <div className="ledger-line"><span>Starts</span><span>{formatDate(today.toISOString().slice(0, 10))}</span></div>
              <div className="ledger-line"><span>First renewal</span><span>{formatDate(nextRenewal(period, today))}</span></div>
              <div className="ledger-line"><span>Pay by</span><span>UPI Autopay, card or netbanking</span></div>
            </div>
            {RUNNING.has(state) ? (
              <button type="button" disabled>Continue</button>
            ) : (
              <Link to={`/plans/checkout?period=${period}`} className="button">
                Continue — {chosen ? formatPaise(chosen.amountPaise) : ''}
              </Link>
            )}
            {e?.source === 'grant' && (
              <p className="hint">
                Access granted by an administrator runs until {formatDate(e.paidUntil ?? '')}. A subscription
                starts today, alongside it.
              </p>
            )}
            <p className="hint">Payment is handled by Razorpay. This site never sees your card or UPI details.</p>
          </aside>
        </div>
      )}
    </main>
  );
}
