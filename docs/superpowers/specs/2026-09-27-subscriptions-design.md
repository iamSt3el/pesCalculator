# Subscriptions

**Date:** 2026-09-27
**Status:** Awaiting review
**Scope:** `server/` and `web/`. The engine is untouched.
**Screens:** the design canvas "PES Subscription Screens"
(https://claude.ai/artifact/UQ4ropeqZ9GCnVpXpuusSW). Where this document and the
canvas disagree, this document wins — §9 lists the canvas screens that v1 changes.

## 1. Goal

Charge for the application with a recurring subscription in rupees, while leaving
enough free that anyone can prove it on a real agreement first.

- **Freemium.** A free account holds **one** contract. A subscriber holds any number.
  Nothing else differs: the rates chart, the calculation and the printed bill are the
  same on both.
- **One paid plan, three billing periods:** monthly, every 6 months, yearly.
- **Auto-renew through Razorpay Subscriptions** (UPI Autopay, card or netbanking
  mandate). Razorpay collects, retries and emails receipts; the app never sees card or
  UPI details.
- **Nothing is ever deleted for non-payment.** An account that is not paid and holds
  more contracts than the free limit becomes read-only: every contract can still be
  opened and printed, none can be edited, no new one can be started. Deleting stays
  allowed, so deleting down to one contract makes that one editable again for free.
- **Existing accounts are treated as free from launch.** No grandfathering, no grace
  period. An account holding more than one contract on the day billing is switched on
  becomes read-only until it subscribes or is granted access (§7).
- **Administrators are always unlimited**, and can grant any account paid access until
  a date — for someone who paid by UPI or bank transfer, or a department account.

## 2. Who can do what

`entitlement(userId)` in `server/src/billing/entitlement.ts` is the only place the
answer is computed:

```ts
interface Entitlement {
  paid: boolean;
  source: 'admin' | 'subscription' | 'grant' | 'free';
  paidUntil: string | null;     // ISO date; the later of subscription end and grant end
  contractCount: number;
  limit: number | null;         // FREE_CONTRACT_LIMIT when not paid, else null
  readOnly: boolean;            // !paid && contractCount > FREE_CONTRACT_LIMIT
  canCreate: boolean;           // paid || contractCount < FREE_CONTRACT_LIMIT
}
```

`FREE_CONTRACT_LIMIT = 1`, a constant.

`paid` is true when **any** of these holds:

| Source | Condition |
|---|---|
| admin | `users.role = 'admin'` |
| subscription | a subscription with status `active` or `pending` (Razorpay is retrying a failed charge) |
| subscription | a subscription with status `cancelled` and `current_end > now()` — belt and braces; with `cancel_at_cycle_end` Razorpay normally keeps it `active` until the end |
| grant | an access grant with `revoked_at IS NULL` and `until >= current_date` |

`halted` (every retry failed), `completed`, `expired`, `created` and `authenticated`
are not paid. `authenticated` means the mandate is approved but the first charge has not
been confirmed; the checkout page shows "Confirming" for it (§4.2).

**When billing is not configured (§6), `entitlement` reports every account as paid.**
The limits exist only where there is a way to pay.

## 3. Data

Migration `server/migrations/004_subscriptions.sql`. The existing `payments` table
holds contract adjustments, so nothing here is called `payments`.

```sql
CREATE TABLE subscriptions (
  id                        SERIAL PRIMARY KEY,
  user_id                   INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  razorpay_subscription_id  TEXT NOT NULL UNIQUE,
  period                    TEXT NOT NULL CHECK (period IN ('monthly','half_yearly','yearly')),
  status                    TEXT NOT NULL,     -- Razorpay's, verbatim
  current_start             TIMESTAMPTZ,
  current_end               TIMESTAMPTZ,
  cancel_at_cycle_end       BOOLEAN NOT NULL DEFAULT false,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_subscriptions_user ON subscriptions (user_id);

CREATE TABLE subscription_charges (
  razorpay_payment_id  TEXT PRIMARY KEY,
  subscription_id      INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE RESTRICT,
  amount_paise         BIGINT NOT NULL,
  paid_at              TIMESTAMPTZ NOT NULL,
  razorpay_invoice_id  TEXT
);

CREATE TABLE access_grants (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  until       DATE NOT NULL,
  note        TEXT NOT NULL DEFAULT '',
  granted_by  INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at  TIMESTAMPTZ
);
CREATE INDEX idx_access_grants_user ON access_grants (user_id);

-- Every webhook delivery, so a retried one is applied once.
CREATE TABLE billing_events (
  event_id     TEXT PRIMARY KEY,      -- the x-razorpay-event-id header
  event_type   TEXT NOT NULL,
  payload      JSONB NOT NULL,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`RESTRICT` throughout, for the reason `002_contract_owner.sql` gives: deleting an
account must not silently destroy its billing history.

**At most one open subscription per account.** "Open" is any status other than
`cancelled`, `completed`, `expired`. This is enforced in code inside the create
transaction (§4.1), not by an index, because the rule for an abandoned `created` row is
"reuse or cancel", which an index cannot express.

**At most one live grant per account.** A new grant revokes the previous one in the
same transaction.

## 4. The Razorpay flow

### 4.1 Setup

Done once in the Razorpay dashboard: three plans — monthly (period `monthly`,
interval 1), 6 months (`monthly`, interval 6), yearly (`yearly`, interval 1). **Prices
live only on those plans.** `GET /api/billing/plans` fetches them through Razorpay's
Plans API and caches them in memory for an hour, so a price change needs no deploy.

`server/src/billing/razorpay.ts` is a small `fetch` client with basic auth — create,
fetch and cancel a subscription, fetch a plan — behind an interface
(`RazorpayClient`), so tests inject a fake and never reach the network. No SDK
dependency.

### 4.2 Subscribing

1. **`POST /api/billing/subscriptions {period}`** — in one transaction, holding the
   user's row with `SELECT … FOR UPDATE`:
   - an open subscription that is `active` or `pending` → **409** "already subscribed";
   - an abandoned `created` one for the same period → reuse it;
   - any other open one (`created` for another period, `authenticated`, `halted`) →
     cancel it at Razorpay, then continue;
   - create a Razorpay subscription: the period's plan id, `total_count` covering ten
     years (120 / 20 / 10 — Razorpay requires a count), `customer_notify: 1`,
     `notes: { user_id }`. Store it as `created`. Return `{ subscriptionId, keyId }`.
2. **The browser opens Razorpay Checkout** (`https://checkout.razorpay.com/v1/checkout.js`,
   loaded only on the checkout page) with that subscription id and the account's email
   prefilled.
