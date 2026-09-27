import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { SiteFooter } from '../components/SiteFooter.tsx';
import { SITE } from '../site.ts';

/**
 * The four pages a payment gateway's review asks for. They describe what this
 * app actually does — keep them in step with it when the billing rules change.
 */
function Policy({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="page page--medium">
      <Link to="/" className="rail-back">← {SITE.name}</Link>
      <h1 className="title stack-sm">{title}</h1>
      <p className="hint">Effective {SITE.effective}</p>
      <div className="prose">{children}</div>
      <SiteFooter />
    </main>
  );
}

export function TermsPage() {
  return (
    <Policy title="Terms of service">
      <p>
        {SITE.name} is a web application operated by {SITE.operator} ("we"). It prepares price
        escalation bills under Clause-45 for PWD road contracts from figures you enter. By creating an
        account you agree to these terms.
      </p>

      <h2>Your account</h2>
      <p>
        You need an email address and a password of at least 12 characters. Keep the password to
        yourself; you are responsible for what is done with your account. There is no email-based
        password recovery — contact us if you lose access.
      </p>

      <h2>What the calculations are</h2>
      <p>
        The app computes escalation from the indices and particulars you enter. It is a tool for
        preparing a bill, not advice: check every bill before you submit it, and rely on the contract
        and the department's rules where they differ from what the app shows. We are not liable for a
        bill submitted, paid or refused on the strength of the app's figures.
      </p>

      <h2>Plans and payment</h2>
      <ul>
        <li>The free plan keeps one contract. A paid plan keeps any number.</li>
        <li>
          Paid plans are billed monthly, every 6 months or yearly, in Indian rupees, through Razorpay.
          They renew automatically at the end of each period until you cancel.
        </li>
        <li>
          You can cancel auto-renew at any time from Your account. You keep the paid plan until the end
          of the period already paid for; nothing more is charged.
        </li>
        <li>
          If a plan ends — cancelled, or a renewal that cannot be collected — an account holding more
          than one contract becomes read-only. Every contract can still be opened and printed, and none
          is deleted. Subscribing again, or deleting down to one contract, makes them editable again.
        </li>
        <li>Refunds are covered by the <Link to="/refunds">refund and cancellation policy</Link>.</li>
        <li>Prices may change; a change applies from your next renewal, and we will show it on this site first.</li>
      </ul>

      <h2>Acceptable use</h2>
      <p>
        Use the app for preparing escalation bills. Do not try to reach other accounts' data, disrupt the
        service, or resell access. We may suspend an account that does.
      </p>

      <h2>The service</h2>
      <p>
        We work to keep the app available and your data safe, but provide it as it is, without a promise
        of uninterrupted service. Our liability for any claim is limited to the amount you paid us in the
        twelve months before it.
      </p>

      <h2>Changes and law</h2>
      <p>
        We may update these terms; the effective date above changes when we do, and continued use means
        you accept the update. These terms are governed by the laws of India, and disputes are subject to
        the courts at {SITE.jurisdiction}.
      </p>

      <p>Questions: <Link to="/contact">contact us</Link>.</p>
    </Policy>
  );
}

export function PrivacyPage() {
  return (
    <Policy title="Privacy policy">
      <p>
        This explains what {SITE.name}, operated by {SITE.operator}, keeps about you and why. We collect
        only what the app needs to work.
      </p>

      <h2>What we keep</h2>
      <ul>
        <li><strong>Your account:</strong> your email address and a one-way hash of your password — never the password itself.</li>
        <li><strong>Your work:</strong> the contracts, figures and rate indices you enter.</li>
        <li><strong>A session cookie</strong> that keeps you signed in. It is needed for the app to work; there are no advertising or tracking cookies.</li>
        <li>
          <strong>Billing records:</strong> your plan, its Razorpay subscription and payment references,
          amounts and dates. Card, UPI and bank details are entered with Razorpay and never reach us.
        </li>
      </ul>

      <h2>Who else handles it</h2>
      <ul>
        <li><strong>Razorpay</strong> processes payments, under its own privacy policy.</li>
        <li><strong>Render</strong> hosts the app, and <strong>Neon</strong> hosts its database.</li>
        <li><strong>Google Fonts</strong> serves the typefaces, so your browser contacts Google when a page loads.</li>
      </ul>
      <p>We do not sell your data or share it with anyone else, except where the law requires it.</p>

      <h2>How long, and your rights</h2>
      <p>
        We keep your account and contracts while the account exists, and billing records for as long as
        tax and accounting law requires. You can ask us for a copy of your data, to correct it, or to
        delete your account and its contracts — <Link to="/contact">contact us</Link> from the email
        address on the account.
      </p>

      <h2>Changes</h2>
      <p>If this policy changes, the effective date above changes with it.</p>
    </Policy>
  );
}

export function RefundsPage() {
  return (
    <Policy title="Refund and cancellation policy">
      <h2>Cancelling</h2>
      <p>
        Cancel auto-renew at any time from Your account. No further payment is taken. You keep the paid
        plan until the end of the period you have already paid for, then the account returns to the free
        plan: contracts beyond the first become read-only, and none is deleted.
      </p>

      <h2>Refunds</h2>
      <ul>
        <li>
          Payments for a period that has started are not refunded, in whole or in part, including when you
          cancel partway through it.
        </li>
        <li>
          <strong>We refund in full</strong> a payment taken in error: a duplicate charge, a renewal taken
          after you cancelled, or a payment whose plan never switched on.
        </li>
        <li>
          To ask for one, <Link to="/contact">contact us</Link> within 30 days of the payment with the
          payment reference shown in Your account or on Razorpay's receipt.
        </li>
        <li>
          An approved refund goes back to the original payment method through Razorpay, usually within 5–7
          working days of approval; your bank may take longer to show it.
        </li>
      </ul>

      <h2>Failed payments</h2>
      <p>
        If a renewal cannot be collected, Razorpay retries it automatically and you keep the plan
        meanwhile. If every retry fails, the plan ends as if cancelled. Money that left your account
        for a payment that did not complete is returned by your bank or Razorpay automatically.
      </p>
    </Policy>
  );
}

export function ContactPage() {
  return (
    <Policy title="Contact">
      <p>For help with the app, billing or refunds, or a request about your data:</p>
      <table className="grid stack-md">
        <tbody>
          <tr><td>Operated by</td><td>{SITE.operator}</td></tr>
          <tr><td>Email</td><td>{SITE.email}</td></tr>
          <tr><td>Phone</td><td>{SITE.phone}</td></tr>
          <tr><td>Address</td><td>{SITE.address}</td></tr>
        </tbody>
      </table>
      <p className="stack-md">
        We aim to answer within two working days. For a payment, include its reference from Your account
        or Razorpay's receipt.
      </p>
    </Policy>
  );
}
