import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, type Period, type PlanPrice } from '../api.ts';
import {
  formatPaise, nextRenewal, PERIOD_EVERY, PERIOD_LABEL, PERIODS, planState,
} from '../billing.ts';
import { CheckoutStatus } from '../components/CheckoutStatus.tsx';
import { Spinner } from '../components/Spinner.tsx';
import { useEntitlement } from '../entitlement.tsx';
import { formatDate } from '../format.ts';
import { useCheckout } from '../useCheckout.ts';

/** A plan that is running blocks a second one: Razorpay would take two mandates. */
const RUNNING = new Set(['active', 'retrying', 'ending']);

const isPeriod = (v: string | null): v is Period => PERIODS.includes(v as Period);

/** Choose a period and pay, on one screen: the choice on the left, what you are paying on the right. */
export function PlansPage() {
  const [params] = useSearchParams();
  const asked = params.get('period');
  const [period, setPeriod] = useState<Period>(isPeriod(asked) ? asked : 'yearly');
  const { view } = useEntitlement();
  const [plans, setPlans] = useState<PlanPrice[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const checkout = useCheckout();

  useEffect(() => { api.plans().then(setPlans).catch((e: Error) => setLoadError(e.message)); }, []);

  if (checkout.phase === 'confirming' || checkout.phase === 'done' || checkout.phase === 'failed') {
    return (
      <main className="app-main">
        <CheckoutStatus phase={checkout.phase} period={period} gaveUp={checkout.gaveUp} onRetry={checkout.reset} />
      </main>
    );
  }

  const state = view ? planState(view) : 'free';
  const running = RUNNING.has(state);
  const chosen = plans?.find((p) => p.period === period);
  const amount = chosen ? formatPaise(chosen.amountPaise) : '—';
  const today = new Date();
  const e = view?.entitlement;
  const error = loadError ?? checkout.error;

  return (
    <main className="app-main">
      <div className="app-head">
        <div>
          <h1 className="title">Choose a plan</h1>
          <p className="subtitle">
            Every paid plan is the same plan — unlimited contracts. Only how often you are billed changes.
          </p>
        </div>
      </div>

      {error && <p className="notice">{error}</p>}
      {running && (
        <p className="notice notice--ok">
          This account already has a subscription. Manage it from <Link to="/profile">Your account</Link>.
        </p>
      )}

      {plans === null && !loadError ? <Spinner /> : plans && (
        <div className="checkout">
          <div>
            <div className="plan-options" role="radiogroup" aria-label="Billing period">
              {PERIODS.map((p) => {
                const price = plans.find((x) => x.period === p);
                return (
                  <label key={p} className="plan-option">
                    <input type="radio" name="period" value={p} checked={period === p}
                           onChange={() => setPeriod(p)} />
                    <span>
                      <strong>{PERIOD_LABEL[p]}</strong>
                      <span className="plan-option__sub">{PERIOD_EVERY[p]}</span>
                    </span>
                    <span className="plan-option__price">{price ? formatPaise(price.amountPaise) : '—'}</span>
                  </label>
                );
              })}
            </div>

            <div className="section-head"><h2>How the payment works</h2></div>
            <ol className="steps">
              <li>Razorpay opens its payment window over this page.</li>
              <li>You approve a UPI Autopay, card or netbanking mandate once. Every renewal is then charged automatically.</li>
              <li>Your plan switches on as soon as Razorpay confirms the payment — usually within seconds.</li>
            </ol>

            <div className="section-head"><h2>Free and paid</h2></div>
            <table className="grid">
              <thead><tr><th /><th>Free</th><th>Paid</th></tr></thead>
              <tbody>
                <tr><td>Contracts</td><td className="num num--left">1</td><td className="strong">Unlimited</td></tr>
                <tr><td>Rates chart, calculation, printed bill</td><td>Included</td><td>Included</td></tr>
                <tr><td>If the plan ends</td><td className="hint">—</td><td>Contracts turn read-only. Nothing is deleted.</td></tr>
              </tbody>
            </table>
          </div>

          <aside className="order">
            <span className="eyebrow eyebrow--flush">Order summary</span>
            <div>
              <div className="ledger-line"><span>Plan</span><span>Unlimited — {PERIOD_LABEL[period].toLowerCase()}</span></div>
              <div className="ledger-line"><span>Starts</span><span>{formatDate(today.toISOString().slice(0, 10))}</span></div>
              <div className="ledger-line"><span>Next charge</span><span>{formatDate(nextRenewal(period, today))}</span></div>
              <div className="ledger-line"><span>Pay by</span><span>UPI Autopay, card or netbanking</span></div>
            </div>
            <div className="spread">
              <span className="strong">Due today</span>
              <span className="payable">{amount}</span>
            </div>
            <button onClick={() => void checkout.pay(period)}
                    disabled={running || !chosen || checkout.phase === 'paying'}>
              {checkout.phase === 'paying' ? 'Opening Razorpay…' : `Pay ${amount} with Razorpay`}
            </button>
            {e?.source === 'grant' && (
              <p className="hint flush">
                Access granted by an administrator runs until {formatDate(e.paidUntil ?? '')}. A subscription
                starts today, alongside it.
              </p>
            )}
            <p className="hint flush">
              Cancel auto-renew any time from Your account. By paying you agree to
              the <Link to="/terms">terms</Link> and the <Link to="/refunds">refund and cancellation policy</Link>.
            </p>
          </aside>
        </div>
      )}
    </main>
  );
}