3. **The checkout handler posts `POST /api/billing/subscriptions/verify`** with
   `razorpay_payment_id`, `razorpay_subscription_id`, `razorpay_signature`. The server:
   - checks `HMAC-SHA256(payment_id + "|" + subscription_id, KEY_SECRET)` against the
     signature with `timingSafeEqual` — mismatch → **400**;
   - checks the subscription belongs to the caller — otherwise **404**;
   - fetches the subscription from Razorpay and stores status, `current_start`,
     `current_end`; records the charge when the payment is captured;
   - returns the new entitlement. The page shows **Payment received** for `active`,
     **Confirming** for `authenticated`.
4. **Confirming** polls `GET /api/billing` every 3 seconds for up to a minute, then
   says the plan will switch on by itself and offers the way back to contracts.
5. **The window dismissed, or `payment.failed`** → **Nothing was charged**, with Try
   again and Choose another plan. The `created` row stays and is reused or cancelled
   by the next attempt.

### 4.3 Webhooks

`POST /api/billing/webhook`, unauthenticated, **mounted before `express.json`** with
`express.raw({ type: 'application/json' })`, since the signature is over the exact
bytes Razorpay sent.

1. `X-Razorpay-Signature` must equal `HMAC-SHA256(rawBody, WEBHOOK_SECRET)`
   (`timingSafeEqual`) — otherwise **401**.
2. Insert into `billing_events` by `x-razorpay-event-id`, `ON CONFLICT DO NOTHING`. A
   duplicate → **200** and stop.
3. **An event is a notification, not the data.** For any `subscription.*` event, fetch
   that subscription from Razorpay and store what it says. Delivery order therefore
   does not matter. `subscription.charged` also records the payment it carries.
4. A subscription id this database does not hold → **200**, ignored.

Subscribed events: `subscription.authenticated`, `.activated`, `.charged`, `.pending`,
`.halted`, `.cancelled`, `.completed`, `.updated`.

**Why the webhook is not the only path.** The Render free instance sleeps outside the
pinger's 08:00–20:59 IST window and takes ~50 s to wake, longer than Razorpay waits for
a webhook response. Razorpay retries, but a payment made at night would sit on
Confirming. So activation has three routes, any one of which is enough:

- the checkout callback (§4.2 step 3), which fetches from Razorpay directly;
- the webhook;
- **the lazy refresh:** `GET /api/billing` re-fetches from Razorpay any subscription of
  the caller's that is `created`, `authenticated` or `pending`, or `active` with
  `current_end` in the past. Throttled to once a minute per subscription.

