import { Link } from 'react-router-dom';
import type { Period } from '../api.ts';
import { formatPaise, isoDay, PERIOD_LABEL } from '../billing.ts';
import { useEntitlement } from '../entitlement.tsx';
import { formatDate } from '../format.ts';
import { Spinner } from './Spinner.tsx';

/** What the plans page shows once Razorpay has the payment: waiting, landed, or not. */
export function CheckoutStatus({ phase, period, gaveUp, onRetry }: {
  phase: 'confirming' | 'done' | 'failed';
  period: Period;
  gaveUp: boolean;
  onRetry: () => void;
}) {
  const { view } = useEntitlement();

  if (phase === 'confirming') {
    return (
      <section className="settings__body">
        <Spinner />
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
      </section>
    );
  }

  if (phase === 'done') {
    const latest = view?.charges[0];
    return (
      <section className="settings__body">
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
            <div className="ledger-line"><span>Renews on</span><span>{formatDate(isoDay(view.subscription.currentEnd))}</span></div>
          )}
          <div className="ledger-line"><span>Receipt</span><span>Emailed to you by Razorpay</span></div>
        </div>
        <div className="row stack-md">
          <Link to="/" className="button">Go to contracts</Link>
          <Link to="/profile" className="ghost">Your account</Link>
        </div>
      </section>
    );
  }

  return (
    <section className="settings__body">
      <span className="pill pill--bad">Payment not completed</span>
      <h1 className="title stack-sm">Nothing was charged</h1>
      <p className="stack-sm">
        The mandate was not approved — the Razorpay window was closed, or the bank declined it. Your
        account is on the plan it was on, and your contracts are untouched.
      </p>
      <div className="row stack-md">
        <button onClick={onRetry}>Back to plans</button>
      </div>
    </section>
  );
}
