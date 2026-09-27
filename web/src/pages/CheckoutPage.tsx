import { useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { api, type Period, type PlanPrice } from '../api.ts';
import { formatPaise, nextRenewal, PERIOD_LABEL, PERIODS, subscriptionActive } from '../billing.ts';
import { RunningHead } from '../components/RunningHead.tsx';
import { Spinner } from '../components/Spinner.tsx';
import { useEntitlement } from '../entitlement.tsx';
import { formatDate } from '../format.ts';
import { loadRazorpay } from '../razorpay.ts';

type Phase = 'confirm' | 'paying' | 'confirming' | 'done' | 'failed';

const POLL_MS = 3000;
const POLL_TRIES = 20;

const isPeriod = (v: string | null): v is Period => PERIODS.includes(v as Period);

export function CheckoutPage() {
  const [params] = useSearchParams();
  const raw = params.get('period');
  const { view, refresh } = useEntitlement();
  const [plans, setPlans] = useState<PlanPrice[] | null>(null);
  const [phase, setPhase] = useState<Phase>('confirm');
  const [error, setError] = useState<string | null>(null);
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => { api.plans().then(setPlans).catch((e: Error) => setError(e.message)); }, []);

  // Confirming: ask until the plan is on, then stop. The plan still switches on
  // by itself later if this gives up — the webhook or the next load lands it.
  useEffect(() => {
    if (phase !== 'confirming') return;
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      api.billing().then((v) => {
        if (subscriptionActive(v)) { clearInterval(timer); void refresh(); setPhase('done'); }
      }).catch(() => {});
      if (tries >= POLL_TRIES) { clearInterval(timer); setGaveUp(true); }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [phase, refresh]);

  if (!isPeriod(raw)) return <Navigate to="/plans" replace />;
  const period = raw;
  const price = plans?.find((p) => p.period === period);
  const amount = price ? formatPaise(price.amountPaise) : '—';
  const today = new Date().toISOString().slice(0, 10);

  async function pay() {
    setError(null);
    setPhase('paying');
    try {
      const [Razorpay, started] = await Promise.all([loadRazorpay(), api.subscribe(period)]);
      const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
      const checkout = new Razorpay({
        key: started.keyId,
        subscription_id: started.subscriptionId,
        name: 'Price Escalation',
        description: `Unlimited contracts — ${PERIOD_LABEL[period].toLowerCase()}`,
        prefill: { email: started.email },
        theme: { color: accent },
        handler: (result) => {
          setPhase('confirming');
          api.verifySubscription(result)
            .then((v) => { if (subscriptionActive(v)) { void refresh(); setPhase('done'); } })
            .catch(() => { /* stay on Confirming; the poll takes over */ });
        },
        modal: { ondismiss: () => setPhase((p) => (p === 'paying' ? 'failed' : p)) },
      });
      checkout.on('payment.failed', () => setPhase('failed'));
      checkout.open();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the payment');
      setPhase('confirm');
    }
  }

  if (phase === 'confirming') {
    return (
      <main className="page page--medium">
        <RunningHead identity="Subscription" sub="Confirming" />
        <div className="stack-lg"><Spinner /></div>
        <p className="eyebrow stack-md">Mandate approved</p>
        <h1 className="title">Confirming your payment</h1>
        <p className="stack-sm">
          Razorpay has your approval. Your plan switches on the moment they confirm the first charge —
          usually a few seconds.
        </p>
        <p className="hint stack-sm">
          {gaveUp
            ? 'This is taking longer than usual. You can leave this page: the plan switches on by itself when the confirmation arrives, and Your account will show it.'
            : 'You can leave this page. If it takes longer, the plan still switches on by itself.'}
        </p>
        <p className="stack-md"><Link to="/">Back to contracts</Link></p>
      </main>
    );
  }

  if (phase === 'done') {
    const latest = view?.charges[0];
    return (
      <main className="page page--medium">
        <RunningHead identity="Subscription" sub="Payment received" />
        <span className="pill pill--ok">Payment received</span>
        <h1 className="title stack-sm">Unlimited contracts, billed {PERIOD_LABEL[period].toLowerCase()}</h1>
        <div className="summary stack-md">
          {latest && (
            <>
              <div className="ledger-line"><span>Paid today</span><span className="num">{formatPaise(latest.amountPaise)}</span></div>
              <div className="ledger-line"><span>Payment reference</span><span className="num">{latest.paymentId}</span></div>
            </>
          )}
          {view?.subscription?.currentEnd && (
            <div className="ledger-line"><span>Renews on</span><span>{formatDate(view.subscription.currentEnd.slice(0, 10))}</span></div>
          )}
          <div className="ledger-line"><span>Receipt</span><span>Emailed to you by Razorpay</span></div>
        </div>
        <div className="row stack-md">
          <Link to="/" className="button">Start a contract</Link>
          <Link to="/profile" className="ghost">Your account</Link>
        </div>
      </main>
    );
  }

  if (phase === 'failed') {
    return (
      <main className="page page--medium">
        <RunningHead identity="Subscription" sub="Payment not completed" />
        <span className="pill pill--bad">Payment not completed</span>
        <h1 className="title stack-sm">Nothing was charged</h1>
        <p className="stack-sm">
          The mandate was not approved — the Razorpay window was closed, or the bank declined it. Your
          account is on the plan it was on, and your contracts are untouched.
        </p>
        <div className="row stack-md">
          <button onClick={() => void pay()}>Try again</button>
          <Link to="/plans" className="ghost">Choose another plan</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="page page--medium">
      <RunningHead identity="Subscription" sub="Confirm and pay" />
      <Link to="/plans" className="rail-back">← Change plan</Link>
      <h1 className="title stack-sm">Confirm your subscription</h1>

      {error && <p className="notice">{error}</p>}

      {plans === null && !error ? <Spinner /> : (
        <>
          <div className="summary stack-md">
            <div className="ledger-line"><span>Plan</span><span className="strong">Unlimited contracts</span></div>
            <div className="ledger-line"><span>Billed</span><span>{PERIOD_LABEL[period]}</span></div>
            <div className="ledger-line"><span>Starts</span><span>{formatDate(today)}</span></div>
            <div className="ledger-line"><span>Next charge</span><span>{formatDate(nextRenewal(period, new Date()))}, automatically</span></div>
            <div className="bill-total__final">
              <span>Due today</span>
              <span className="payable">{amount}</span>
            </div>
          </div>

          <div className="section-head"><h2>How the payment works</h2></div>
          <ol className="steps">
            <li>Razorpay opens its payment window over this page.</li>
            <li>You approve a UPI Autopay, card or netbanking mandate once. Every renewal is then charged automatically.</li>
            <li>Your plan switches on as soon as Razorpay confirms the payment — usually within seconds.</li>
          </ol>

          <div className="row stack-lg">
            <button onClick={() => void pay()} disabled={phase === 'paying' || !price}>
              {phase === 'paying' ? 'Opening Razorpay…' : `Pay ${amount} with Razorpay`}
            </button>
            <Link to="/plans" className="ghost">Cancel</Link>
          </div>
          <p className="hint stack-sm">
            Cancel auto-renew at any time from Your account. You keep unlimited contracts until the end of
            the period you have paid for.
          </p>
        </>
      )}
    </main>
  );
}