### 4.4 Cancelling

`POST /api/billing/subscription/cancel` → Razorpay cancel with
`cancel_at_cycle_end: 1`; stores `cancel_at_cycle_end = true`. Nothing more is
charged; access runs to `current_end`; no refund. There is no un-cancel in v1 (§9).

### 4.5 Failed renewals

- **`pending`** — Razorpay is retrying on its own schedule. The account stays paid. The
  account panel and a contracts-page band say so.
- **`halted`** — every retry failed. The account is no longer paid; if it holds more
  than one contract it becomes read-only. The user subscribes again from the plans page,
  which cancels the halted subscription first (§4.2 step 1).

## 5. Enforcement

The server enforces; the web mirrors it for a good experience and is never the guard.

- **`POST /api/contracts`** — inside a transaction holding the user's row
  `FOR UPDATE`, count the account's contracts; `!canCreate` → **402**
  `{ error, code: 'limit' }`. The lock is what stops two tabs both creating a second
  contract.
- **Every write under `/api/contracts/:id`** — the ownership chokepoint at
  `server/src/routes/contracts.ts` (`contractsRouter.use('/:id', …)`) gains one step
  after the owner check: a method other than `GET`, `HEAD` or `DELETE` on a
  `readOnly` account → **402** `{ error, code: 'read_only' }`. That one place covers
  `PUT /:id`, `/components`, `/progress`, `/payments` and `/expenditure`.
- **`DELETE /api/contracts/:id` stays allowed** whatever the entitlement.
- **The calculation router is read-only** and needs nothing.
- **The rates chart is untouched** (§10).

## 6. Configuration

| Variable | |
|---|---|
| `RAZORPAY_KEY_ID` | public key id, sent to the browser for Checkout |
| `RAZORPAY_KEY_SECRET` | server only |
| `RAZORPAY_WEBHOOK_SECRET` | set on the webhook in the Razorpay dashboard |
| `RAZORPAY_PLAN_MONTHLY` | plan id |
| `RAZORPAY_PLAN_HALF_YEARLY` | plan id |
| `RAZORPAY_PLAN_YEARLY` | plan id |

**Billing is configured only when all six are set.** When it is not, `GET /api/billing` still answers
(with `configured: false`), the other billing routes answer **503** "billing is not
available", the plans page says so, and
`entitlement` reports every account as paid — so deploying this code changes nothing
for anyone until the live keys go in. Test-mode keys work locally. Added to
`.env.example` and to `render.yaml` as `sync: false`.

**Content-Security-Policy.** Helmet's defaults block Checkout. Extend them, and only
them: `script-src` gains `https://checkout.razorpay.com`; `frame-src` gains
`https://api.razorpay.com https://checkout.razorpay.com`; `connect-src` gains
`https://api.razorpay.com https://lumberjack.razorpay.com`. Confirm the exact list
against Razorpay's current documentation during implementation, in test mode, with the
browser console open.

## 7. Administration

All behind `requireAdmin`.

- **`GET /api/admin/subscribers`** — every account: email, joined, role, entitlement
  (source, paid until, read-only), the open subscription's period and status and
  Razorpay id, the live grant and its note, contract count. The screen filters it in
  the browser (All / Paying / Granted / Free / Ended) and searches by email.
- **`POST /api/admin/users/:id/grants { until, note }`** — `until` a date not before
  today, `note` up to 500 characters. Revokes the account's previous live grant in the
  same transaction.
- **`DELETE /api/admin/grants/:id`** — sets `revoked_at`. Nothing is deleted.

A grant and a subscription may overlap; the account is paid until the later of the
two. The user is never charged for a grant.

## 8. Web

- **`api.ts`** — `billing()`, `plans()`, `subscribe(period)`, `verify(result)`,
  `cancelSubscription()`, `subscribers()`, `grant(userId, until, note)`,
  `revokeGrant(id)`. `ApiError` gains `code?: string`, read from the body.
- **`EntitlementProvider`** (context + `useEntitlement()`), loaded after sign-in from
  `GET /api/billing` (entitlement, open subscription, charges, billing configured).
  Refreshed after every billing action and **whenever any call fails with 402** — so a
  plan that lapses mid-session turns the page read-only on the next save instead of
  showing an error.
- **Routes**
  - `/plans` — `PlansPage`: the four rows, the selection summary, the free/paid table.
  - `/plans/checkout?period=…` — `CheckoutPage`: the confirmation, then Razorpay; the
    Confirming, Payment received and Nothing was charged states render in place.
  - `/admin/subscribers` — `SubscribersPage`, admins only; linked from the Contracts
    header when the signed-in account is an admin.
