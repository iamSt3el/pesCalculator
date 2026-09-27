import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type PlanPrice } from '../api.ts';
import { formatPaise, PERIOD_EVERY, PERIOD_LABEL, PERIODS } from '../billing.ts';
import { Brand } from '../components/Brand.tsx';
import { SITE } from '../site.ts';

const FEATURES: Array<[string, string]> = [
  ['Shared rates chart', 'Published indices entered once, month by month, and read by every contract. A month a bill needs but the chart lacks is flagged, with a one-click add.'],
  ['Span-wise or execution-wise', 'Record days worked across the four spans, or the expenditure as executed, month by month. The schedule of payment bills from whichever you choose.'],
  ['Every equation on show', 'Each escalation line is laid out operand by operand — factor, share, value, current and base index — so the bill can be audited straight down.'],
  ['Problems, then the fix', 'The app lists what is missing or out of balance and links each item to the stage that owns it. A bill with open items prints marked provisional.'],
  ['Printed as a filed set', 'A4 sheets with margins, the agreement named on each, and the date prepared.'],
];

/**
 * What a visitor sees before signing in: what the app does, what it costs, and
 * who is behind it. Razorpay's review needs all three visible without an account.
 */
export function LandingPage() {
  // null while loading; [] when paid plans are not on sale yet.
  const [plans, setPlans] = useState<PlanPrice[] | null>(null);
  useEffect(() => { api.plans().then(setPlans).catch(() => setPlans([])); }, []);
  const onSale = plans !== null && plans.length > 0;

  return (
    <div>
      <div className="band-dark">
        <header className="public-bar">
          <Brand />
          <nav className="row" aria-label="Site">
            <a className="navlink" href="#features">Features</a>
            <a className="navlink" href="#pricing">Pricing</a>
            <Link className="navlink" to="/contact">Contact</Link>
          </nav>
          <div className="public-bar__end">
            <Link to="/signin" className="button--outline">Sign in</Link>
            <Link to="/signin?create=1" className="button button--light">Create free account</Link>
          </div>
        </header>

        <section className="hero">
          <div>
            <span className="eyebrow">Clause-45 · PWD Rajasthan</span>
            <h1 className="hero__title">The escalation bill, worked out for you.</h1>
            <p className="hero__lede">
              Rates chart, index averages, base rates and the payable — kept in one place, recalculated the
              moment a figure changes, and printed ready to file.
            </p>
            <div className="row">
              <Link to="/signin?create=1" className="button button--light">Create free account</Link>
              <a href="#pricing" className="button--outline">See pricing</a>
            </div>
          </div>
          <div className="hero__facts">
            <div>
              <div className="hero__value">₹1,72,604</div>
              <div className="hero__note">
                Agreement 168 of 2023-24, reproduced from the original workbook to the paisa
              </div>
            </div>
            <div>
              <div className="hero__value">2</div>
              <div className="hero__note">
                things typed by hand — the published indices and the contract’s particulars
              </div>
            </div>
          </div>
        </section>
      </div>

      <section id="features" className="public-section">
        <span className="eyebrow">What you get</span>
        <h2 className="section-title">Built like a ledger, so every figure can be checked.</h2>
        <div className="feature-rows">
          {FEATURES.map(([title, body]) => (
            <div key={title} className="feature-row">
              <span className="strong">{title}</span>
              <span>{body}</span>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="public-section public-section--sunk">
        <div className="public-section__head">
          <div>
            <span className="eyebrow">Pricing</span>
            <h2 className="section-title">One plan. Choose how often you pay.</h2>
          </div>
          <p className="hint flush public-section__note">
            {onSale
              ? 'Renews through Razorpay until you cancel. Cancel any time and keep access to the end of the period. Nothing is ever deleted.'
              : 'Paid plans are not on sale yet. Everything is free until they are.'}
          </p>
        </div>
        <div className="panel panel--flush stack-md">
          <table className="grid">
            <thead><tr><th>Plan</th><th>Contracts</th><th>Billed</th><th className="r">Price</th><th /></tr></thead>
            <tbody>
              <tr>
                <td className="strong">Free</td><td>1</td><td className="hint">—</td><td className="num">₹0</td>
                <td className="actions"><Link to="/signin?create=1" className="ghost">Start free</Link></td>
              </tr>
              {onSale && PERIODS.map((p) => {
                const price = plans.find((x) => x.period === p);
                return (
                  <tr key={p}>
                    <td className="strong">{PERIOD_LABEL[p]}</td>
                    <td>Unlimited</td>
                    <td>{PERIOD_EVERY[p]}</td>
                    <td className="num">{price ? formatPaise(price.amountPaise) : '—'}</td>
                    <td className="actions"><Link to={`/signin?create=1&plan=${p}`} className="button">Choose</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="band-dark public-foot">
        <div className="public-foot__row">
          <div className="stack">
            <Brand />
            <span className="hero__note">Operated by {SITE.operator} · {SITE.email}</span>
          </div>
          <nav className="row" aria-label="Policies">
            <Link className="navlink" to="/terms">Terms</Link>
            <Link className="navlink" to="/privacy">Privacy</Link>
            <Link className="navlink" to="/refunds">Refunds and cancellation</Link>
            <Link className="navlink" to="/contact">Contact</Link>
          </nav>
        </div>
        <div className="public-foot__row">
          <span>© {new Date().getFullYear()} {SITE.operator}</span>
          <span>Payments processed by Razorpay</span>
        </div>
      </footer>
    </div>
  );
}
