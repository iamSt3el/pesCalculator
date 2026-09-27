import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type PlanPrice } from '../api.ts';
import { formatPaise, PERIOD_LABEL, PERIOD_PER, PERIODS } from '../billing.ts';
import { SiteFooter } from '../components/SiteFooter.tsx';
import { ThemeToggle } from '../components/ThemeToggle.tsx';

/**
 * What a visitor sees before signing in: what the app does, what it costs, and
 * who is behind it. Razorpay's review needs all three visible without an account.
 */
export function LandingPage() {
  // null while loading; [] when paid plans are not on sale yet.
  const [plans, setPlans] = useState<PlanPrice[] | null>(null);
  useEffect(() => { api.plans().then(setPlans).catch(() => setPlans([])); }, []);

  return (
    <main className="page page--medium">
      <div className="page-head">
        <span className="running-head__name">Price Escalation</span>
        <div className="row">
          <ThemeToggle />
          <Link to="/signin" className="ghost">Sign in</Link>
        </div>
      </div>

      <h1 className="title">Clause-45 price escalation bills, without the spreadsheet</h1>
      <p className="subtitle">
        For PWD road contracts in Rajasthan. Enter the published rate indices once and each contract's
        particulars; the base rates, quarterly averages and the escalation payable are derived for you.
      </p>
      <div className="row stack-md">
        <Link to="/signin" className="button">Create an account</Link>
        <span className="hint">Free for your first contract. No card needed.</span>
      </div>

      <div className="section-head"><h2>What it does</h2></div>
      <ol className="steps">
        <li>Keeps one rates chart of the published indices, shared by every contract you prepare.</li>
        <li>Takes each agreement's particulars, component shares and days worked, span by span or as executed.</li>
        <li>Works out the index averages, base rates and escalation, and flags anything missing or out of balance.</li>
        <li>Prints the bill as a filed set of sheets.</li>
      </ol>

      <div className="section-head"><h2>Pricing</h2></div>
      <div className="panel panel--flush">
        <table className="grid">
          <thead><tr><th>Plan</th><th>Contracts</th><th className="r">Price</th></tr></thead>
          <tbody>
            <tr><td>Free</td><td>1</td><td className="num">₹0</td></tr>
            {plans && plans.length > 0 && PERIODS.map((p) => {
              const price = plans.find((x) => x.period === p);
              return (
                <tr key={p}>
                  <td>{PERIOD_LABEL[p]}</td>
                  <td>Unlimited</td>
                  <td className="num">{price ? `${formatPaise(price.amountPaise)} ${PERIOD_PER[p]}` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="hint stack-sm">
        {plans && plans.length === 0
          ? 'Paid plans are not on sale yet. Everything is free until they are.'
          : 'Paid plans renew automatically through Razorpay until you cancel. Cancel any time; you keep access to the end of the period you paid for. If a plan ends, your contracts turn read-only — nothing is deleted.'}
      </p>

      <SiteFooter />
    </main>
  );
}