- **Contracts page** — the plan pill; with `!canCreate`, Start contract disabled and
  the limit band; with `readOnly`, the ended band, the input disabled, a lock beside
  each agreement. Delete stays.
- **Contract stages** — with `readOnly`, a "Read-only" flag in the running head, the
  band above the stage, and the stage's content inside one `<fieldset disabled>` in
  `ContractLayout`, which disables every control on every stage at once; the stage
  savers are not called. Print bill keeps working.
- **Your account** — the Subscription panel (the states on canvas board 8, less the cuts
  in §9) and a Payments table from `subscription_charges`, above Details and Change
  password.

Styling stays inside the ledger system in `styles.css`: tokens only, the two rule
weights, 2 px radius, existing `.pill` and `.notice` vocabulary. New classes: a `.band`
(full-width state strip, warn and neutral), `.plan-row`.

## 9. Scope cuts for v1

Deliberate; each changes a screen on the canvas.

1. **No change of billing period, and no future-dated start.** Doing it properly needs
   two subscriptions alive at once (the current one and one scheduled at its
   `current_end`) and a mandate for a later start, which behaves differently for UPI
   and cards. In v1, switching period is: cancel auto-renew, and subscribe again once
   the plan has ended. Removed from the canvas: *Change billing period* on Your
   account; *Choose a plan to continue after that* on the cancelled state; *it starts
   when the grant ends* on the granted state. A granted account may subscribe at any
   time; the overlap is simply paid time.
2. **No "Update payment method".** Razorpay has no single hosted page that changes a
   mandate across UPI, card and netbanking. The retrying state instead says that
   Razorpay is retrying and that, if it cannot collect, the plan ends and the user can
   subscribe again.
3. **No un-cancel.** A cancelled subscription runs out; subscribing again after it
   ends is the way back.
4. **No emails from the app.** Razorpay's `customer_notify` sends the receipts,
   renewal notices and failure notices.
5. **No proration or refunds.**

## 10. Open

- **Prices and GST treatment.** Set on the Razorpay plans; the canvas shows `[price]`
  placeholders. Whether the price includes GST, and what the confirm page's Tax line
  says, is the operator's to decide before going live.
- **The shared rates chart.** Any signed-in account can edit it today
  (`PUT /api/rates`, paste, delete). With open sign-up and free accounts that is worth
  revisiting — admin-only, or paid-only — but it is not part of this change.
- **The cancelled-plan banner** seven days before `current_end` (canvas board 8) needs
  no new data and is in scope; say if it should go.

## 11. Testing

Server, `node:test` against `TEST_DATABASE_URL`, with a fake `RazorpayClient`:

- **`entitlement`**, table-driven: admin; free with 0, 1, 2 contracts; `active`;
  `pending`; `halted`; `cancelled` with `current_end` future and past; `authenticated`;
  a live, an expired and a revoked grant; a grant overlapping a subscription (the later
  date wins); billing not configured → paid.
- **Contracts:** a free account's second create → 402 `limit`; every write route on a
  read-only account → 402 `read_only`; `GET` and `DELETE` still pass; admins never
  limited; a grant lifts both.
- **Billing:** verify with a good signature activates, a tampered one → 400, another
  account's subscription → 404; create while `active` → 409; an abandoned `created`
  row reused for the same period and cancelled for another.
- **Webhook:** bad signature → 401; a duplicate event id applied once; an unknown
  subscription → 200 and nothing stored; `subscription.charged` records the charge.
- **Admin:** non-admin → 403; a grant in the past → 400; a second grant revokes the
  first; revoke sets `revoked_at`.
- **Existing suites** that create several contracts as a `user`-role account run with
  billing unconfigured, so they are unaffected.

Web, `web/test`: the pure mapping from entitlement to pill, band and disabled state.

By hand, Razorpay test mode, webhook through a local tunnel: success, failure,
dismissal, cancel, a webhook delivered twice, the checkout callback lost (activation by
lazy refresh alone).

## 12. Rollout

1. Build against test keys locally. Merge to `main` at any time: with billing
   unconfigured the deploy changes nothing (§6).
2. The operator completes Razorpay KYC and creates the three live plans.
3. Before switching on, grant access (§7) to any account that should not meet the
   limit on day one.
4. Set the six variables on Render; add the webhook
   `https://pes-calculator.onrender.com/api/billing/webhook` with the events in §4.3.
5. From then, accounts with more than one contract and no subscription or grant are
   read-only. Nothing is deleted.
