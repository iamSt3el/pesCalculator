# Subscriptions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A free account keeps one contract; a Razorpay auto-renewing subscription (monthly, 6-monthly or yearly) unlocks unlimited contracts; an account that is not paid and holds more than one contract becomes read-only, never deleted; admins can grant access until a date.

**Architecture:** One pure function, `decideEntitlement`, answers "is this account paid, and is it read-only?" from facts loaded out of Postgres. The server enforces it at exactly two places — contract creation and the existing `/api/contracts/:id` ownership chokepoint. Razorpay state is mirrored into a `subscriptions` table by three independent routes (the checkout callback, the webhook, a throttled lazy refresh), each of which re-fetches the subscription from Razorpay rather than trusting a payload. When the six Razorpay variables are not all set, billing is "unconfigured" and every account counts as paid, so the code can deploy before the live keys exist.

**Tech Stack:** Node 24 (native TypeScript type-stripping — no enums, no parameter properties), Express 5, `pg`, `zod`, `node:test`; React 19 + react-router 7 + Vite; Razorpay Subscriptions REST API and Checkout.js.

**Spec:** `docs/superpowers/specs/2026-09-27-subscriptions-design.md`
**Screens:** https://claude.ai/artifact/UQ4ropeqZ9GCnVpXpuusSW (the spec's §9 lists what v1 drops from them)

## Global Constraints

- `FREE_CONTRACT_LIMIT = 1`.
- Billing periods, and nothing else: `'monthly' | 'half_yearly' | 'yearly'`.
- `total_count` per period: monthly 120, half_yearly 20, yearly 10.
- Billing is configured only when all six are set: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_PLAN_MONTHLY`, `RAZORPAY_PLAN_HALF_YEARLY`, `RAZORPAY_PLAN_YEARLY`. Under `NODE_ENV=test` billing from the environment is always unconfigured.
- Unconfigured billing: every account is paid; `GET /api/billing` answers with `configured: false`; every other billing route answers **503** `{ error: 'Billing is not available yet' }`.
- A paid status is `active` or `pending`, or `cancelled` with `current_end` in the future. Nothing else pays.
- Grants' `until` is a calendar date in **Asia/Kolkata**, inclusive.
- 402 bodies: `{ error, code: 'limit' }` on create, `{ error, code: 'read_only' }` on a write.
- `GET`, `HEAD` and `DELETE` under `/api/contracts/:id` are never blocked by billing.
- The rates chart (`/api/rates`, and the Rates Chart stage) is untouched.
- Server files import siblings with the `.ts` extension, as the existing code does.
- Styling: tokens only (no literal colours outside the token blocks in `styles.css`), 2 px radius, the two rule weights, no shadows.
- Commits go straight to `main`, messages in the repo's `type(scope): summary` style, **no** `Co-Authored-By` / `Claude-Session` / "Generated with" lines.
- Server tests run with `npm test -w @pes/server` (needs `TEST_DATABASE_URL` ending in `_test`); a single file with `cd server && NODE_ENV=test node --env-file=../.env --test test/<file>.test.ts`. Web tests with `npm test -w @pes/web`; the web type-check with `npx tsc -p web`.

## Review Focus

1. **A plan lapses while someone is typing.** The next debounced save gets a 402; the page must turn read-only (band, disabled fields) instead of looping on an error. Pinned by the 402-listener test in Task 11 and the provider in Task 12.
2. **Double-clicking "Pay".** Two `POST /api/billing/subscriptions` at once must create one Razorpay subscription, not two mandates. Pinned in Task 7.
3. **Razorpay is down or slow.** `GET /api/billing` must still answer from stored data (the whole app loads it), and a verify that cannot reach Razorpay must fall back to "Confirming", not a 500. Pinned in Task 7.
4. **Midnight in India.** A grant "until 27 Sep" must still pay at 23:30 IST on the 27th (18:00 UTC) and must pay at 00:30 IST on the 27th (19:00 UTC on the 26th). Pinned in Task 4.
5. **Two tabs creating the second contract.** Exactly one of two simultaneous creates on a free account may succeed. Pinned in Task 6.

---

## File map

Server — new:
- `server/migrations/004_subscriptions.sql` — the four tables.
- `server/src/billing/config.ts` — periods, `total_count`, reading the six variables.
- `server/src/billing/signature.ts` — checkout and webhook HMAC checks.
- `server/src/billing/razorpay.ts` — `RazorpayClient` interface and the `fetch` implementation.
- `server/src/billing/entitlement.ts` — `decideEntitlement` (pure) and `indiaDate`.
- `server/src/billing/state.ts` — the app's current `Billing` (config + client) or `null`.
- `server/src/billing/access.ts` — `entitlementFor(userId)`: load facts, decide.
- `server/src/billing/sync.ts` — re-fetch a subscription / payment from Razorpay; lazy refresh.
- `server/src/repo/subscriptions.ts` — subscriptions, charges, webhook events, entitlement facts.
- `server/src/repo/grants.ts` — access grants.
- `server/src/routes/billing.ts` — `/api/billing`.
- `server/src/routes/webhook.ts` — `POST /api/billing/webhook`.
- `server/src/routes/admin.ts` — `/api/admin`.
- `server/test/helpers.ts`, `server/test/fakes.ts` — test app, signed-in agents, fake Razorpay.
- Tests: `billing-units.test.ts`, `razorpay-client.test.ts`, `entitlement.test.ts`, `sync.test.ts`, `limits.test.ts`, `billing.test.ts`, `webhook.test.ts`, `admin.test.ts`.

Server — modified: `server/src/app.ts` (options, webhook mount, routers, CSP), `server/src/routes/contracts.ts` (enforcement), `server/src/repo/contracts.ts` (`createContract` limit), `server/test/migrate.test.ts`, `server/test/static.test.ts`, `.env.example`, `render.yaml`, `README.md`.

Web — new: `web/src/billing.ts` (pure view logic), `web/src/entitlement.tsx` (provider), `web/src/razorpay.ts` (Checkout loader), `web/src/components/Band.tsx`, `web/src/components/LockIcon.tsx`, `web/src/components/Editable.tsx`, `web/src/components/SubscriptionPanel.tsx`, `web/src/pages/PlansPage.tsx`, `web/src/pages/CheckoutPage.tsx`, `web/src/pages/SubscribersPage.tsx`, `web/test/billing.test.ts`, `web/test/api.test.ts`.

Web — modified: `web/src/api.ts`, `web/src/App.tsx`, `web/src/styles.css`, `web/src/pages/ContractsPage.tsx`, `web/src/pages/ProfilePage.tsx`, `web/src/pages/MainDataPage.tsx`, `web/src/pages/BaseRatePage.tsx`, `web/src/components/ScheduleTable.tsx`, `web/src/components/Shell.tsx`, `web/src/components/RunningHead.tsx`, `web/src/ContractLayout.tsx`.

---

### Task 1: The subscription tables

**Files:**
- Create: `server/migrations/004_subscriptions.sql`
- Modify: `server/test/migrate.test.ts`

**Interfaces:**
- Produces: tables `subscriptions`, `subscription_charges`, `access_grants`, `billing_events` exactly as below; every later server task relies on these column names.

- [ ] **Step 1: Write the failing test**

In `server/test/migrate.test.ts`, change the expected first run and the table list, and add a constraint check at the end of the test body (before the idempotency assertion):

```ts
  const first = await runMigrations(pool);
  assert.deepEqual(first,
    ['001_init.sql', '002_contract_owner.sql', '003_execution_expenditure.sql', '004_subscriptions.sql']);
```

```ts
  for (const t of ['access_grants', 'billing_events', 'components', 'contracts', 'expenditure', 'payments',
                   'progress', 'rates', 'schema_migrations', 'session', 'subscription_charges',
                   'subscriptions', 'users']) {
    assert.ok(tables.includes(t), `missing table ${t}`);
  }
```

```ts
  const { rows: made } = await pool.query<{ id: number }>(
    "INSERT INTO users (email, password_hash, role) VALUES ('m@test.invalid', 'x', 'user') RETURNING id",
  );
  await assert.rejects(
    pool.query(
      `INSERT INTO subscriptions (user_id, razorpay_subscription_id, period, status)
       VALUES ($1, 'sub_x', 'weekly', 'created')`, [made[0]!.id]),
    /check constraint/,
    'a subscription must name a known billing period',
  );
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd server && NODE_ENV=test node --env-file=../.env --test test/migrate.test.ts`
Expected: FAIL — `004_subscriptions.sql` missing from the applied list.

- [ ] **Step 3: Write the migration**

`server/migrations/004_subscriptions.sql`:

```sql
-- A subscription mirrors one Razorpay subscription. Razorpay is the source of
-- truth; this row is what the app last fetched from it, so status is stored
-- verbatim rather than mapped onto a vocabulary of our own.
CREATE TABLE subscriptions (
  id                        SERIAL PRIMARY KEY,
  user_id                   INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  razorpay_subscription_id  TEXT NOT NULL UNIQUE,
  period                    TEXT NOT NULL CHECK (period IN ('monthly', 'half_yearly', 'yearly')),
  status                    TEXT NOT NULL,
  current_start             TIMESTAMPTZ,
  current_end               TIMESTAMPTZ,
  cancel_at_cycle_end       BOOLEAN NOT NULL DEFAULT false,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_subscriptions_user ON subscriptions (user_id);

-- One row per captured charge, for the account's payment history.
CREATE TABLE subscription_charges (
  razorpay_payment_id  TEXT PRIMARY KEY,
  subscription_id      INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE RESTRICT,
  amount_paise         BIGINT NOT NULL,
  paid_at              TIMESTAMPTZ NOT NULL,
  razorpay_invoice_id  TEXT
);

-- Paid access given by an administrator, independent of Razorpay. `until` is
-- an Indian calendar date and is inclusive.
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

-- Every webhook delivery that was applied, so a retried one is applied once.
CREATE TABLE billing_events (
  event_id     TEXT PRIMARY KEY,
  event_type   TEXT NOT NULL,
  payload      JSONB NOT NULL,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`RESTRICT` for the reason `002_contract_owner.sql` gives: deleting an account must not silently destroy its billing history.

- [ ] **Step 4: Run it to see it pass**

Run: `cd server && NODE_ENV=test node --env-file=../.env --test test/migrate.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/migrations/004_subscriptions.sql server/test/migrate.test.ts
git commit -m "feat(server): tables for subscriptions, charges, grants and webhook events"
```

---

### Task 2: Billing configuration and signatures

**Files:**
- Create: `server/src/billing/config.ts`, `server/src/billing/signature.ts`
- Test: `server/test/billing-units.test.ts`

**Interfaces:**
- Produces:
  - `type Period = 'monthly' | 'half_yearly' | 'yearly'`
  - `const PERIODS: readonly Period[]`
  - `const TOTAL_COUNT: Record<Period, number>`
  - `interface BillingConfig { keyId: string; keySecret: string; webhookSecret: string; plans: Record<Period, string> }`
  - `billingConfigFromEnv(env?: NodeJS.ProcessEnv): BillingConfig | null`
  - `verifyCheckoutSignature(paymentId: string, subscriptionId: string, signature: string, keySecret: string): boolean`
  - `verifyWebhookSignature(rawBody: Buffer, signature: string, webhookSecret: string): boolean`

- [ ] **Step 1: Write the failing tests**

`server/test/billing-units.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { billingConfigFromEnv, TOTAL_COUNT } from '../src/billing/config.ts';
import { verifyCheckoutSignature, verifyWebhookSignature } from '../src/billing/signature.ts';

const FULL = {
  NODE_ENV: 'production',
  RAZORPAY_KEY_ID: 'rzp_test_1',
  RAZORPAY_KEY_SECRET: 'secret',
  RAZORPAY_WEBHOOK_SECRET: 'hook',
  RAZORPAY_PLAN_MONTHLY: 'plan_m',
  RAZORPAY_PLAN_HALF_YEARLY: 'plan_h',
  RAZORPAY_PLAN_YEARLY: 'plan_y',
};

test('billing is configured when all six variables are set', () => {
  assert.deepEqual(billingConfigFromEnv(FULL), {
    keyId: 'rzp_test_1', keySecret: 'secret', webhookSecret: 'hook',
    plans: { monthly: 'plan_m', half_yearly: 'plan_h', yearly: 'plan_y' },
  });
});

test('one missing or blank variable leaves billing unconfigured', () => {
  for (const key of Object.keys(FULL).filter((k) => k.startsWith('RAZORPAY_'))) {
    assert.equal(billingConfigFromEnv({ ...FULL, [key]: undefined }), null, `${key} missing`);
    assert.equal(billingConfigFromEnv({ ...FULL, [key]: '  ' }), null, `${key} blank`);
  }
});

test('tests never pick billing up from the environment', () => {
  assert.equal(billingConfigFromEnv({ ...FULL, NODE_ENV: 'test' }), null);
});

test('every period asks Razorpay for ten years of cycles', () => {
  assert.deepEqual(TOTAL_COUNT, { monthly: 120, half_yearly: 20, yearly: 10 });
});

test('a checkout signature is HMAC-SHA256 of payment id | subscription id', () => {
  const good = createHmac('sha256', 'secret').update('pay_1|sub_1').digest('hex');
  assert.equal(verifyCheckoutSignature('pay_1', 'sub_1', good, 'secret'), true);
  assert.equal(verifyCheckoutSignature('pay_1', 'sub_2', good, 'secret'), false);
  assert.equal(verifyCheckoutSignature('pay_1', 'sub_1', good, 'other'), false);
  assert.equal(verifyCheckoutSignature('pay_1', 'sub_1', '', 'secret'), false);
  assert.equal(verifyCheckoutSignature('pay_1', 'sub_1', 'short', 'secret'), false);
});

test('a webhook signature is HMAC-SHA256 of the exact raw body', () => {
  const body = Buffer.from('{"event":"subscription.activated"}');
  const good = createHmac('sha256', 'hook').update(body).digest('hex');
  assert.equal(verifyWebhookSignature(body, good, 'hook'), true);
  assert.equal(verifyWebhookSignature(Buffer.from('{"event": "subscription.activated"}'), good, 'hook'), false);
  assert.equal(verifyWebhookSignature(body, good.toUpperCase(), 'hook'), false);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd server && NODE_ENV=test node --env-file=../.env --test test/billing-units.test.ts`
Expected: FAIL — `Cannot find module '../src/billing/config.ts'`.

- [ ] **Step 3: Write the two modules**

`server/src/billing/config.ts`:

```ts
export type Period = 'monthly' | 'half_yearly' | 'yearly';
export const PERIODS: readonly Period[] = ['monthly', 'half_yearly', 'yearly'];

/** Razorpay requires a cycle count on every subscription; each covers ten years. */
export const TOTAL_COUNT: Record<Period, number> = { monthly: 120, half_yearly: 20, yearly: 10 };

export interface BillingConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  plans: Record<Period, string>;
}

/**
 * Billing is on only when every variable is present. A half-configured
 * deployment is treated as unconfigured, which leaves every account unlimited
 * rather than limited with no way to pay.
 *
 * Tests never read billing from the environment: a developer's .env may hold
 * Razorpay test keys, and the suites must not reach Razorpay or start limiting
 * the accounts they create. Tests that want billing inject it (see app.ts).
 */
export function billingConfigFromEnv(env: NodeJS.ProcessEnv = process.env): BillingConfig | null {
  if (env.NODE_ENV === 'test') return null;
  const read = (key: string) => env[key]?.trim() ?? '';
  const config: BillingConfig = {
    keyId: read('RAZORPAY_KEY_ID'),
    keySecret: read('RAZORPAY_KEY_SECRET'),
    webhookSecret: read('RAZORPAY_WEBHOOK_SECRET'),
    plans: {
      monthly: read('RAZORPAY_PLAN_MONTHLY'),
      half_yearly: read('RAZORPAY_PLAN_HALF_YEARLY'),
      yearly: read('RAZORPAY_PLAN_YEARLY'),
    },
  };
  const all = [config.keyId, config.keySecret, config.webhookSecret, ...Object.values(config.plans)];
  return all.every(Boolean) ? config : null;
}
```

`server/src/billing/signature.ts`:

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

function hmacHex(secret: string, data: string | Buffer): string {
  return createHmac('sha256', secret).update(data).digest('hex');
}

/** Constant-time, and false rather than a throw when the lengths differ. */
function sameHex(expected: string, given: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(given, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** What Checkout hands the page after a subscription payment. */
export function verifyCheckoutSignature(
  paymentId: string, subscriptionId: string, signature: string, keySecret: string,
): boolean {
  return sameHex(hmacHex(keySecret, `${paymentId}|${subscriptionId}`), signature);
}

/** Over the exact bytes received: re-serialised JSON would not match. */
export function verifyWebhookSignature(rawBody: Buffer, signature: string, webhookSecret: string): boolean {
  return sameHex(hmacHex(webhookSecret, rawBody), signature);
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `cd server && NODE_ENV=test node --env-file=../.env --test test/billing-units.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/billing/config.ts server/src/billing/signature.ts server/test/billing-units.test.ts
git commit -m "feat(server): read the Razorpay configuration and check its signatures"
```

---

### Task 3: The Razorpay client and its fake

**Files:**
- Create: `server/src/billing/razorpay.ts`, `server/test/fakes.ts`
- Test: `server/test/razorpay-client.test.ts`

**Interfaces:**
- Consumes: `BillingConfig`, `Period` (Task 2).
- Produces:
  - `interface RzSubscription { id: string; plan_id: string; status: string; current_start: number | null; current_end: number | null }` (unix seconds)
  - `interface RzPayment { id: string; amount: number; status: string; created_at: number; invoice_id: string | null }`
  - `interface RzPlan { id: string; item: { amount: number; currency: string } }`
  - `interface RazorpayClient { createSubscription(i: { planId: string; totalCount: number; notes: Record<string, string> }): Promise<RzSubscription>; fetchSubscription(id: string): Promise<RzSubscription>; cancelSubscription(id: string, atCycleEnd: boolean): Promise<RzSubscription>; fetchPayment(id: string): Promise<RzPayment>; fetchPlan(id: string): Promise<RzPlan> }`
  - `class RazorpayError extends Error { status: number }`
  - `httpRazorpay(config: Pick<BillingConfig, 'keyId' | 'keySecret'>, fetchImpl?: typeof fetch): RazorpayClient`
  - In `server/test/fakes.ts`: `fakeRazorpay(): FakeRazorpay`, `TEST_CONFIG: BillingConfig`, `testBilling(client): { config: BillingConfig; client: RazorpayClient }`, `signCheckout(paymentId, subscriptionId): string`, `signWebhook(body: string): string`.

- [ ] **Step 1: Write the failing test**

`server/test/razorpay-client.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { httpRazorpay, RazorpayError } from '../src/billing/razorpay.ts';

interface Seen { url: string; method: string; auth: string | null; body: unknown }

function stub(status: number, reply: unknown) {
  const seen: Seen[] = [];
  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    seen.push({
      url, method: init.method ?? 'GET', auth: headers.get('authorization'),
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    });
    return new Response(JSON.stringify(reply), { status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { seen, fetchImpl };
}

const keys = { keyId: 'rzp_test_1', keySecret: 's3cret' };
const basic = 'Basic ' + Buffer.from('rzp_test_1:s3cret').toString('base64');

test('creating a subscription posts the plan, the count and asks Razorpay to notify the customer', async () => {
  const { seen, fetchImpl } = stub(200, { id: 'sub_1', plan_id: 'plan_y', status: 'created', current_start: null, current_end: null });
  const client = httpRazorpay(keys, fetchImpl);
  const sub = await client.createSubscription({ planId: 'plan_y', totalCount: 10, notes: { user_id: '7' } });
  assert.equal(sub.id, 'sub_1');
  assert.deepEqual(seen[0], {
    url: 'https://api.razorpay.com/v1/subscriptions', method: 'POST', auth: basic,
    body: { plan_id: 'plan_y', total_count: 10, customer_notify: 1, notes: { user_id: '7' } },
  });
});

test('cancelling at the end of the cycle says so', async () => {
  const { seen, fetchImpl } = stub(200, { id: 'sub_1', status: 'active' });
  await httpRazorpay(keys, fetchImpl).cancelSubscription('sub_1', true);
  assert.equal(seen[0]!.url, 'https://api.razorpay.com/v1/subscriptions/sub_1/cancel');
  assert.deepEqual(seen[0]!.body, { cancel_at_cycle_end: 1 });
});

test('fetches are GETs on the entity path', async () => {
  const { seen, fetchImpl } = stub(200, {});
  const client = httpRazorpay(keys, fetchImpl);
  await client.fetchSubscription('sub_1');
  await client.fetchPayment('pay_1');
  await client.fetchPlan('plan_y');
  assert.deepEqual(seen.map((s) => `${s.method} ${s.url}`), [
    'GET https://api.razorpay.com/v1/subscriptions/sub_1',
    'GET https://api.razorpay.com/v1/payments/pay_1',
    'GET https://api.razorpay.com/v1/plans/plan_y',
  ]);
});

test('a Razorpay error carries its status and description', async () => {
  const { fetchImpl } = stub(400, { error: { description: 'The id provided does not exist' } });
  await assert.rejects(
    httpRazorpay(keys, fetchImpl).fetchSubscription('sub_nope'),
    (err: unknown) => err instanceof RazorpayError && err.status === 400
      && err.message === 'The id provided does not exist',
  );
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd server && NODE_ENV=test node --env-file=../.env --test test/razorpay-client.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the client**

`server/src/billing/razorpay.ts`:

```ts
import type { BillingConfig } from './config.ts';

/** Only the fields this app reads. Times are unix seconds, as Razorpay sends them. */
export interface RzSubscription {
  id: string;
  plan_id: string;
  status: string;
  current_start: number | null;
  current_end: number | null;
}

export interface RzPayment {
  id: string;
  amount: number;          // paise
  status: string;          // 'captured' once the money is ours
  created_at: number;
  invoice_id: string | null;
}

export interface RzPlan {
  id: string;
  item: { amount: number; currency: string };
}

/**
 * Everything the app asks of Razorpay. An interface so the tests hand the app
 * a fake and never touch the network.
 */
export interface RazorpayClient {
  createSubscription(input: { planId: string; totalCount: number; notes: Record<string, string> }): Promise<RzSubscription>;
  fetchSubscription(id: string): Promise<RzSubscription>;
  cancelSubscription(id: string, atCycleEnd: boolean): Promise<RzSubscription>;
  fetchPayment(id: string): Promise<RzPayment>;
  fetchPlan(id: string): Promise<RzPlan>;
}

export class RazorpayError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const API = 'https://api.razorpay.com/v1';

/** A few REST calls do not justify the SDK; basic auth over fetch is all it is. */
export function httpRazorpay(
  config: Pick<BillingConfig, 'keyId' | 'keySecret'>,
  fetchImpl: typeof fetch = fetch,
): RazorpayClient {
  const auth = 'Basic ' + Buffer.from(`${config.keyId}:${config.keySecret}`).toString('base64');

  async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const res = await fetchImpl(API + path, {
      method,
      headers: {
        authorization: auth,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const json = await res.json().catch(() => ({})) as { error?: { description?: string } };
    if (!res.ok) {
      throw new RazorpayError(res.status, json.error?.description ?? `Razorpay answered ${res.status}`);
    }
    return json as T;
  }

  const at = (id: string) => encodeURIComponent(id);

  return {
    createSubscription: ({ planId, totalCount, notes }) => call('POST', '/subscriptions', {
      plan_id: planId, total_count: totalCount, customer_notify: 1, notes,
    }),
    fetchSubscription: (id) => call('GET', `/subscriptions/${at(id)}`),
    cancelSubscription: (id, atCycleEnd) =>
      call('POST', `/subscriptions/${at(id)}/cancel`, { cancel_at_cycle_end: atCycleEnd ? 1 : 0 }),
    fetchPayment: (id) => call('GET', `/payments/${at(id)}`),
    fetchPlan: (id) => call('GET', `/plans/${at(id)}`),
  };
}
```

- [ ] **Step 4: Write the fake the later suites use**

`server/test/fakes.ts`:

```ts
import { createHmac } from 'node:crypto';
import type { BillingConfig } from '../src/billing/config.ts';
import type { RazorpayClient, RzPayment, RzPlan, RzSubscription } from '../src/billing/razorpay.ts';

export const TEST_CONFIG: BillingConfig = {
  keyId: 'rzp_test_key',
  keySecret: 'key_secret',
  webhookSecret: 'hook_secret',
  plans: { monthly: 'plan_monthly', half_yearly: 'plan_half', yearly: 'plan_yearly' },
};

export interface FakeRazorpay extends RazorpayClient {
  subs: Map<string, RzSubscription>;
  payments: Map<string, RzPayment>;
  plans: Map<string, RzPlan>;
  /** How many subscriptions createSubscription has made. */
  created: number;
  /** While true every call rejects, as if Razorpay were unreachable. */
  failing: boolean;
  /** Changes what Razorpay would now report for a subscription. */
  set(id: string, patch: Partial<RzSubscription>): void;
}

export function fakeRazorpay(): FakeRazorpay {
  const subs = new Map<string, RzSubscription>();
  const payments = new Map<string, RzPayment>();
  const plans = new Map<string, RzPlan>([
    ['plan_monthly', { id: 'plan_monthly', item: { amount: 50_000, currency: 'INR' } }],
    ['plan_half', { id: 'plan_half', item: { amount: 270_000, currency: 'INR' } }],
    ['plan_yearly', { id: 'plan_yearly', item: { amount: 500_000, currency: 'INR' } }],
  ]);

  const fake: FakeRazorpay = {
    subs, payments, plans, created: 0, failing: false,
    set(id, patch) { subs.set(id, { ...subs.get(id)!, ...patch }); },
    async createSubscription({ planId }) {
      guard();
      fake.created += 1;
      const sub: RzSubscription = {
        id: `sub_${fake.created}`, plan_id: planId, status: 'created', current_start: null, current_end: null,
      };
      subs.set(sub.id, sub);
      return { ...sub };
    },
    async fetchSubscription(id) { guard(); return { ...found(subs, id) }; },
    async cancelSubscription(id, atCycleEnd) {
      guard();
      const sub = found(subs, id);
      // At the end of a cycle Razorpay leaves an active subscription active.
      if (!(atCycleEnd && sub.status === 'active')) sub.status = 'cancelled';
      return { ...sub };
    },
    async fetchPayment(id) { guard(); return { ...found(payments, id) }; },
    async fetchPlan(id) { guard(); return { ...found(plans, id) }; },
  };

  function guard() { if (fake.failing) throw new Error('Razorpay is unreachable'); }
  return fake;
}

function found<T>(map: Map<string, T>, id: string): T {
  const hit = map.get(id);
  if (!hit) throw new Error(`fake Razorpay has no ${id}`);
  return hit;
}

export function testBilling(client: RazorpayClient) {
  return { config: TEST_CONFIG, client };
}

export const signCheckout = (paymentId: string, subscriptionId: string) =>
  createHmac('sha256', TEST_CONFIG.keySecret).update(`${paymentId}|${subscriptionId}`).digest('hex');

export const signWebhook = (body: string) =>
  createHmac('sha256', TEST_CONFIG.webhookSecret).update(body).digest('hex');
```

- [ ] **Step 5: Run the test to see it pass**

Run: `cd server && NODE_ENV=test node --env-file=../.env --test test/razorpay-client.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add server/src/billing/razorpay.ts server/test/fakes.ts server/test/razorpay-client.test.ts
git commit -m "feat(server): a small Razorpay client, and a fake of it for the tests"
```

---

### Task 4: Deciding entitlement

**Files:**
- Create: `server/src/billing/entitlement.ts`, `server/src/billing/state.ts`
- Test: `server/test/entitlement.test.ts`

**Interfaces:**
- Consumes: `BillingConfig` (Task 2), `RazorpayClient`, `httpRazorpay` (Task 3).
- Produces:
  - `const FREE_CONTRACT_LIMIT = 1`
  - `interface Entitlement { paid: boolean; source: 'admin' | 'subscription' | 'grant' | 'free'; paidUntil: string | null; contractCount: number; limit: number | null; readOnly: boolean; canCreate: boolean }`
  - `interface EntitlementFacts { role: 'admin' | 'user'; contractCount: number; subscriptions: ReadonlyArray<{ status: string; currentEnd: Date | null }>; grants: ReadonlyArray<{ until: string; revokedAt: Date | null }> }`
  - `decideEntitlement(facts: EntitlementFacts, opts: { enforced: boolean; now: Date }): Entitlement`
  - `indiaDate(at: Date): string` — `YYYY-MM-DD` in Asia/Kolkata
  - `subscriptionPays(s: { status: string; currentEnd: Date | null }, now: Date): boolean`
  - `interface Billing { config: BillingConfig; client: RazorpayClient }`
  - `setBilling(b: Billing | null): void`, `getBilling(): Billing | null`, `billingFromEnv(): Billing | null`

- [ ] **Step 1: Write the failing tests**

`server/test/entitlement.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { decideEntitlement, indiaDate, type EntitlementFacts } from '../src/billing/entitlement.ts';

const NOW = new Date('2026-09-27T06:30:00Z');          // 12:00 IST
const LATER = new Date('2026-10-27T06:30:00Z');
const EARLIER = new Date('2026-08-27T06:30:00Z');

const facts = (over: Partial<EntitlementFacts> = {}): EntitlementFacts =>
  ({ role: 'user', contractCount: 0, subscriptions: [], grants: [], ...over });
const decide = (f: EntitlementFacts, enforced = true, now = NOW) => decideEntitlement(f, { enforced, now });

test('a free account may hold one contract and create none beyond it', () => {
  assert.deepEqual(decide(facts({ contractCount: 0 })), {
    paid: false, source: 'free', paidUntil: null, contractCount: 0, limit: 1, readOnly: false, canCreate: true,
  });
  const one = decide(facts({ contractCount: 1 }));
  assert.equal(one.canCreate, false);
  assert.equal(one.readOnly, false);
  const two = decide(facts({ contractCount: 2 }));
  assert.equal(two.readOnly, true);
  assert.equal(two.canCreate, false);
});

test('an administrator is always unlimited', () => {
  const e = decide(facts({ role: 'admin', contractCount: 9 }));
  assert.equal(e.paid, true);
  assert.equal(e.source, 'admin');
  assert.equal(e.limit, null);
  assert.equal(e.readOnly, false);
  assert.equal(e.canCreate, true);
});

test('which subscription statuses pay', () => {
  const cases: Array<[string, Date | null, boolean]> = [
    ['active', LATER, true],
    ['pending', LATER, true],              // Razorpay is retrying a failed charge
    ['cancelled', LATER, true],            // cancelled, but paid to the end of the cycle
    ['cancelled', EARLIER, false],
    ['cancelled', null, false],
    ['halted', LATER, false],              // every retry failed
    ['created', null, false],
    ['authenticated', null, false],        // mandate approved, first charge not confirmed
    ['completed', EARLIER, false],
    ['expired', null, false],
  ];
  for (const [status, currentEnd, pays] of cases) {
    const e = decide(facts({ contractCount: 3, subscriptions: [{ status, currentEnd }] }));
    assert.equal(e.paid, pays, `${status} with end ${currentEnd?.toISOString() ?? 'none'}`);
    assert.equal(e.readOnly, !pays, status);
  }
});

test('a paying subscription reports its end date as paid-until', () => {
  const e = decide(facts({ subscriptions: [{ status: 'active', currentEnd: LATER }] }));
  assert.equal(e.source, 'subscription');
  assert.equal(e.paidUntil, '2026-10-27');
});

test('a live grant pays; an expired or revoked one does not', () => {
  assert.equal(decide(facts({ grants: [{ until: '2026-12-31', revokedAt: null }] })).source, 'grant');
  assert.equal(decide(facts({ grants: [{ until: '2026-09-26', revokedAt: null }] })).paid, false);
  assert.equal(decide(facts({ grants: [{ until: '2026-12-31', revokedAt: EARLIER }] })).paid, false);
});

test('a grant is good through the whole of its last day in India', () => {
  const grant = facts({ grants: [{ until: '2026-09-27', revokedAt: null }] });
  // 23:30 IST on the 27th
  assert.equal(decide(grant, true, new Date('2026-09-27T18:00:00Z')).paid, true);
  // 00:30 IST on the 27th, still the 26th in UTC
  assert.equal(decide(grant, true, new Date('2026-09-26T19:00:00Z')).paid, true);
  // 00:30 IST on the 28th
  assert.equal(decide(grant, true, new Date('2026-09-27T19:00:00Z')).paid, false);
});

test('a grant and a subscription together pay until the later of the two', () => {
  const e = decide(facts({
    subscriptions: [{ status: 'active', currentEnd: LATER }],
    grants: [{ until: '2027-03-31', revokedAt: null }],
  }));
  assert.equal(e.source, 'subscription');
  assert.equal(e.paidUntil, '2027-03-31');
});

test('with billing unconfigured every account is unlimited', () => {
  const e = decide(facts({ contractCount: 5 }), false);
  assert.equal(e.paid, true);
  assert.equal(e.readOnly, false);
  assert.equal(e.canCreate, true);
  assert.equal(e.limit, null);
});

test('indiaDate is the calendar date in Kolkata', () => {
  assert.equal(indiaDate(new Date('2026-09-26T19:00:00Z')), '2026-09-27');
  assert.equal(indiaDate(new Date('2026-09-26T18:00:00Z')), '2026-09-26');
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd server && NODE_ENV=test node --env-file=../.env --test test/entitlement.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the decision**

`server/src/billing/entitlement.ts`:

```ts
export const FREE_CONTRACT_LIMIT = 1;

export interface Entitlement {
  paid: boolean;
  source: 'admin' | 'subscription' | 'grant' | 'free';
  /** The later of the paying subscription's end and the live grant's last day. */
  paidUntil: string | null;
  contractCount: number;
  /** FREE_CONTRACT_LIMIT when not paid, otherwise null. */
  limit: number | null;
  /** Not paid, and holding more contracts than the free plan keeps. */
  readOnly: boolean;
  canCreate: boolean;
}

export interface EntitlementFacts {
  role: 'admin' | 'user';
  contractCount: number;
  subscriptions: ReadonlyArray<{ status: string; currentEnd: Date | null }>;
  grants: ReadonlyArray<{ until: string; revokedAt: Date | null }>;
}

/** Grants are written as Indian calendar dates, so "today" is Kolkata's. */
export function indiaDate(at: Date): string {
  return at.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/**
 * `pending` pays: Razorpay is still retrying, and cutting someone off mid-retry
 * punishes a bank's hiccup. `cancelled` pays until its cycle ends — with
 * cancel_at_cycle_end Razorpay normally keeps it `active` until then, and this
 * covers it reporting `cancelled` early.
 */
export function subscriptionPays(s: { status: string; currentEnd: Date | null }, now: Date): boolean {
  if (s.status === 'active' || s.status === 'pending') return true;
  return s.status === 'cancelled' && s.currentEnd !== null && s.currentEnd > now;
}

/**
 * The only place that decides what an account may do. `enforced` is false when
 * billing is unconfigured: with no way to pay, nobody is limited.
 */
export function decideEntitlement(f: EntitlementFacts, opts: { enforced: boolean; now: Date }): Entitlement {
  const today = indiaDate(opts.now);
  const paying = f.subscriptions.filter((s) => subscriptionPays(s, opts.now));
  const grants = f.grants.filter((g) => g.revokedAt === null && g.until >= today);

  const ends = [
    ...paying.flatMap((s) => (s.currentEnd ? [indiaDate(s.currentEnd)] : [])),
    ...grants.map((g) => g.until),
  ].sort();

  const source: Entitlement['source'] = f.role === 'admin' ? 'admin'
    : paying.length > 0 ? 'subscription'
    : grants.length > 0 ? 'grant'
    : 'free';
  const paid = !opts.enforced || source !== 'free';

  return {
    paid,
    source,
    paidUntil: ends.at(-1) ?? null,
    contractCount: f.contractCount,
    limit: paid ? null : FREE_CONTRACT_LIMIT,
    readOnly: !paid && f.contractCount > FREE_CONTRACT_LIMIT,
    canCreate: paid || f.contractCount < FREE_CONTRACT_LIMIT,
  };
}
```

`server/src/billing/state.ts`:

```ts
import { billingConfigFromEnv, type BillingConfig } from './config.ts';
import { httpRazorpay, type RazorpayClient } from './razorpay.ts';

export interface Billing {
  config: BillingConfig;
  client: RazorpayClient;
}

/**
 * The app's billing, set once by createApp. Module state rather than a
 * parameter threaded through every router: there is one app per process, and
 * the test runner gives each test file its own process.
 */
let current: Billing | null = null;

export function setBilling(billing: Billing | null): void { current = billing; }
export function getBilling(): Billing | null { return current; }

export function billingFromEnv(): Billing | null {
  const config = billingConfigFromEnv();
  return config ? { config, client: httpRazorpay(config) } : null;
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `cd server && NODE_ENV=test node --env-file=../.env --test test/entitlement.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/billing/entitlement.ts server/src/billing/state.ts server/test/entitlement.test.ts
git commit -m "feat(server): decide what an account may do from its plan, grants and contracts"
```

---

### Task 5: Billing repositories and Razorpay sync

**Files:**
- Create: `server/src/repo/subscriptions.ts`, `server/src/repo/grants.ts`, `server/src/billing/access.ts`, `server/src/billing/sync.ts`
- Test: `server/test/sync.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces:
  - `repo/subscriptions.ts`:
    - `type Queryable = pg.Pool | pg.PoolClient`
    - `const CLOSED_STATUSES: readonly string[]` = `['cancelled', 'completed', 'expired']`
    - `interface SubscriptionRow { id: number; userId: number; razorpayId: string; period: Period; status: string; currentStart: Date | null; currentEnd: Date | null; cancelAtCycleEnd: boolean }`
    - `loadEntitlementFacts(userId: number, q?: Queryable): Promise<EntitlementFacts | null>`
    - `insertSubscription(q: Queryable, i: { userId: number; razorpayId: string; period: Period; status: string }): Promise<SubscriptionRow>`
    - `subscriptionsOf(userId: number, q?: Queryable): Promise<SubscriptionRow[]>` — newest first
    - `subscriptionByRazorpayId(razorpayId: string, q?: Queryable): Promise<SubscriptionRow | null>`
    - `applyRazorpaySubscription(rz: RzSubscription, q?: Queryable): Promise<SubscriptionRow | null>`
    - `markCancelAtCycleEnd(id: number, q?: Queryable): Promise<void>`
    - `recordCharge(c: { paymentId: string; subscriptionId: number; amountPaise: number; paidAt: Date; invoiceId: string | null }, q?: Queryable): Promise<void>`
    - `interface ChargeRow { paymentId: string; amountPaise: number; paidAt: Date; period: Period }`
    - `chargesOf(userId: number): Promise<ChargeRow[]>` — newest first
    - `eventSeen(eventId: string): Promise<boolean>`, `recordEvent(eventId: string, type: string, payload: unknown): Promise<void>`
  - `repo/grants.ts`:
    - `interface GrantRow { id: number; userId: number; until: string; note: string; grantedBy: number; createdAt: Date; revokedAt: Date | null }`
    - `liveGrantOf(userId: number, today: string, q?: Queryable): Promise<GrantRow | null>`
    - `createGrant(g: { userId: number; until: string; note: string; grantedBy: number }): Promise<GrantRow>`
    - `revokeGrant(id: number): Promise<boolean>`
  - `billing/access.ts`: `entitlementFor(userId: number, q?: Queryable): Promise<Entitlement | null>`
  - `billing/sync.ts`:
    - `syncSubscription(client: RazorpayClient, razorpayId: string): Promise<SubscriptionRow | null>`
    - `recordPayment(client: RazorpayClient, paymentId: string, subscriptionRowId: number): Promise<void>`
    - `needsRefresh(s: SubscriptionRow, now: Date): boolean`
    - `refreshStale(client: RazorpayClient, subs: SubscriptionRow[], now?: Date): Promise<void>`
    - `forgetRefreshes(): void` (tests only)

- [ ] **Step 1: Write the failing tests**

`server/test/sync.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.ts';
import { runMigrations } from '../src/migrate.ts';
import { setBilling } from '../src/billing/state.ts';
import { entitlementFor } from '../src/billing/access.ts';
import { forgetRefreshes, recordPayment, refreshStale, syncSubscription } from '../src/billing/sync.ts';
import {
  chargesOf, insertSubscription, subscriptionsOf,
} from '../src/repo/subscriptions.ts';
import { createGrant, liveGrantOf, revokeGrant } from '../src/repo/grants.ts';
import { fakeRazorpay, testBilling } from './fakes.ts';

const rz = fakeRazorpay();
let user = 0;
let admin = 0;

test.before(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await runMigrations(pool);
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO users (email, password_hash, role)
     VALUES ('admin@test.invalid', 'x', 'admin'), ('user@test.invalid', 'x', 'user') RETURNING id`,
  );
  [admin, user] = [rows[0]!.id, rows[1]!.id];
  setBilling(testBilling(rz));
});
test.after(async () => { await pool.end(); });
test.beforeEach(() => { rz.failing = false; forgetRefreshes(); });

test('syncing stores what Razorpay now says, times included', async () => {
  const made = await rz.createSubscription({ planId: 'plan_yearly', totalCount: 10, notes: {} });
  await insertSubscription(pool, { userId: user, razorpayId: made.id, period: 'yearly', status: 'created' });
  rz.set(made.id, { status: 'active', current_start: 1_790_000_000, current_end: 1_821_536_000 });

  const row = await syncSubscription(rz, made.id);
  assert.equal(row?.status, 'active');
  assert.equal(row?.currentEnd?.getTime(), 1_821_536_000 * 1000);
  assert.equal((await entitlementFor(user))?.source, 'subscription');
});

test('a captured payment is recorded once however often it is seen', async () => {
  const [sub] = await subscriptionsOf(user);
  rz.payments.set('pay_1', { id: 'pay_1', amount: 500_000, status: 'captured', created_at: 1_790_000_100, invoice_id: 'inv_1' });
  await recordPayment(rz, 'pay_1', sub!.id);
  await recordPayment(rz, 'pay_1', sub!.id);
  const charges = await chargesOf(user);
  assert.equal(charges.length, 1);
  assert.deepEqual({ ...charges[0], paidAt: charges[0]!.paidAt.getTime() },
    { paymentId: 'pay_1', amountPaise: 500_000, paidAt: 1_790_000_100_000, period: 'yearly' });
});

test('a payment that is not captured is not a charge', async () => {
  const [sub] = await subscriptionsOf(user);
  rz.payments.set('pay_2', { id: 'pay_2', amount: 500_000, status: 'failed', created_at: 1_790_000_200, invoice_id: null });
  await recordPayment(rz, 'pay_2', sub!.id);
  assert.equal((await chargesOf(user)).length, 1);
});

test('the lazy refresh picks up an activation nobody told us about, once a minute at most', async () => {
  const made = await rz.createSubscription({ planId: 'plan_monthly', totalCount: 120, notes: {} });
  await insertSubscription(pool, { userId: admin, razorpayId: made.id, period: 'monthly', status: 'created' });
  rz.set(made.id, { status: 'authenticated' });

  const now = new Date();
  await refreshStale(rz, await subscriptionsOf(admin), now);
  assert.equal((await subscriptionsOf(admin))[0]!.status, 'authenticated');

  rz.set(made.id, { status: 'active' });
  await refreshStale(rz, await subscriptionsOf(admin), new Date(now.getTime() + 30_000));
  assert.equal((await subscriptionsOf(admin))[0]!.status, 'authenticated', 'throttled within the minute');

  await refreshStale(rz, await subscriptionsOf(admin), new Date(now.getTime() + 61_000));
  assert.equal((await subscriptionsOf(admin))[0]!.status, 'active');
});

test('the lazy refresh survives Razorpay being down', async () => {
  const made = await rz.createSubscription({ planId: 'plan_monthly', totalCount: 120, notes: {} });
  await insertSubscription(pool, { userId: admin, razorpayId: made.id, period: 'monthly', status: 'created' });
  rz.failing = true;
  await refreshStale(rz, await subscriptionsOf(admin));   // must not throw
});

test('a new grant revokes the previous one; revoking twice finds nothing', async () => {
  const first = await createGrant({ userId: user, until: '2027-01-31', note: 'UPI ref 1', grantedBy: admin });
  const second = await createGrant({ userId: user, until: '2027-03-31', note: 'UPI ref 2', grantedBy: admin });
  const live = await liveGrantOf(user, '2026-09-27');
  assert.equal(live?.id, second.id);
  const { rows } = await pool.query('SELECT revoked_at FROM access_grants WHERE id = $1', [first.id]);
  assert.notEqual(rows[0].revoked_at, null);
  assert.equal(await revokeGrant(second.id), true);
  assert.equal(await revokeGrant(second.id), false);
  assert.equal(await liveGrantOf(user, '2026-09-27'), null);
});

test('entitlementFor reports nothing for an account that does not exist', async () => {
  assert.equal(await entitlementFor(999_999), null);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd server && NODE_ENV=test node --env-file=../.env --test test/sync.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the repositories**

`server/src/repo/subscriptions.ts`:

```ts
import type pg from 'pg';
import { pool } from '../db.ts';
import type { Period } from '../billing/config.ts';
import type { EntitlementFacts } from '../billing/entitlement.ts';
import type { RzSubscription } from '../billing/razorpay.ts';

export type Queryable = pg.Pool | pg.PoolClient;

/** Statuses after which a subscription can never charge again. */
export const CLOSED_STATUSES: readonly string[] = ['cancelled', 'completed', 'expired'];

export interface SubscriptionRow {
  id: number;
  userId: number;
  razorpayId: string;
  period: Period;
  status: string;
  currentStart: Date | null;
  currentEnd: Date | null;
  cancelAtCycleEnd: boolean;
}

const COLUMNS = `id, user_id AS "userId", razorpay_subscription_id AS "razorpayId", period, status,
  current_start AS "currentStart", current_end AS "currentEnd", cancel_at_cycle_end AS "cancelAtCycleEnd"`;

export async function loadEntitlementFacts(userId: number, q: Queryable = pool): Promise<EntitlementFacts | null> {
  const { rows } = await q.query<{ role: 'admin' | 'user'; contract_count: number }>(
    `SELECT role, (SELECT count(*)::int FROM contracts WHERE user_id = users.id) AS contract_count
       FROM users WHERE id = $1`, [userId],
  );
  const user = rows[0];
  if (!user) return null;
  const subs = await q.query<{ status: string; currentEnd: Date | null }>(
    'SELECT status, current_end AS "currentEnd" FROM subscriptions WHERE user_id = $1', [userId],
  );
  const grants = await q.query<{ until: string; revokedAt: Date | null }>(
    'SELECT until, revoked_at AS "revokedAt" FROM access_grants WHERE user_id = $1', [userId],
  );
  return { role: user.role, contractCount: user.contract_count, subscriptions: subs.rows, grants: grants.rows };
}

export async function insertSubscription(
  q: Queryable, i: { userId: number; razorpayId: string; period: Period; status: string },
): Promise<SubscriptionRow> {
  const { rows } = await q.query<SubscriptionRow>(
    `INSERT INTO subscriptions (user_id, razorpay_subscription_id, period, status)
     VALUES ($1, $2, $3, $4) RETURNING ${COLUMNS}`,
    [i.userId, i.razorpayId, i.period, i.status],
  );
  return rows[0]!;
}

export async function subscriptionsOf(userId: number, q: Queryable = pool): Promise<SubscriptionRow[]> {
  const { rows } = await q.query<SubscriptionRow>(
    `SELECT ${COLUMNS} FROM subscriptions WHERE user_id = $1 ORDER BY id DESC`, [userId],
  );
  return rows;
}

export async function subscriptionByRazorpayId(razorpayId: string, q: Queryable = pool): Promise<SubscriptionRow | null> {
  const { rows } = await q.query<SubscriptionRow>(
    `SELECT ${COLUMNS} FROM subscriptions WHERE razorpay_subscription_id = $1`, [razorpayId],
  );
  return rows[0] ?? null;
}

/** Stores what Razorpay reported. A subscription this database does not hold is left alone. */
export async function applyRazorpaySubscription(rz: RzSubscription, q: Queryable = pool): Promise<SubscriptionRow | null> {
  const { rows } = await q.query<SubscriptionRow>(
    `UPDATE subscriptions
        SET status = $2,
            current_start = to_timestamp($3::double precision),
            current_end = to_timestamp($4::double precision),
            updated_at = now()
      WHERE razorpay_subscription_id = $1
      RETURNING ${COLUMNS}`,
    [rz.id, rz.status, rz.current_start, rz.current_end],
  );
  return rows[0] ?? null;
}

export async function markCancelAtCycleEnd(id: number, q: Queryable = pool): Promise<void> {
  await q.query('UPDATE subscriptions SET cancel_at_cycle_end = true, updated_at = now() WHERE id = $1', [id]);
}

export async function recordCharge(
  c: { paymentId: string; subscriptionId: number; amountPaise: number; paidAt: Date; invoiceId: string | null },
  q: Queryable = pool,
): Promise<void> {
  await q.query(
    `INSERT INTO subscription_charges (razorpay_payment_id, subscription_id, amount_paise, paid_at, razorpay_invoice_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (razorpay_payment_id) DO NOTHING`,
    [c.paymentId, c.subscriptionId, c.amountPaise, c.paidAt, c.invoiceId],
  );
}

export interface ChargeRow { paymentId: string; amountPaise: number; paidAt: Date; period: Period }

export async function chargesOf(userId: number): Promise<ChargeRow[]> {
  const { rows } = await pool.query<ChargeRow>(
    `SELECT c.razorpay_payment_id AS "paymentId", c.amount_paise::int AS "amountPaise",
            c.paid_at AS "paidAt", s.period
       FROM subscription_charges c JOIN subscriptions s ON s.id = c.subscription_id
      WHERE s.user_id = $1
      ORDER BY c.paid_at DESC`, [userId],
  );
  return rows;
}

export async function eventSeen(eventId: string): Promise<boolean> {
  const { rowCount } = await pool.query('SELECT 1 FROM billing_events WHERE event_id = $1', [eventId]);
  return (rowCount ?? 0) > 0;
}

export async function recordEvent(eventId: string, type: string, payload: unknown): Promise<void> {
  await pool.query(
    `INSERT INTO billing_events (event_id, event_type, payload) VALUES ($1, $2, $3)
     ON CONFLICT (event_id) DO NOTHING`,
    [eventId, type, JSON.stringify(payload)],
  );
}
```

`server/src/repo/grants.ts`:

```ts
import { pool, withTransaction } from '../db.ts';
import type { Queryable } from './subscriptions.ts';

export interface GrantRow {
  id: number;
  userId: number;
  until: string;
  note: string;
  grantedBy: number;
  createdAt: Date;
  revokedAt: Date | null;
}

const COLUMNS = `id, user_id AS "userId", until, note, granted_by AS "grantedBy",
  created_at AS "createdAt", revoked_at AS "revokedAt"`;

export async function liveGrantOf(userId: number, today: string, q: Queryable = pool): Promise<GrantRow | null> {
  const { rows } = await q.query<GrantRow>(
    `SELECT ${COLUMNS} FROM access_grants
      WHERE user_id = $1 AND revoked_at IS NULL AND until >= $2::date
      ORDER BY until DESC LIMIT 1`, [userId, today],
  );
  return rows[0] ?? null;
}

/** One live grant per account: the new one replaces whatever was there. */
export async function createGrant(g: { userId: number; until: string; note: string; grantedBy: number }): Promise<GrantRow> {
  return withTransaction(async (client) => {
    await client.query(
      'UPDATE access_grants SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [g.userId],
    );
    const { rows } = await client.query<GrantRow>(
      `INSERT INTO access_grants (user_id, until, note, granted_by) VALUES ($1, $2, $3, $4)
       RETURNING ${COLUMNS}`,
      [g.userId, g.until, g.note, g.grantedBy],
    );
    return rows[0]!;
  });
}

/** Marks it revoked; nothing is deleted. False when there was no live grant by that id. */
export async function revokeGrant(id: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    'UPDATE access_grants SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL', [id],
  );
  return (rowCount ?? 0) > 0;
}
```

- [ ] **Step 4: Write access and sync**

`server/src/billing/access.ts`:

```ts
import { pool } from '../db.ts';
import { loadEntitlementFacts, type Queryable } from '../repo/subscriptions.ts';
import { decideEntitlement, type Entitlement } from './entitlement.ts';
import { getBilling } from './state.ts';

/** Null when the account no longer exists. */
export async function entitlementFor(userId: number, q: Queryable = pool): Promise<Entitlement | null> {
  const facts = await loadEntitlementFacts(userId, q);
  return facts && decideEntitlement(facts, { enforced: getBilling() !== null, now: new Date() });
}
```

`server/src/billing/sync.ts`:

```ts
import {
  applyRazorpaySubscription, recordCharge, type SubscriptionRow,
} from '../repo/subscriptions.ts';
import type { RazorpayClient } from './razorpay.ts';

/**
 * Asks Razorpay for the subscription and stores the answer. Every route that
 * learns something changed — the checkout callback, a webhook, the lazy
 * refresh — goes through here, so none of them trusts a payload's copy and
 * the order events arrive in stops mattering.
 */
export async function syncSubscription(client: RazorpayClient, razorpayId: string): Promise<SubscriptionRow | null> {
  return applyRazorpaySubscription(await client.fetchSubscription(razorpayId));
}

/** Records a charge only once the money is captured. */
export async function recordPayment(client: RazorpayClient, paymentId: string, subscriptionRowId: number): Promise<void> {
  const payment = await client.fetchPayment(paymentId);
  if (payment.status !== 'captured') return;
  await recordCharge({
    paymentId: payment.id,
    subscriptionId: subscriptionRowId,
    amountPaise: payment.amount,
    paidAt: new Date(payment.created_at * 1000),
    invoiceId: payment.invoice_id ?? null,
  });
}

/**
 * A subscription whose state is still settling, or whose paid cycle has run
 * out without our hearing of the renewal. The free Render instance sleeps at
 * night and misses webhooks, so this is how a payment made then lands.
 */
export function needsRefresh(s: SubscriptionRow, now: Date): boolean {
  if (s.status === 'created' || s.status === 'authenticated' || s.status === 'pending') return true;
  return s.status === 'active' && s.currentEnd !== null && s.currentEnd < now;
}

const REFRESH_EVERY_MS = 60_000;
const lastRefresh = new Map<string, number>();

/** Never throws: an unreachable Razorpay leaves the stored state as it was. */
export async function refreshStale(client: RazorpayClient, subs: SubscriptionRow[], now = new Date()): Promise<void> {
  for (const s of subs) {
    if (!needsRefresh(s, now)) continue;
    const last = lastRefresh.get(s.razorpayId);
    if (last !== undefined && now.getTime() - last < REFRESH_EVERY_MS) continue;
    lastRefresh.set(s.razorpayId, now.getTime());
    try {
      await syncSubscription(client, s.razorpayId);
    } catch (err) {
      console.error(`Could not refresh ${s.razorpayId}: ${(err as Error).message}`);
    }
  }
}

/** Tests only: forget the throttle so each test starts fresh. */
export function forgetRefreshes(): void { lastRefresh.clear(); }
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `cd server && NODE_ENV=test node --env-file=../.env --test test/sync.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 6: Commit**

```bash
git add server/src/repo/subscriptions.ts server/src/repo/grants.ts server/src/billing/access.ts server/src/billing/sync.ts server/test/sync.test.ts
git commit -m "feat(server): store subscriptions, charges and grants, and sync them from Razorpay"
```

---

### Task 6: Enforce the free limit and read-only

**Files:**
- Modify: `server/src/app.ts` (options), `server/src/repo/contracts.ts:147-165` (`createContract`), `server/src/routes/contracts.ts:67-90`
- Create: `server/test/helpers.ts`
- Test: `server/test/limits.test.ts`

**Interfaces:**
- Consumes: `entitlementFor` (Task 5), `FREE_CONTRACT_LIMIT` (Task 4), `setBilling`, `billingFromEnv`, `Billing` (Task 4).
- Produces:
  - `interface AppOptions { billing?: Billing | null }`; `createApp(options?: AppOptions)` — `billing` omitted reads the environment, `null` means unconfigured.
  - `class ContractLimitError extends Error`; `createContract(agreementNo: string, ownerId: number | null, opts?: { limit?: number }): Promise<ContractRecord>`
  - In `server/test/helpers.ts`: `resetDatabase()`, `startApp(options?)`, `agent(base)`, `signedIn(base, email, role?)`, `type Agent`.

- [ ] **Step 1: Write the test helpers**

`server/test/helpers.ts`:

```ts
import { pool } from '../src/db.ts';
import { runMigrations } from '../src/migrate.ts';
import { createApp, type AppOptions } from '../src/app.ts';
import { hashPassword } from '../src/auth/password.ts';

export const PASSWORD = 'correct horse battery';

export async function resetDatabase(): Promise<void> {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await runMigrations(pool);
}

export async function startApp(options: AppOptions = {}) {
  const server = createApp(options).listen(0);
  await new Promise((r) => server.once('listening', r));
  const addr = server.address();
  const base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
  return { base, close: () => new Promise<void>((r) => server.close(() => r())) };
}

export type Agent = (path: string, init?: RequestInit) => Promise<Response>;

/** A cookie-jar fetch: keeps connect.sid between calls. */
export function agent(base: string): Agent {
  let cookie = '';
  return async (path, init = {}) => {
    const res = await fetch(base + path, {
      ...init,
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...init.headers },
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0]!;
    return res;
  };
}

/**
 * Makes the account directly rather than through sign-up, whose limiter allows
 * ten an hour, then signs in through the real route. Login allows twenty per
 * fifteen minutes, so keep a file under that.
 */
export async function signedIn(base: string, email: string, role: 'admin' | 'user' = 'user') {
  const { rows } = await pool.query<{ id: number }>(
    'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
    [email, await hashPassword(PASSWORD), role],
  );
  const as = agent(base);
  const res = await as('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password: PASSWORD }) });
  if (res.status !== 200) throw new Error(`sign-in failed for ${email}: ${res.status}`);
  return { as, id: rows[0]!.id };
}
```

- [ ] **Step 2: Write the failing tests**

`server/test/limits.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.ts';
import { getBilling, setBilling } from '../src/billing/state.ts';
import { fakeRazorpay, testBilling } from './fakes.ts';
import { resetDatabase, signedIn, startApp } from './helpers.ts';

let app: Awaited<ReturnType<typeof startApp>>;

test.before(async () => {
  await resetDatabase();
  app = await startApp({ billing: testBilling(fakeRazorpay()) });
});
test.after(async () => { await app.close(); await pool.end(); });

const create = (as: (p: string, i?: RequestInit) => Promise<Response>, agreementNo: string) =>
  as('/api/contracts', { method: 'POST', body: JSON.stringify({ agreementNo }) });

async function contractFor(userId: number, agreementNo: string): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    'INSERT INTO contracts (agreement_no, user_id) VALUES ($1, $2) RETURNING id', [agreementNo, userId],
  );
  return rows[0]!.id;
}

test('a free account creates one contract and is refused a second', async () => {
  const { as } = await signedIn(app.base, 'free@test.invalid');
  assert.equal((await create(as, '1 of 2026-27')).status, 201);
  const second = await create(as, '2 of 2026-27');
  assert.equal(second.status, 402);
  assert.equal((await second.json()).code, 'limit');
});

test('two tabs creating the second contract at once: exactly one succeeds', async () => {
  const { as } = await signedIn(app.base, 'race@test.invalid');
  const statuses = (await Promise.all([create(as, 'A'), create(as, 'B')])).map((r) => r.status).sort();
  assert.deepEqual(statuses, [201, 402]);
});

test('an administrator is never limited', async () => {
  const { as } = await signedIn(app.base, 'boss@test.invalid', 'admin');
  for (const n of ['1', '2', '3']) assert.equal((await create(as, n)).status, 201);
});

test('an account over the limit reads, prints and deletes, but cannot write', async () => {
  const { as, id } = await signedIn(app.base, 'lapsed@test.invalid');
  const first = await contractFor(id, 'kept');
  const second = await contractFor(id, 'extra');

  for (const [path, body] of [
    [`/api/contracts/${first}`, { contractor: 'M/s. X' }],
    [`/api/contracts/${first}/components`, []],
    [`/api/contracts/${first}/progress`, []],
    [`/api/contracts/${first}/payments`, []],
    [`/api/contracts/${first}/expenditure`, []],
  ] as const) {
    const res = await as(path, { method: 'PUT', body: JSON.stringify(body) });
    assert.equal(res.status, 402, path);
    assert.equal((await res.json()).code, 'read_only', path);
  }

  assert.equal((await as(`/api/contracts/${first}`)).status, 200);
  // An empty contract may not calculate; what matters is that billing does not refuse it.
  assert.notEqual((await as(`/api/contracts/${first}/calculation`)).status, 402);
  assert.equal((await as(`/api/contracts/${second}`, { method: 'DELETE' })).status, 204);

  // Down to one contract: that one is editable again, for free.
  const res = await as(`/api/contracts/${first}`, { method: 'PUT', body: JSON.stringify({ contractor: 'M/s. X' }) });
  assert.equal(res.status, 200);
});

test('a live grant lifts both limits', async () => {
  const { as, id } = await signedIn(app.base, 'granted@test.invalid');
  const { rows } = await pool.query<{ id: number }>("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  await pool.query(
    "INSERT INTO access_grants (user_id, until, granted_by) VALUES ($1, '2099-12-31', $2)", [id, rows[0]!.id],
  );
  await contractFor(id, 'one');
  const two = await contractFor(id, 'two');
  assert.equal((await create(as, 'three')).status, 201);
  const res = await as(`/api/contracts/${two}`, { method: 'PUT', body: JSON.stringify({ contractor: 'Y' }) });
  assert.equal(res.status, 200);
});

test('an active subscription lifts both limits', async () => {
  const { as, id } = await signedIn(app.base, 'subscriber@test.invalid');
  await pool.query(
    `INSERT INTO subscriptions (user_id, razorpay_subscription_id, period, status, current_end)
     VALUES ($1, 'sub_active', 'yearly', 'active', now() + interval '1 year')`, [id],
  );
  await contractFor(id, 'one');
  assert.equal((await create(as, 'two')).status, 201);
});

test('with billing unconfigured nobody is limited', async () => {
  const held = getBilling();
  setBilling(null);
  try {
    const { as, id } = await signedIn(app.base, 'nobilling@test.invalid');
    const first = await contractFor(id, 'one');
    await contractFor(id, 'two');
    assert.equal((await create(as, 'three')).status, 201);
    const res = await as(`/api/contracts/${first}`, { method: 'PUT', body: JSON.stringify({ contractor: 'Z' }) });
    assert.equal(res.status, 200);
  } finally {
    setBilling(held);
  }
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `cd server && NODE_ENV=test node --env-file=../.env --test test/limits.test.ts`
Expected: FAIL — `startApp` passes an option `createApp` ignores; the second create answers 201, not 402.

- [ ] **Step 4: Give `createApp` its billing option**

In `server/src/app.ts`, add the imports and change the signature; the first line of the body sets billing:

```ts
import { billingFromEnv, setBilling, type Billing } from './billing/state.ts';

export interface AppOptions {
  /** Omitted: read from the environment. null: unconfigured, nobody limited. */
  billing?: Billing | null;
}

export function createApp(options: AppOptions = {}): express.Express {
  setBilling(options.billing !== undefined ? options.billing : billingFromEnv());
  const app = express();
  // ...the rest of the existing body, unchanged
```

- [ ] **Step 5: Let `createContract` hold the line under a lock**

In `server/src/repo/contracts.ts`, add above `createContract`:

```ts
/** Raised inside the create transaction when the account is already at its limit. */
export class ContractLimitError extends Error {
  constructor() { super('Contract limit reached'); }
}
```

and replace `createContract` with:

```ts
/**
 * ownerId is null only for the seeder, whose rows the first account adopts.
 *
 * With a limit, the owner's row is locked before counting, so two requests
 * racing to create a second contract are serialised and the later one sees
 * the earlier one's row.
 */
export async function createContract(
  agreementNo: string, ownerId: number | null, opts: { limit?: number } = {},
): Promise<ContractRecord> {
  return withTransaction(async (client) => {
    if (opts.limit !== undefined && ownerId !== null) {
      await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [ownerId]);
      const { rows: counted } = await client.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM contracts WHERE user_id = $1', [ownerId],
      );
      if (counted[0]!.n >= opts.limit) throw new ContractLimitError();
    }
    const { rows } = await client.query<ContractDbRow>(
      `INSERT INTO contracts (agreement_no, user_id) VALUES ($1, $2) RETURNING ${CONTRACT_COLUMNS}`,
      [agreementNo, ownerId],
    );
    const record = toRecord(rows[0]!);
    for (const key of COMPONENT_KEYS) {
      const c = defaultComponent(key);
      await client.query(
        'INSERT INTO components (contract_id, key, percent, factor, base_rule, base_override) VALUES ($1,$2,$3,$4,$5,$6)',
        [record.id, c.key, c.percent, c.factor, c.baseRule, c.baseOverride],
      );
    }
    return record;
  });
}
```

- [ ] **Step 6: Enforce in the contracts router**

In `server/src/routes/contracts.ts`, add imports:

```ts
import { entitlementFor } from '../billing/access.ts';
import { FREE_CONTRACT_LIMIT } from '../billing/entitlement.ts';
import { ContractLimitError } from '../repo/contracts.ts';
```

(`createContract` is already imported from `../repo/contracts.ts`; add `ContractLimitError` to that import instead of a second line.)

Add below `parseId`:

```ts
const LIMIT_MESSAGE = 'The free plan holds one contract. Subscribe for unlimited contracts.';
const READ_ONLY_MESSAGE =
  'This account is over its plan, so its contracts are read-only. Subscribe, or delete down to one contract, to edit again.';

/** Reading and deleting are never billing's business: deleting is how you get back under the limit. */
const ALWAYS_ALLOWED = new Set(['GET', 'HEAD', 'DELETE']);
```

Replace the `POST /` handler:

```ts
contractsRouter.post('/', async (req, res) => {
  const parsed = z.object({ agreementNo: z.string().min(1).max(200) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'An agreement number is required' }); return; }
  const userId = req.session.user!.id;
  const access = await entitlementFor(userId);
  if (!access) { res.status(401).json({ error: 'Not signed in' }); return; }
  try {
    const limit = access.paid ? undefined : FREE_CONTRACT_LIMIT;
    res.status(201).json(await createContract(parsed.data.agreementNo, userId, { limit }));
  } catch (err) {
    if (err instanceof ContractLimitError) {
      res.status(402).json({ error: LIMIT_MESSAGE, code: 'limit' });
      return;
    }
    throw err;
  }
});
```

In the `/:id` chokepoint, after the owner check and before `next()`:

```ts
    if (!ALWAYS_ALLOWED.has(req.method)) {
      const access = await entitlementFor(req.session.user!.id);
      if (access?.readOnly) {
        res.status(402).json({ error: READ_ONLY_MESSAGE, code: 'read_only' });
        return;
      }
    }
    next();
```

- [ ] **Step 7: Run the new tests, then the whole server suite**

Run: `cd server && NODE_ENV=test node --env-file=../.env --test test/limits.test.ts`
Expected: PASS (7 tests)

Run: `npm test -w @pes/server`
Expected: every suite passes — the older suites build their app with `createApp()`, which under `NODE_ENV=test` is unconfigured.

- [ ] **Step 8: Commit**

```bash
git add server/src/app.ts server/src/repo/contracts.ts server/src/routes/contracts.ts server/test/helpers.ts server/test/limits.test.ts
git commit -m "feat(server): a free account keeps one contract, and an account over its plan is read-only"
```

---

### Task 7: The billing API

**Files:**
- Create: `server/src/routes/billing.ts`
- Modify: `server/src/app.ts` (mount)
- Test: `server/test/billing.test.ts`

**Interfaces:**
- Consumes: Tasks 2–6.
- Produces (the web relies on these shapes exactly):
  - `GET /api/billing` → `BillingView`:
    ```ts
    interface BillingView {
      configured: boolean;
      keyId: string | null;
      entitlement: Entitlement;
      subscription: { period: Period; status: string; currentEnd: string | null; cancelAtCycleEnd: boolean } | null;
      grant: { until: string } | null;
      charges: Array<{ paymentId: string; amountPaise: number; paidAt: string; period: Period }>;
    }
    ```
  - `GET /api/billing/plans` → `Array<{ period: Period; amountPaise: number; currency: string }>`
  - `POST /api/billing/subscriptions { period }` → 201 `{ subscriptionId: string; keyId: string; email: string }`; 409 `{ error, code: 'subscribed' }`
  - `POST /api/billing/subscriptions/verify { razorpay_payment_id, razorpay_subscription_id, razorpay_signature }` → 200 `BillingView`; 400 bad signature; 404 not the caller's
  - `POST /api/billing/subscription/cancel` → 200 `BillingView`; 404 nothing to cancel
  - Every route but `GET /` → 503 `{ error: 'Billing is not available yet' }` when unconfigured.
  - `export function forgetPlanCache(): void` (tests)

- [ ] **Step 1: Write the failing tests**

`server/test/billing.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.ts';
import { getBilling, setBilling } from '../src/billing/state.ts';
import { forgetRefreshes } from '../src/billing/sync.ts';
import { fakeRazorpay, signCheckout, testBilling } from './fakes.ts';
import { resetDatabase, signedIn, startApp, type Agent } from './helpers.ts';

const rz = fakeRazorpay();
let app: Awaited<ReturnType<typeof startApp>>;

test.before(async () => {
  await resetDatabase();
  app = await startApp({ billing: testBilling(rz) });
});
test.after(async () => { await app.close(); await pool.end(); });
test.beforeEach(() => { rz.failing = false; forgetRefreshes(); });

const post = (as: Agent, path: string, body: unknown = {}) =>
  as(path, { method: 'POST', body: JSON.stringify(body) });
const subscribe = (as: Agent, period: string) => post(as, '/api/billing/subscriptions', { period });

async function activate(as: Agent, subscriptionId: string, paymentId: string) {
  rz.set(subscriptionId, { status: 'active', current_start: 1_790_000_000, current_end: 1_821_536_000 });
  rz.payments.set(paymentId, { id: paymentId, amount: 500_000, status: 'captured', created_at: 1_790_000_100, invoice_id: null });
  return post(as, '/api/billing/subscriptions/verify', {
    razorpay_payment_id: paymentId,
    razorpay_subscription_id: subscriptionId,
    razorpay_signature: signCheckout(paymentId, subscriptionId),
  });
}

test('a new account is on the free plan', async () => {
  const { as } = await signedIn(app.base, 'a@test.invalid');
  const view = await (await as('/api/billing')).json();
  assert.equal(view.configured, true);
  assert.equal(view.keyId, 'rzp_test_key');
  assert.equal(view.entitlement.source, 'free');
  assert.equal(view.subscription, null);
  assert.deepEqual(view.charges, []);
});

test('the plans come from Razorpay', async () => {
  const { as } = await signedIn(app.base, 'plans@test.invalid');
  const plans = await (await as('/api/billing/plans')).json();
  assert.deepEqual(plans, [
    { period: 'monthly', amountPaise: 50_000, currency: 'INR' },
    { period: 'half_yearly', amountPaise: 270_000, currency: 'INR' },
    { period: 'yearly', amountPaise: 500_000, currency: 'INR' },
  ]);
});

test('an unknown period is refused', async () => {
  const { as } = await signedIn(app.base, 'weekly@test.invalid');
  assert.equal((await subscribe(as, 'weekly')).status, 400);
});

test('subscribing, abandoning and retrying reuses one subscription per period', async () => {
  const { as } = await signedIn(app.base, 'b@test.invalid');
  const before = rz.created;
  const first = await subscribe(as, 'yearly');
  assert.equal(first.status, 201);
  const made = await first.json();
  assert.equal(made.keyId, 'rzp_test_key');
  assert.equal(made.email, 'b@test.invalid');

  const again = await (await subscribe(as, 'yearly')).json();
  assert.equal(again.subscriptionId, made.subscriptionId);
  assert.equal(rz.created, before + 1);

  const monthly = await (await subscribe(as, 'monthly')).json();
  assert.notEqual(monthly.subscriptionId, made.subscriptionId);
  assert.equal(rz.subs.get(made.subscriptionId)!.status, 'cancelled', 'the abandoned yearly one is cancelled');
});

test('a double click on Pay makes one Razorpay subscription', async () => {
  const { as } = await signedIn(app.base, 'double@test.invalid');
  const before = rz.created;
  const [x, y] = await Promise.all([subscribe(as, 'yearly'), subscribe(as, 'yearly')]);
  assert.equal((await x.json()).subscriptionId, (await y.json()).subscriptionId);
  assert.equal(rz.created, before + 1);
});

test('a verified payment turns the plan on and records the charge', async () => {
  const { as } = await signedIn(app.base, 'c@test.invalid');
  const { subscriptionId } = await (await subscribe(as, 'yearly')).json();
  const res = await activate(as, subscriptionId, 'pay_c');
  assert.equal(res.status, 200);
  const view = await res.json();
  assert.equal(view.entitlement.source, 'subscription');
  assert.equal(view.subscription.status, 'active');
  assert.equal(view.subscription.period, 'yearly');
  assert.equal(view.charges.length, 1);
  assert.equal(view.charges[0].amountPaise, 500_000);

  const conflict = await subscribe(as, 'monthly');
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).code, 'subscribed');
});

test('a tampered signature is refused', async () => {
  const { as } = await signedIn(app.base, 'd@test.invalid');
  const { subscriptionId } = await (await subscribe(as, 'monthly')).json();
  const res = await post(as, '/api/billing/subscriptions/verify', {
    razorpay_payment_id: 'pay_d', razorpay_subscription_id: subscriptionId,
    razorpay_signature: signCheckout('pay_other', subscriptionId),
  });
  assert.equal(res.status, 400);
});

test("verifying someone else's subscription finds nothing", async () => {
  const owner = await signedIn(app.base, 'e@test.invalid');
  const thief = await signedIn(app.base, 'f@test.invalid');
  const { subscriptionId } = await (await subscribe(owner.as, 'monthly')).json();
  const res = await activate(thief.as, subscriptionId, 'pay_f');
  assert.equal(res.status, 404);
});

test('when Razorpay cannot be reached, verify still answers and the plan waits', async () => {
  const { as } = await signedIn(app.base, 'g@test.invalid');
  const { subscriptionId } = await (await subscribe(as, 'monthly')).json();
  rz.failing = true;
  const res = await post(as, '/api/billing/subscriptions/verify', {
    razorpay_payment_id: 'pay_g', razorpay_subscription_id: subscriptionId,
    razorpay_signature: signCheckout('pay_g', subscriptionId),
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).entitlement.source, 'free');
});

test('the lazy refresh activates a plan when the callback and webhook were both lost', async () => {
  const { as } = await signedIn(app.base, 'h@test.invalid');
  const { subscriptionId } = await (await subscribe(as, 'yearly')).json();
  rz.set(subscriptionId, { status: 'active', current_start: 1_790_000_000, current_end: 1_821_536_000 });
  const view = await (await as('/api/billing')).json();
  assert.equal(view.entitlement.source, 'subscription');
});

test('GET /api/billing answers from stored state when Razorpay is down', async () => {
  const { as } = await signedIn(app.base, 'i@test.invalid');
  await subscribe(as, 'yearly');
  rz.failing = true;
  const res = await as('/api/billing');
  assert.equal(res.status, 200);
  assert.equal((await res.json()).entitlement.source, 'free');
});

test('cancelling stops renewal but keeps the plan to the end of the cycle', async () => {
  const { as } = await signedIn(app.base, 'j@test.invalid');
  assert.equal((await post(as, '/api/billing/subscription/cancel')).status, 404);
  const { subscriptionId } = await (await subscribe(as, 'yearly')).json();
  await activate(as, subscriptionId, 'pay_j');
  const res = await post(as, '/api/billing/subscription/cancel');
  assert.equal(res.status, 200);
  const view = await res.json();
  assert.equal(view.subscription.cancelAtCycleEnd, true);
  assert.equal(view.entitlement.paid, true);
});

test('with billing unconfigured the billing routes say so', async () => {
  const held = getBilling();
  setBilling(null);
  try {
    const { as } = await signedIn(app.base, 'k@test.invalid');
    const view = await (await as('/api/billing')).json();
    assert.equal(view.configured, false);
    assert.equal(view.entitlement.paid, true);
    assert.equal((await subscribe(as, 'yearly')).status, 503);
    assert.equal((await as('/api/billing/plans')).status, 503);
  } finally {
    setBilling(held);
  }
});

test('billing needs a session', async () => {
  assert.equal((await fetch(`${app.base}/api/billing`)).status, 401);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd server && NODE_ENV=test node --env-file=../.env --test test/billing.test.ts`
Expected: FAIL — `/api/billing` answers 404.

- [ ] **Step 3: Write the router**

`server/src/routes/billing.ts`:

```ts
import { Router, type Response } from 'express';
import { z } from 'zod';
import { withTransaction } from '../db.ts';
import { requireAuth } from '../auth/middleware.ts';
import { entitlementFor } from '../billing/access.ts';
import { PERIODS, TOTAL_COUNT, type Period } from '../billing/config.ts';
import { indiaDate, type Entitlement } from '../billing/entitlement.ts';
import { verifyCheckoutSignature } from '../billing/signature.ts';
import { getBilling, type Billing } from '../billing/state.ts';
import { recordPayment, refreshStale, syncSubscription } from '../billing/sync.ts';
import { liveGrantOf } from '../repo/grants.ts';
import {
  applyRazorpaySubscription, chargesOf, CLOSED_STATUSES, insertSubscription, markCancelAtCycleEnd,
  subscriptionByRazorpayId, subscriptionsOf,
} from '../repo/subscriptions.ts';

export interface BillingView {
  configured: boolean;
  keyId: string | null;
  entitlement: Entitlement;
  subscription: { period: Period; status: string; currentEnd: string | null; cancelAtCycleEnd: boolean } | null;
  grant: { until: string } | null;
  charges: Array<{ paymentId: string; amountPaise: number; paidAt: string; period: Period }>;
}

/** An open subscription in one of these makes a second one a double charge. */
const BLOCKING = new Set(['active', 'pending', 'authenticated']);

export const billingRouter: Router = Router();
billingRouter.use(requireAuth);

function need(res: Response): Billing | null {
  const billing = getBilling();
  if (!billing) res.status(503).json({ error: 'Billing is not available yet' });
  return billing;
}

/** What the account screen, the banners and the checkout page all read. */
export async function viewFor(userId: number): Promise<BillingView | null> {
  const billing = getBilling();
  if (billing) await refreshStale(billing.client, await subscriptionsOf(userId));
  const entitlement = await entitlementFor(userId);
  if (!entitlement) return null;

  // An abandoned checkout is not the account's subscription.
  const current = (await subscriptionsOf(userId)).find((s) => s.status !== 'created') ?? null;
  const grant = await liveGrantOf(userId, indiaDate(new Date()));
  return {
    configured: billing !== null,
    keyId: billing?.config.keyId ?? null,
    entitlement,
    subscription: current && {
      period: current.period,
      status: current.status,
      currentEnd: current.currentEnd?.toISOString() ?? null,
      cancelAtCycleEnd: current.cancelAtCycleEnd,
    },
    // The note is the administrator's own record, not the account holder's.
    grant: grant && { until: grant.until },
    charges: (await chargesOf(userId)).map((c) => ({
      paymentId: c.paymentId, amountPaise: c.amountPaise, paidAt: c.paidAt.toISOString(), period: c.period,
    })),
  };
}

billingRouter.get('/', async (req, res) => {
  const view = await viewFor(req.session.user!.id);
  if (!view) { res.status(401).json({ error: 'Not signed in' }); return; }
  res.json(view);
});

const PLAN_CACHE_MS = 60 * 60_000;
let planCache: { at: number; plans: Array<{ period: Period; amountPaise: number; currency: string }> } | null = null;

/** Tests only. */
export function forgetPlanCache(): void { planCache = null; }

/** Prices live on the Razorpay plans, so changing one needs no deploy. */
billingRouter.get('/plans', async (_req, res) => {
  const billing = need(res);
  if (!billing) return;
  if (!planCache || Date.now() - planCache.at > PLAN_CACHE_MS) {
    const plans = await Promise.all(PERIODS.map(async (period) => {
      const plan = await billing.client.fetchPlan(billing.config.plans[period]);
      return { period, amountPaise: plan.item.amount, currency: plan.item.currency };
    }));
    planCache = { at: Date.now(), plans };
  }
  res.json(planCache.plans);
});

billingRouter.post('/subscriptions', async (req, res) => {
  const billing = need(res);
  if (!billing) return;
  const parsed = z.object({ period: z.enum(['monthly', 'half_yearly', 'yearly']) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Choose monthly, 6 months or yearly' }); return; }
  const { period } = parsed.data;
  const user = req.session.user!;

  // Serialised on the account's row, so a double click cannot make two mandates.
  const outcome = await withTransaction(async (client) => {
    await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [user.id]);
    const open = (await subscriptionsOf(user.id, client)).filter((s) => !CLOSED_STATUSES.includes(s.status));
    if (open.some((s) => BLOCKING.has(s.status))) return { conflict: true as const };

    const reusable = open.find((s) => s.status === 'created' && s.period === period);
    for (const stale of open) {
      if (stale === reusable) continue;
      await applyRazorpaySubscription(await billing.client.cancelSubscription(stale.razorpayId, false), client);
    }
    if (reusable) return { subscriptionId: reusable.razorpayId };

    const made = await billing.client.createSubscription({
      planId: billing.config.plans[period],
      totalCount: TOTAL_COUNT[period],
      notes: { user_id: String(user.id) },
    });
    await insertSubscription(client, { userId: user.id, razorpayId: made.id, period, status: made.status });
    return { subscriptionId: made.id };
  });

  if ('conflict' in outcome) {
    res.status(409).json({ error: 'This account already has a subscription', code: 'subscribed' });
    return;
  }
  res.status(201).json({ subscriptionId: outcome.subscriptionId, keyId: billing.config.keyId, email: user.email });
});

const checkoutResult = z.object({
  razorpay_payment_id: z.string().min(1).max(100),
  razorpay_subscription_id: z.string().min(1).max(100),
  razorpay_signature: z.string().min(1).max(200),
});

billingRouter.post('/subscriptions/verify', async (req, res) => {
  const billing = need(res);
  if (!billing) return;
  const parsed = checkoutResult.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'The payment could not be verified' }); return; }
  const { razorpay_payment_id: paymentId, razorpay_subscription_id: subscriptionId, razorpay_signature: signature } = parsed.data;

  if (!verifyCheckoutSignature(paymentId, subscriptionId, signature, billing.config.keySecret)) {
    res.status(400).json({ error: 'The payment could not be verified' });
    return;
  }
  const userId = req.session.user!.id;
  const row = await subscriptionByRazorpayId(subscriptionId);
  if (!row || row.userId !== userId) { res.status(404).json({ error: 'No such subscription' }); return; }

  // Razorpay unreachable is not the payer's problem: the webhook or the lazy
  // refresh will land it, and the page shows Confirming meanwhile.
  try {
    await syncSubscription(billing.client, subscriptionId);
    await recordPayment(billing.client, paymentId, row.id);
  } catch (err) {
    console.error(`Could not confirm ${subscriptionId} with Razorpay: ${(err as Error).message}`);
  }
  res.json(await viewFor(userId));
});

billingRouter.post('/subscription/cancel', async (req, res) => {
  const billing = need(res);
  if (!billing) return;
  const userId = req.session.user!.id;
  const target = (await subscriptionsOf(userId)).find((s) => BLOCKING.has(s.status));
  if (!target) { res.status(404).json({ error: 'There is no subscription to cancel' }); return; }

  await applyRazorpaySubscription(await billing.client.cancelSubscription(target.razorpayId, true));
  await markCancelAtCycleEnd(target.id);
  res.json(await viewFor(userId));
});
```

In `server/src/app.ts`, import `billingRouter` and mount it beside the others:

```ts
import { billingRouter } from './routes/billing.ts';
// ...
  app.use('/api/billing', billingRouter);
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd server && NODE_ENV=test node --env-file=../.env --test test/billing.test.ts`
Expected: PASS (14 tests). This file signs in 14 accounts, inside the login limiter's 20.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/billing.ts server/src/app.ts server/test/billing.test.ts
git commit -m "feat(server): subscribe, verify and cancel through Razorpay"
```

---

### Task 8: The webhook

**Files:**
- Create: `server/src/routes/webhook.ts`
- Modify: `server/src/app.ts` (mount before `express.json`)
- Test: `server/test/webhook.test.ts`

**Interfaces:**
- Consumes: `verifyWebhookSignature`, `getBilling`, `syncSubscription`, `subscriptionByRazorpayId`, `recordCharge`, `eventSeen`, `recordEvent`.
- Produces: `razorpayWebhook(req, res): Promise<void>` mounted at `POST /api/billing/webhook`.

- [ ] **Step 1: Write the failing tests**

`server/test/webhook.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.ts';
import { fakeRazorpay, signWebhook, testBilling } from './fakes.ts';
import { resetDatabase, startApp } from './helpers.ts';

const rz = fakeRazorpay();
let app: Awaited<ReturnType<typeof startApp>>;
let userId = 0;

test.before(async () => {
  await resetDatabase();
  app = await startApp({ billing: testBilling(rz) });
  const { rows } = await pool.query<{ id: number }>(
    "INSERT INTO users (email, password_hash, role) VALUES ('w@test.invalid', 'x', 'user') RETURNING id",
  );
  userId = rows[0]!.id;
  const made = await rz.createSubscription({ planId: 'plan_yearly', totalCount: 10, notes: {} });
  await pool.query(
    `INSERT INTO subscriptions (user_id, razorpay_subscription_id, period, status) VALUES ($1, $2, 'yearly', 'created')`,
    [userId, made.id],
  );
});
test.after(async () => { await app.close(); await pool.end(); });

function deliver(body: unknown, { eventId = crypto.randomUUID(), signature }: { eventId?: string; signature?: string } = {}) {
  const raw = JSON.stringify(body);
  return fetch(`${app.base}/api/billing/webhook`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-razorpay-event-id': eventId,
      'x-razorpay-signature': signature ?? signWebhook(raw),
    },
    body: raw,
  });
}

const statusOf = async (id: string) =>
  (await pool.query('SELECT status FROM subscriptions WHERE razorpay_subscription_id = $1', [id])).rows[0]?.status;
const chargeCount = async () => Number((await pool.query('SELECT count(*) FROM subscription_charges')).rows[0].count);

test('a delivery with a bad signature is refused', async () => {
  const res = await deliver({ event: 'subscription.activated' }, { signature: 'nope' });
  assert.equal(res.status, 401);
});

test('an event is a prompt to ask Razorpay, not the data itself', async () => {
  rz.set('sub_1', { status: 'active', current_start: 1_790_000_000, current_end: 1_821_536_000 });
  // The payload claims `pending`; Razorpay, asked, says `active`. Razorpay wins.
  const res = await deliver({
    event: 'subscription.pending',
    payload: { subscription: { entity: { id: 'sub_1', status: 'pending' } } },
  });
  assert.equal(res.status, 200);
  assert.equal(await statusOf('sub_1'), 'active');
});

test('a charge delivered twice is recorded once', async () => {
  const body = {
    event: 'subscription.charged',
    payload: {
      subscription: { entity: { id: 'sub_1' } },
      payment: { entity: { id: 'pay_w', amount: 500_000, status: 'captured', created_at: 1_790_000_100, invoice_id: 'inv_w' } },
    },
  };
  assert.equal((await deliver(body, { eventId: 'evt_same' })).status, 200);
  const again = await deliver(body, { eventId: 'evt_same' });
  assert.equal(again.status, 200);
  assert.equal((await again.json()).duplicate, true);
  assert.equal(await deliver(body, { eventId: 'evt_other' }).then((r) => r.status), 200);
  assert.equal(await chargeCount(), 1);
});

test('a subscription this database does not hold is acknowledged and ignored', async () => {
  const res = await deliver({
    event: 'subscription.activated',
    payload: { subscription: { entity: { id: 'sub_stranger' } } },
  });
  assert.equal(res.status, 200);
  assert.equal(await statusOf('sub_stranger'), undefined);
});

test('an event that is not about a subscription is acknowledged', async () => {
  assert.equal((await deliver({ event: 'payment.captured', payload: {} })).status, 200);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd server && NODE_ENV=test node --env-file=../.env --test test/webhook.test.ts`
Expected: FAIL — the webhook path answers 401 from `requireAuth` on the billing router.

- [ ] **Step 3: Write the handler**

`server/src/routes/webhook.ts`:

```ts
import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { verifyWebhookSignature } from '../billing/signature.ts';
import { getBilling } from '../billing/state.ts';
import { syncSubscription } from '../billing/sync.ts';
import type { RzPayment } from '../billing/razorpay.ts';
import { eventSeen, recordCharge, recordEvent, subscriptionByRazorpayId } from '../repo/subscriptions.ts';

interface WebhookEvent {
  event?: string;
  payload?: {
    subscription?: { entity?: { id?: string } };
    payment?: { entity?: RzPayment };
  };
}

/**
 * Razorpay's notification that a subscription changed. Unauthenticated — the
 * signature is the authentication — and fed the raw body, because the
 * signature is over the exact bytes sent.
 *
 * The event is only a prompt: the subscription is re-fetched from Razorpay, so
 * a stale or out-of-order payload cannot put an old status back. The event is
 * recorded only after it has been applied, so a failure answers 500, Razorpay
 * retries, and the retry is not mistaken for a duplicate. Applying is
 * idempotent, so a duplicate that slips through does no harm either.
 */
export async function razorpayWebhook(req: Request, res: Response): Promise<void> {
  const billing = getBilling();
  if (!billing) { res.status(503).json({ error: 'Billing is not available yet' }); return; }

  const raw = req.body as unknown;
  if (!Buffer.isBuffer(raw)) { res.status(400).json({ error: 'Expected a JSON body' }); return; }
  if (!verifyWebhookSignature(raw, req.get('x-razorpay-signature') ?? '', billing.config.webhookSecret)) {
    res.status(401).json({ error: 'Bad signature' });
    return;
  }

  let event: WebhookEvent;
  try { event = JSON.parse(raw.toString('utf8')) as WebhookEvent; } catch {
    res.status(400).json({ error: 'Expected a JSON body' });
    return;
  }

  const eventId = req.get('x-razorpay-event-id') ?? createHash('sha256').update(raw).digest('hex');
  if (await eventSeen(eventId)) { res.json({ ok: true, duplicate: true }); return; }

  const type = typeof event.event === 'string' ? event.event : 'unknown';
  const subscriptionId = event.payload?.subscription?.entity?.id;
  if (type.startsWith('subscription.') && typeof subscriptionId === 'string') {
    const row = await subscriptionByRazorpayId(subscriptionId);
    if (row) {
      await syncSubscription(billing.client, subscriptionId);
      const payment = event.payload?.payment?.entity;
      if (type === 'subscription.charged' && payment?.status === 'captured') {
        await recordCharge({
          paymentId: payment.id,
          subscriptionId: row.id,
          amountPaise: payment.amount,
          paidAt: new Date(payment.created_at * 1000),
          invoiceId: payment.invoice_id ?? null,
        });
      }
    }
  }

  await recordEvent(eventId, type, event);
  res.json({ ok: true });
}
```

In `server/src/app.ts`, import it and mount it **directly after `app.use(helmet(...))` and before `app.use(express.json(...))`**:

```ts
import { razorpayWebhook } from './routes/webhook.ts';
// ...
  // Before express.json: the signature is over the raw bytes, and before the
  // session, which a server-to-server call has no use for.
  app.post('/api/billing/webhook', express.raw({ type: 'application/json', limit: '1mb' }), razorpayWebhook);
```

The session middleware is registered after `express.json` in the existing file; moving the webhook above both keeps it clear of both.

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd server && NODE_ENV=test node --env-file=../.env --test test/webhook.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/webhook.ts server/src/app.ts server/test/webhook.test.ts
git commit -m "feat(server): apply Razorpay webhooks by re-fetching the subscription they name"
```

---

### Task 9: Administration

**Files:**
- Create: `server/src/routes/admin.ts`
- Modify: `server/src/app.ts` (mount)
- Test: `server/test/admin.test.ts`

**Interfaces:**
- Consumes: `requireAdmin`, `entitlementFor`, `subscriptionsOf`, `liveGrantOf`, `createGrant`, `revokeGrant`, `indiaDate`.
- Produces:
  - `GET /api/admin/subscribers` → `Subscriber[]`:
    ```ts
    interface Subscriber {
      id: number; email: string; role: 'admin' | 'user'; createdAt: string;
      entitlement: Entitlement;
      subscription: { razorpayId: string; period: Period; status: string; currentEnd: string | null; cancelAtCycleEnd: boolean } | null;
      grant: { id: number; until: string; note: string } | null;
    }
    ```
  - `POST /api/admin/users/:id/grants { until: 'YYYY-MM-DD', note?: string }` → 201 `GrantRow`; 400 past or invalid date; 404 no such account
  - `DELETE /api/admin/grants/:id` → 204, or 404

- [ ] **Step 1: Write the failing tests**

`server/test/admin.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.ts';
import { fakeRazorpay, testBilling } from './fakes.ts';
import { resetDatabase, signedIn, startApp, type Agent } from './helpers.ts';

let app: Awaited<ReturnType<typeof startApp>>;
let admin: { as: Agent; id: number };
let user: { as: Agent; id: number };

test.before(async () => {
  await resetDatabase();
  app = await startApp({ billing: testBilling(fakeRazorpay()) });
  admin = await signedIn(app.base, 'admin@test.invalid', 'admin');
  user = await signedIn(app.base, 'user@test.invalid');
});
test.after(async () => { await app.close(); await pool.end(); });

const grant = (until: string, note = 'Paid by UPI, ref 123') =>
  admin.as(`/api/admin/users/${user.id}/grants`, { method: 'POST', body: JSON.stringify({ until, note }) });

test('only an administrator sees the subscribers', async () => {
  assert.equal((await user.as('/api/admin/subscribers')).status, 403);
  const list = await (await admin.as('/api/admin/subscribers')).json();
  const row = list.find((r: { id: number }) => r.id === user.id);
  assert.equal(row.email, 'user@test.invalid');
  assert.equal(row.entitlement.source, 'free');
  assert.equal(row.subscription, null);
  assert.equal(row.grant, null);
});

test('a grant must run until today or later, and be a real date', async () => {
  assert.equal((await grant('2020-01-01')).status, 400);
  assert.equal((await grant('2027-02-30')).status, 400);
  assert.equal((await grant('soon')).status, 400);
});

test('a grant to an account that does not exist finds nothing', async () => {
  const res = await admin.as('/api/admin/users/999999/grants', {
    method: 'POST', body: JSON.stringify({ until: '2099-01-01' }),
  });
  assert.equal(res.status, 404);
});

test('granting, re-granting and revoking', async () => {
  const first = await grant('2027-01-31');
  assert.equal(first.status, 201);
  const second = await (await grant('2027-03-31', 'renewed')).json();

  const list = await (await admin.as('/api/admin/subscribers')).json();
  const row = list.find((r: { id: number }) => r.id === user.id);
  assert.equal(row.entitlement.source, 'grant');
  assert.deepEqual(row.grant, { id: second.id, until: '2027-03-31', note: 'renewed' });

  assert.equal((await admin.as(`/api/admin/grants/${second.id}`, { method: 'DELETE' })).status, 204);
  assert.equal((await admin.as(`/api/admin/grants/${second.id}`, { method: 'DELETE' })).status, 404);
  const after = await (await user.as('/api/billing')).json();
  assert.equal(after.entitlement.source, 'free');
});

test('a user cannot grant themselves anything', async () => {
  const res = await user.as(`/api/admin/users/${user.id}/grants`, {
    method: 'POST', body: JSON.stringify({ until: '2099-01-01' }),
  });
  assert.equal(res.status, 403);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd server && NODE_ENV=test node --env-file=../.env --test test/admin.test.ts`
Expected: FAIL — `/api/admin/subscribers` answers 404.

- [ ] **Step 3: Write the router**

`server/src/routes/admin.ts`:

```ts
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.ts';
import { requireAdmin } from '../auth/middleware.ts';
import { entitlementFor } from '../billing/access.ts';
import { indiaDate } from '../billing/entitlement.ts';
import { createGrant, liveGrantOf, revokeGrant } from '../repo/grants.ts';
import { subscriptionsOf } from '../repo/subscriptions.ts';

export const adminRouter: Router = Router();
adminRouter.use(requireAdmin);

const parseId = (raw: string | undefined): number | null => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** A handful of accounts: one query each is simpler than a join and fast enough. */
adminRouter.get('/subscribers', async (_req, res) => {
  const { rows: users } = await pool.query<{ id: number; email: string; role: 'admin' | 'user'; created_at: Date }>(
    'SELECT id, email, role, created_at FROM users ORDER BY id',
  );
  const today = indiaDate(new Date());
  const out = [];
  for (const u of users) {
    const entitlement = await entitlementFor(u.id);
    if (!entitlement) continue;
    const current = (await subscriptionsOf(u.id)).find((s) => s.status !== 'created') ?? null;
    const grant = await liveGrantOf(u.id, today);
    out.push({
      id: u.id,
      email: u.email,
      role: u.role,
      createdAt: u.created_at.toISOString(),
      entitlement,
      subscription: current && {
        razorpayId: current.razorpayId,
        period: current.period,
        status: current.status,
        currentEnd: current.currentEnd?.toISOString() ?? null,
        cancelAtCycleEnd: current.cancelAtCycleEnd,
      },
      grant: grant && { id: grant.id, until: grant.until, note: grant.note },
    });
  }
  res.json(out);
});

const grantBody = z.object({
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(500).default(''),
});

/** A calendar date that exists: 2027-02-30 parses in JS, and rolls into March. */
function realDate(iso: string): boolean {
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

adminRouter.post('/users/:id/grants', async (req, res) => {
  const userId = parseId(req.params.id);
  if (userId === null) { res.status(400).json({ error: 'Invalid account id' }); return; }
  const parsed = grantBody.safeParse(req.body);
  if (!parsed.success || !realDate(parsed.data.until)) {
    res.status(400).json({ error: 'Give the last day of access as a date' });
    return;
  }
  if (parsed.data.until < indiaDate(new Date())) {
    res.status(400).json({ error: 'A grant must run until today or later' });
    return;
  }
  const { rowCount } = await pool.query('SELECT 1 FROM users WHERE id = $1', [userId]);
  if (!rowCount) { res.status(404).json({ error: 'No such account' }); return; }

  const grant = await createGrant({
    userId, until: parsed.data.until, note: parsed.data.note.trim(), grantedBy: req.session.user!.id,
  });
  res.status(201).json(grant);
});

adminRouter.delete('/grants/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) { res.status(400).json({ error: 'Invalid grant id' }); return; }
  if (!(await revokeGrant(id))) { res.status(404).json({ error: 'No such grant' }); return; }
  res.status(204).end();
});
```

In `server/src/app.ts`:

```ts
import { adminRouter } from './routes/admin.ts';
// ...
  app.use('/api/admin', adminRouter);
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd server && NODE_ENV=test node --env-file=../.env --test test/admin.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/admin.ts server/src/app.ts server/test/admin.test.ts
git commit -m "feat(server): administrators list subscribers and grant access until a date"
```

---

### Task 10: Content-Security-Policy, configuration and deployment notes

**Files:**
- Modify: `server/src/app.ts` (helmet), `server/test/static.test.ts`, `.env.example`, `render.yaml`, `README.md`

**Interfaces:**
- Produces: a CSP that lets Checkout load; documented variables.

- [ ] **Step 1: Write the failing test**

Append to `server/test/static.test.ts`:

```ts
test('the security policy lets Razorpay Checkout load, and nothing wider', async () => {
  const csp = (await fetch(`${base}/api/health`)).headers.get('content-security-policy') ?? '';
  const directive = (name: string) => csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) ?? '';
  assert.match(directive('script-src'), /https:\/\/checkout\.razorpay\.com/);
  assert.match(directive('frame-src'), /https:\/\/api\.razorpay\.com/);
  assert.match(directive('connect-src'), /https:\/\/api\.razorpay\.com/);
  assert.doesNotMatch(directive('script-src'), /'unsafe-inline'|\*/);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd server && NODE_ENV=test node --env-file=../.env --test test/static.test.ts`
Expected: FAIL — `script-src` is helmet's default `'self'`.

- [ ] **Step 3: Extend helmet's defaults**

In `server/src/app.ts` replace `app.use(helmet());` with:

```ts
  // Helmet's defaults, widened only for Razorpay Checkout: its script, the
  // frames it opens, and the APIs it calls from the page.
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        scriptSrc: ["'self'", 'https://checkout.razorpay.com'],
        frameSrc: ["'self'", 'https://api.razorpay.com', 'https://checkout.razorpay.com'],
        connectSrc: ["'self'", 'https://api.razorpay.com', 'https://lumberjack.razorpay.com'],
        imgSrc: ["'self'", 'data:', 'https://*.razorpay.com'],
      },
    },
  }));
```

- [ ] **Step 4: Run it to see it pass**

Run: `cd server && NODE_ENV=test node --env-file=../.env --test test/static.test.ts`
Expected: PASS

- [ ] **Step 5: Document the variables**

Append to `.env.example`:

```bash
# Razorpay Subscriptions. Billing is on only when all six are set; leave them
# empty and every account is unlimited. Test-mode keys (rzp_test_…) work locally.
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
RAZORPAY_PLAN_MONTHLY=
RAZORPAY_PLAN_HALF_YEARLY=
RAZORPAY_PLAN_YEARLY=
```

Append to `envVars` in `render.yaml`:

```yaml
      # Razorpay. All six or none: with none set, nobody is limited.
      - key: RAZORPAY_KEY_ID
        sync: false
      - key: RAZORPAY_KEY_SECRET
        sync: false
      - key: RAZORPAY_WEBHOOK_SECRET
        sync: false
      - key: RAZORPAY_PLAN_MONTHLY
        sync: false
      - key: RAZORPAY_PLAN_HALF_YEARLY
        sync: false
      - key: RAZORPAY_PLAN_YEARLY
        sync: false
```

Add a section to `README.md` after "Keeping the free instance awake":

```markdown
---

## Subscriptions

A free account keeps **one** contract. A subscription — monthly, every 6 months
or yearly, auto-renewing through Razorpay — keeps any number. An account that is
not paid and holds more than one contract is **read-only**: every bill still
opens and prints, nothing is deleted, and deleting down to one contract makes
that one editable again. Administrators are always unlimited and can grant any
account access until a date from **Subscribers** on the contracts page.

**Nothing is limited until billing is configured**, and it is configured only
when all six `RAZORPAY_*` variables are set. Deploying the code changes nothing
on its own.

### Switching it on

1. In the Razorpay dashboard create three plans: monthly (period *monthly*,
   interval 1), 6 months (*monthly*, interval 6), yearly (*yearly*, interval 1).
   **The prices live on these plans** — the app reads them, so changing a price
   needs no deploy.
2. Create a webhook to `https://pes-calculator.onrender.com/api/billing/webhook`
   with a secret of your choosing, for the events `subscription.authenticated`,
   `subscription.activated`, `subscription.charged`, `subscription.pending`,
   `subscription.halted`, `subscription.cancelled`, `subscription.completed`,
   `subscription.updated`.
3. **Before** the next step, grant access (Subscribers) to anyone who should not
   meet the limit on day one — from the moment billing is on, an account with two
   or more contracts and no plan is read-only.
4. Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` and the
   three `RAZORPAY_PLAN_*` ids on Render, and let it redeploy.

### Trying it in test mode

Put test-mode keys and test plan ids in `.env`. For webhooks to reach a local
server, expose port 3000 with a tunnel (`cloudflared tunnel --url http://localhost:3000`)
and point a test-mode webhook at `<tunnel>/api/billing/webhook`. Without a tunnel
the plan still switches on — through the checkout callback, or the refresh that
runs whenever the account's billing is loaded — so the tunnel is only needed to
test the webhook itself.

**Why three routes to the same answer.** The free Render instance sleeps outside
the pinger's window, longer than Razorpay waits for a webhook to answer. Razorpay
retries, but a payment made at night would otherwise wait for the retry.
```

- [ ] **Step 6: Run the whole server suite**

Run: `npm test -w @pes/server`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add server/src/app.ts server/test/static.test.ts .env.example render.yaml README.md
git commit -m "feat(server): let Razorpay Checkout through the security policy, and document billing"
```

---

### Task 11: Web API client and view logic

**Files:**
- Modify: `web/src/api.ts`
- Create: `web/src/billing.ts`
- Test: `web/test/api.test.ts`, `web/test/billing.test.ts`

**Interfaces:**
- Consumes: the server shapes from Tasks 7 and 9.
- Produces:
  - `api.ts`: `ApiError` gains `code?: string`; `onEntitlementStale(fn: () => void): () => void`; wire types `Period`, `Entitlement`, `BillingView`, `PlanPrice`, `StartedCheckout`, `CheckoutResult`, `Subscriber`; calls `api.billing()`, `api.plans()`, `api.subscribe(period)`, `api.verifySubscription(result)`, `api.cancelSubscription()`, `api.subscribers()`, `api.grant(userId, until, note)`, `api.revokeGrant(id)`.
  - `billing.ts`: `PERIODS`, `PERIOD_LABEL`, `PERIOD_EVERY`, `PERIOD_PER`, `formatPaise(paise)`, `type PlanState = 'admin' | 'free' | 'active' | 'retrying' | 'ending' | 'ended' | 'granted'`, `planState(view)`, `type ContractsBand = 'read_only' | 'retrying' | 'ending_soon' | null`, `contractsBand(view, now)`, `nextRenewal(period, from)`, `type SubscriberCategory = 'admin' | 'paying' | 'granted' | 'free' | 'ended'`, `subscriberCategory(s)`, `isoDay(iso)`.

- [ ] **Step 1: Write the failing tests**

`web/test/api.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { api, ApiError, onEntitlementStale } from '../src/api.ts';

function answer(status: number, body: unknown) {
  globalThis.fetch = (async () => new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  })) as typeof fetch;
}

test('a 402 carries its code and tells the entitlement listeners', async () => {
  let told = 0;
  const stop = onEntitlementStale(() => { told += 1; });
  answer(402, { error: 'read-only', code: 'read_only' });
  await assert.rejects(api.putContract(1, { contractor: 'X' }),
    (err: unknown) => err instanceof ApiError && err.status === 402 && err.code === 'read_only');
  assert.equal(told, 1);
  stop();
  await assert.rejects(api.putContract(1, { contractor: 'X' }));
  assert.equal(told, 1, 'an unsubscribed listener hears nothing');
});

test('other failures do not touch the entitlement', async () => {
  let told = 0;
  const stop = onEntitlementStale(() => { told += 1; });
  answer(404, { error: 'No such contract' });
  await assert.rejects(api.getContract(1),
    (err: unknown) => err instanceof ApiError && err.status === 404 && err.code === undefined);
  assert.equal(told, 0);
  stop();
});
```

`web/test/billing.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import type { BillingView, Entitlement, Subscriber } from '../src/api.ts';
import {
  contractsBand, formatPaise, nextRenewal, planState, subscriberCategory,
} from '../src/billing.ts';

const NOW = new Date('2026-09-27T06:30:00Z');

const ent = (over: Partial<Entitlement> = {}): Entitlement => ({
  paid: false, source: 'free', paidUntil: null, contractCount: 1, limit: 1, readOnly: false, canCreate: false, ...over,
});
const view = (over: Partial<BillingView> = {}): BillingView => ({
  configured: true, keyId: 'k', entitlement: ent(), subscription: null, grant: null, charges: [], ...over,
});
const sub = (status: string, over: Partial<NonNullable<BillingView['subscription']>> = {}) =>
  ({ period: 'yearly' as const, status, currentEnd: '2027-09-27T00:00:00.000Z', cancelAtCycleEnd: false, ...over });
const paying = ent({ paid: true, source: 'subscription', limit: null, canCreate: true });

test('planState names each state the account panel draws', () => {
  assert.equal(planState(view()), 'free');
  assert.equal(planState(view({ entitlement: ent({ paid: true, source: 'admin' }) })), 'admin');
  assert.equal(planState(view({ entitlement: paying, subscription: sub('active') })), 'active');
  assert.equal(planState(view({ entitlement: paying, subscription: sub('pending') })), 'retrying');
  assert.equal(planState(view({ entitlement: paying, subscription: sub('active', { cancelAtCycleEnd: true }) })), 'ending');
  assert.equal(planState(view({ entitlement: paying, subscription: sub('cancelled') })), 'ending');
  assert.equal(planState(view({ entitlement: ent({ paid: true, source: 'grant' }) })), 'granted');
  assert.equal(planState(view({ subscription: sub('halted') })), 'ended');
  assert.equal(planState(view({ subscription: sub('cancelled') })), 'ended');
});

test('contractsBand picks the one band the contracts page shows', () => {
  assert.equal(contractsBand(view(), NOW), null);
  assert.equal(contractsBand(view({ entitlement: ent({ readOnly: true, contractCount: 4 }) }), NOW), 'read_only');
  assert.equal(contractsBand(view({ entitlement: paying, subscription: sub('pending') }), NOW), 'retrying');
  const endingSoon = sub('active', { cancelAtCycleEnd: true, currentEnd: '2026-10-02T00:00:00.000Z' });
  assert.equal(contractsBand(view({ entitlement: paying, subscription: endingSoon }), NOW), 'ending_soon');
  const endingLater = sub('active', { cancelAtCycleEnd: true, currentEnd: '2026-12-02T00:00:00.000Z' });
  assert.equal(contractsBand(view({ entitlement: paying, subscription: endingLater }), NOW), null);
  assert.equal(contractsBand(view({ configured: false, entitlement: ent({ readOnly: true }) }), NOW), null);
});

test('formatPaise writes whole rupees without paise', () => {
  assert.equal(formatPaise(500_000), '₹5,000');
  assert.equal(formatPaise(27_000_050), '₹2,70,000.50');
});

test('nextRenewal adds one billing period', () => {
  assert.equal(nextRenewal('monthly', NOW), '2026-10-27');
  assert.equal(nextRenewal('half_yearly', NOW), '2027-03-27');
  assert.equal(nextRenewal('yearly', NOW), '2027-09-27');
});

test('subscriberCategory files each account under one filter', () => {
  const s = (entitlement: Entitlement, status: string | null): Subscriber => ({
    id: 1, email: 'x', role: entitlement.source === 'admin' ? 'admin' : 'user', createdAt: '', entitlement,
    subscription: status ? { razorpayId: 'sub', ...sub(status) } : null, grant: null,
  });
  assert.equal(subscriberCategory(s(ent({ paid: true, source: 'admin' }), null)), 'admin');
  assert.equal(subscriberCategory(s(paying, 'active')), 'paying');
  assert.equal(subscriberCategory(s(ent({ paid: true, source: 'grant' }), null)), 'granted');
  assert.equal(subscriberCategory(s(ent(), 'halted')), 'ended');
  assert.equal(subscriberCategory(s(ent(), null)), 'free');
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test -w @pes/web`
Expected: FAIL — `onEntitlementStale` is not exported; `../src/billing.ts` not found.

- [ ] **Step 3: Extend the API client**

In `web/src/api.ts`, replace `ApiError` and `call`:

```ts
export class ApiError extends Error {
  status: number;
  /** The server's machine-readable reason, when it gives one: 'limit', 'read_only', 'subscribed'. */
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * A 402 means the account's plan no longer covers what was just attempted —
 * typically a plan that ran out while the page was open. Whoever holds the
 * entitlement listens here and refetches, so the page turns read-only instead
 * of showing a save error forever.
 */
const staleListeners = new Set<() => void>();
export function onEntitlementStale(fn: () => void): () => void {
  staleListeners.add(fn);
  return () => { staleListeners.delete(fn); };
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    ...init,
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 402) staleListeners.forEach((fn) => fn());
    const { error, code } = body as { error?: unknown; code?: unknown };
    throw new ApiError(
      res.status,
      typeof error === 'string' ? error : res.statusText,
      typeof code === 'string' ? code : undefined,
    );
  }
  return body as T;
}
```

Add to the `api` object, after `getCalculation`:

```ts
  billing: () => call<BillingView>('/api/billing'),
  plans: () => call<PlanPrice[]>('/api/billing/plans'),
  subscribe: (period: Period) => send<StartedCheckout>('/api/billing/subscriptions', 'POST', { period }),
  verifySubscription: (result: CheckoutResult) =>
    send<BillingView>('/api/billing/subscriptions/verify', 'POST', result),
  cancelSubscription: () => call<BillingView>('/api/billing/subscription/cancel', { method: 'POST' }),

  subscribers: () => call<Subscriber[]>('/api/admin/subscribers'),
  grant: (userId: number, until: string, note: string) =>
    send<{ id: number }>(`/api/admin/users/${userId}/grants`, 'POST', { until, note }),
  revokeGrant: (id: number) => call<void>(`/api/admin/grants/${id}`, { method: 'DELETE' }),
```

Append to the wire types:

```ts
export type Period = 'monthly' | 'half_yearly' | 'yearly';

export interface Entitlement {
  paid: boolean;
  source: 'admin' | 'subscription' | 'grant' | 'free';
  paidUntil: string | null;
  contractCount: number;
  limit: number | null;
  readOnly: boolean;
  canCreate: boolean;
}

export interface SubscriptionSummary {
  period: Period;
  status: string;
  currentEnd: string | null;
  cancelAtCycleEnd: boolean;
}

export interface BillingView {
  /** False until the Razorpay keys are set; then nobody is limited. */
  configured: boolean;
  keyId: string | null;
  entitlement: Entitlement;
  subscription: SubscriptionSummary | null;
  grant: { until: string } | null;
  charges: Array<{ paymentId: string; amountPaise: number; paidAt: string; period: Period }>;
}

export interface PlanPrice { period: Period; amountPaise: number; currency: string }
export interface StartedCheckout { subscriptionId: string; keyId: string; email: string }

/** Exactly what Razorpay Checkout hands its success handler. */
export interface CheckoutResult {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
}

export interface Subscriber {
  id: number;
  email: string;
  role: 'admin' | 'user';
  createdAt: string;
  entitlement: Entitlement;
  subscription: (SubscriptionSummary & { razorpayId: string }) | null;
  grant: { id: number; until: string; note: string } | null;
}
```

- [ ] **Step 4: Write the view logic**

`web/src/billing.ts`:

```ts
import type { BillingView, Period, Subscriber } from './api.ts';
import { formatRupees } from './format.ts';

export const PERIODS: readonly Period[] = ['monthly', 'half_yearly', 'yearly'];

export const PERIOD_LABEL: Record<Period, string> = {
  monthly: 'Monthly', half_yearly: '6 months', yearly: 'Yearly',
};
export const PERIOD_EVERY: Record<Period, string> = {
  monthly: 'Every month', half_yearly: 'Every 6 months', yearly: 'Every 12 months',
};
export const PERIOD_PER: Record<Period, string> = {
  monthly: '/ month', half_yearly: '/ 6 months', yearly: '/ year',
};
const PERIOD_MONTHS: Record<Period, number> = { monthly: 1, half_yearly: 6, yearly: 12 };

/** Razorpay speaks paise. Whole rupees drop the ".00" a price never needs. */
export function formatPaise(paise: number): string {
  return `₹${formatRupees(paise / 100, paise % 100 === 0 ? 0 : 2)}`;
}

/** The YYYY-MM-DD part of a timestamp, for formatDate. */
export const isoDay = (iso: string) => iso.slice(0, 10);

/** Today plus one billing period, as YYYY-MM-DD. */
export function nextRenewal(period: Period, from: Date): string {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + PERIOD_MONTHS[period], from.getUTCDate()));
  return d.toISOString().slice(0, 10);
}

export type PlanState = 'admin' | 'free' | 'active' | 'retrying' | 'ending' | 'ended' | 'granted';

const ENDED = new Set(['halted', 'cancelled', 'completed', 'expired']);

export function planState(view: BillingView): PlanState {
  const { entitlement: e, subscription: s } = view;
  if (e.source === 'admin') return 'admin';
  if (e.source === 'subscription' && s) {
    if (s.status === 'pending') return 'retrying';
    if (s.cancelAtCycleEnd || s.status === 'cancelled') return 'ending';
    return 'active';
  }
  if (e.source === 'grant') return 'granted';
  if (s && ENDED.has(s.status)) return 'ended';
  return 'free';
}

export type ContractsBand = 'read_only' | 'retrying' | 'ending_soon' | null;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** At most one band on the contracts page, the most urgent first. */
export function contractsBand(view: BillingView, now: Date): ContractsBand {
  if (!view.configured) return null;
  if (view.entitlement.readOnly) return 'read_only';
  const state = planState(view);
  if (state === 'retrying') return 'retrying';
  const end = view.subscription?.currentEnd;
  if (state === 'ending' && end && new Date(end).getTime() - now.getTime() <= WEEK_MS) return 'ending_soon';
  return null;
}

export type SubscriberCategory = 'admin' | 'paying' | 'granted' | 'free' | 'ended';

export function subscriberCategory(s: Subscriber): SubscriberCategory {
  switch (s.entitlement.source) {
    case 'admin': return 'admin';
    case 'subscription': return 'paying';
    case 'grant': return 'granted';
    default: return s.subscription && ENDED.has(s.subscription.status) ? 'ended' : 'free';
  }
}
```

- [ ] **Step 5: Run the tests and the type-check**

Run: `npm test -w @pes/web`
Expected: PASS (existing suites plus 7 new tests)

Run: `npx tsc -p web`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add web/src/api.ts web/src/billing.ts web/test/api.test.ts web/test/billing.test.ts
git commit -m "feat(web): billing calls, a 402 listener, and the plan-state vocabulary"
```

---

### Task 12: Entitlement provider, bands and the shared styles

**Files:**
- Create: `web/src/entitlement.tsx`, `web/src/components/Band.tsx`, `web/src/components/LockIcon.tsx`
- Modify: `web/src/App.tsx`, `web/src/styles.css`

**Interfaces:**
- Consumes: `api.billing`, `onEntitlementStale` (Task 11).
- Produces:
  - `EntitlementProvider({ children })`, `useEntitlement(): { view: BillingView | null; refresh: () => Promise<void> }`
  - `Band({ tone?: 'warn' | 'neutral'; lock?: boolean; action?: ReactNode; children: ReactNode })`
  - `LockIcon({ label?: string })`
  - CSS classes: `.band`, `.band--warn`, `.band--neutral`, `.band__body`, `.band__detail`, `.lock`, `fieldset.editable`, `a.button`, `.pill--bad`, `.plans`, `.plan-list`, `.plan-row`, `.plan-row--current`, `.plan-row__sub`, `.plan-row__price`, `.summary`, `.summary__price`, `.ledger-line`, `.steps`, `.filters`, `button.filter`, `.running-head__flag--inline`

- [ ] **Step 1: Write the provider**

`web/src/entitlement.tsx`:

```tsx
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, onEntitlementStale, type BillingView } from './api.ts';

interface EntitlementValue {
  /** null until the first load answers. Treat as "not limited" meanwhile. */
  view: BillingView | null;
  refresh: () => Promise<void>;
}

const EntitlementContext = createContext<EntitlementValue>({ view: null, refresh: async () => {} });

/**
 * What the signed-in account may do, loaded once and refetched after anything
 * that could change it: a billing action, a create or delete, and any 402 —
 * which is how a plan that lapses mid-session turns the page read-only.
 */
export function EntitlementProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<BillingView | null>(null);

  const refresh = useCallback(async () => {
    try {
      setView(await api.billing());
    } catch {
      // Keep the last answer: a blip must not flip the page between states.
    }
  }, []);

  useEffect(() => {
    void refresh();
    return onEntitlementStale(() => { void refresh(); });
  }, [refresh]);

  return <EntitlementContext.Provider value={{ view, refresh }}>{children}</EntitlementContext.Provider>;
}

export const useEntitlement = () => useContext(EntitlementContext);
```

- [ ] **Step 2: Write the band and the lock**

`web/src/components/LockIcon.tsx`:

```tsx
/** Marks something that can be read but not changed. Stroke, so it takes the text colour. */
export function LockIcon({ label }: { label?: string }) {
  return (
    <svg className="lock" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
         role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
```

`web/src/components/Band.tsx`:

```tsx
import type { ReactNode } from 'react';
import { LockIcon } from './LockIcon.tsx';

/**
 * A full-width strip that says what state the account is in and the one thing
 * to do about it. Screen only: a printed bill does not carry the account's plan.
 */
export function Band({ tone = 'warn', lock = false, action, children }: {
  tone?: 'warn' | 'neutral';
  lock?: boolean;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`band band--${tone} no-print`} role="status">
      {lock && <LockIcon />}
      <div className="band__body">{children}</div>
      {action}
    </div>
  );
}
```

- [ ] **Step 3: Add the styles**

Append to `web/src/styles.css`, before the `/* ---- responsive` block:

```css
/* ---- plan state --------------------------------------------------------- */
/**
 * What the account's plan allows, said once, in a strip across the page. The
 * same warn/neutral vocabulary as the pills; never a card.
 */
.band {
  display: flex; align-items: center; gap: var(--s3);
  padding: var(--s3) var(--s4); margin-bottom: var(--s4);
  border: 1px solid; border-radius: 2px; font-size: var(--t-body);
}
.band--warn { color: var(--warn); background: var(--warn-wash); border-color: color-mix(in srgb, var(--warn) 25%, transparent); }
.band--neutral { color: var(--ink); background: var(--sunk); border-color: var(--rule); }
.band__body { flex: 1; display: grid; gap: 2px; }
.band__detail { font-size: var(--t-small); }
.lock { display: inline-flex; flex: none; vertical-align: -2px; margin-right: 6px; }
td .lock { color: var(--ink-muted); }

/* A fieldset used only to disable what it holds: it must draw nothing. */
fieldset.editable { border: 0; padding: 0; margin: 0; min-width: 0; }

/* A link that is the page's primary action. */
a.button {
  display: inline-flex; align-items: center; justify-content: center;
  font: inherit; font-size: 14px; font-weight: 500; white-space: nowrap;
  padding: 7px 15px; text-decoration: none;
  border: 1px solid var(--accent); border-radius: 2px;
  background: var(--accent); color: var(--on-accent);
}
a.button:hover { filter: brightness(1.1); }

.pill--bad { color: var(--recovery); background: var(--recovery-wash); border-color: color-mix(in srgb, var(--recovery) 25%, transparent); }
.running-head__flag--inline { margin-left: var(--s2); align-self: center; }

/* ---- plans -------------------------------------------------------------- */
.plans { display: grid; grid-template-columns: minmax(0, 1fr) 400px; gap: var(--s6); align-items: start; }
.plan-list { display: grid; }
.plan-row {
  display: grid; grid-template-columns: 24px 1fr auto; align-items: center; gap: var(--s3);
  padding: 14px var(--s4); background: var(--surface);
  border: 1px solid var(--rule); border-top: none; cursor: pointer;
}
.plan-row:first-child { border-top: 1px solid var(--rule); }
.plan-row--current { background: var(--sunk); cursor: default; }
.plan-row input { margin: 0; width: 16px; height: 16px; accent-color: var(--accent); }
/* The chosen period is a solid block of ink, as the current stage is. */
.plan-row:has(input:checked) { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
.plan-row:has(input:checked) input { accent-color: var(--on-accent); }
.plan-row__sub { display: block; font-size: 13px; color: var(--ink-muted); }
.plan-row:has(input:checked) .plan-row__sub { color: var(--on-accent); opacity: 0.75; }
.plan-row__price { font-family: var(--mono); font-variant-numeric: tabular-nums; font-size: 16px; font-weight: 600; white-space: nowrap; }

.summary { border-top: 2px solid var(--rule-strong); display: grid; gap: var(--s4); padding: var(--s5); }
.summary__price {
  font-family: var(--serif); font-size: 34px; font-weight: 600;
  letter-spacing: -0.02em; font-variant-numeric: tabular-nums; line-height: 1.1;
}
.ledger-line {
  display: flex; justify-content: space-between; align-items: baseline; gap: var(--s4);
  padding: 9px 0; border-bottom: 1px solid var(--rule); font-size: var(--t-body);
}
.ledger-line > span:first-child { color: var(--ink-muted); }

/* Numbered like the stage rail's markers. */
.steps { display: grid; gap: var(--s3); list-style: none; padding: 0; margin: 0; counter-reset: step; }
.steps li {
  display: grid; grid-template-columns: 22px 1fr; gap: var(--s3); align-items: baseline;
  font-size: var(--t-body); counter-increment: step;
}
.steps li::before {
  content: counter(step); font-family: var(--mono); font-size: var(--t-micro); line-height: 18px;
  text-align: center; background: var(--accent); color: var(--on-accent); border-radius: 2px;
}

/* ---- subscribers -------------------------------------------------------- */
.filters { display: flex; gap: var(--s2); align-items: center; flex-wrap: wrap; margin-bottom: var(--s4); }
button.filter {
  padding: 4px 12px; font-size: 13px; font-weight: 400; border-radius: 999px;
  background: var(--surface); color: var(--ink); border-color: var(--rule);
}
button.filter:hover { filter: none; border-color: var(--ink-faint); }
button.filter[aria-pressed='true'] { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
```

Inside the existing `@media (max-width: 820px)` block, add:

```css
  .plans { grid-template-columns: 1fr; }
  .band { flex-wrap: wrap; }
```

- [ ] **Step 4: Wrap the app in the provider**

In `web/src/App.tsx`, import `EntitlementProvider` from `./entitlement.tsx` and wrap the router:

```tsx
  return (
    <EntitlementProvider>
      <BrowserRouter>
        <Routes>
          {/* ...the existing routes, unchanged... */}
        </Routes>
      </BrowserRouter>
    </EntitlementProvider>
  );
```

The provider sits inside the signed-in branch, so it loads only once someone is signed in and is dropped on sign-out.

- [ ] **Step 5: Type-check and build**

Run: `npx tsc -p web && npm run build -w @pes/web`
Expected: no type errors; the build succeeds.

- [ ] **Step 6: Commit**

```bash
git add web/src/entitlement.tsx web/src/components/Band.tsx web/src/components/LockIcon.tsx web/src/App.tsx web/src/styles.css
git commit -m "feat(web): load the account's entitlement once, and the band that states it"
```

---

### Task 13: The contracts page knows the plan

**Files:**
- Modify: `web/src/pages/ContractsPage.tsx`

**Interfaces:**
- Consumes: `useEntitlement` (Task 12), `contractsBand`, `planState`, `isoDay` (Task 11), `Band`, `LockIcon` (Task 12), `formatDate` (`web/src/format.ts`).

- [ ] **Step 1: Wire in the entitlement**

In `web/src/pages/ContractsPage.tsx` add imports:

```tsx
import { contractsBand, isoDay, planState } from '../billing.ts';
import { Band } from '../components/Band.tsx';
import { LockIcon } from '../components/LockIcon.tsx';
import { useEntitlement } from '../entitlement.tsx';
import { formatDate } from '../format.ts';
```

(`formatDate` joins the existing `format.ts` import.)

At the top of `ContractsPage`, after the existing state:

```tsx
  const { view, refresh } = useEntitlement();
  const e = view?.configured ? view.entitlement : null;
  const band = view ? contractsBand(view, new Date()) : null;
  const ended = view ? planState(view) === 'ended' : false;
```

In `load`, refresh the entitlement too, since creating and deleting change the count:

```tsx
  const load = () => {
    api.listContracts().then(setRows).catch((err: Error) => setError(err.message));
    void refresh();
  };
```

(`refresh` is stable, so `useEffect(load, [])` still runs once; leave that line as it is.)

- [ ] **Step 2: The plan pill and the admin link in the header**

In the header `row`, before `<ThemeToggle />`:

```tsx
          {e && !e.paid && (
            <span className="pill pill--idle">
              Free plan · {e.contractCount} of {e.limit} contract{e.limit === 1 ? '' : 's'}
            </span>
          )}
          {view?.entitlement.source === 'admin' && (
            <Link to="/admin/subscribers" className="ghost no-print">Subscribers</Link>
          )}
```

- [ ] **Step 3: The band, below the header and above the form**

After `{error && <p className="notice">{error}</p>}`:

```tsx
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
```

- [ ] **Step 4: The form respects the limit**

Replace the create form with:

```tsx
      <form onSubmit={create} className="panel stack-form-tight">
        <div className="form-bar">
          <label className="field">
            Agreement number
            <input value={agreementNo} onChange={(ev) => setAgreementNo(ev.target.value)}
                   placeholder={e?.readOnly ? 'Subscribe to start new contracts' : '168 of 2023-24'}
                   disabled={e?.readOnly ?? false} required />
          </label>
          <button type="submit" disabled={busy || !agreementNo.trim() || (e ? !e.canCreate : false)}>
            Start contract
          </button>
        </div>
        {e && !e.canCreate && !e.readOnly && (
          <Band action={<Link to="/plans" className="button">See plans</Link>}>
            The free plan holds one contract. Subscribe for unlimited contracts — or delete the one below
            to start a new one for free.
          </Band>
        )}
      </form>
```

The existing `.form-bar` class carried `margin-bottom`; it now sits inside the panel. Add to `styles.css` next to `.form-bar`:

```css
.stack-form-tight { display: grid; gap: var(--s3); margin-bottom: var(--s4); }
.stack-form-tight .form-bar { margin-bottom: 0; }
.stack-form-tight .band { margin-bottom: 0; }
```

Rename the parameter the existing `create` handler takes from `e` to `ev` (`async function create(ev: FormEvent) { ev.preventDefault(); ...`) so it no longer shadows the entitlement.

- [ ] **Step 5: Mark read-only rows**

In the agreement cell:

```tsx
                    <td>
                      {e?.readOnly && <LockIcon label="Read-only" />}
                      <Link to={`/c/${r.id}`} className="cell-link">{r.agreementNo}</Link>
                      {r.contractor && <span className="cell-sub">{r.contractor}</span>}
                    </td>
```

- [ ] **Step 6: Type-check, build, and look at it**

Run: `npx tsc -p web && npm run build -w @pes/web`
Expected: passes.

With test-mode keys in `.env` (README, "Trying it in test mode"), run `npm run dev:server` and `npm run dev:web`, sign in as a second, non-admin account and check against canvas boards 4 and 5: one contract → the pill reads "1 of 1", Start contract is disabled and the limit band shows; give the account a second contract with `psql` (`INSERT INTO contracts (agreement_no, user_id) VALUES ('x', <id>)`) → the read-only band and a lock on each row; delete one → both go away.

- [ ] **Step 7: Commit**

```bash
git add web/src/pages/ContractsPage.tsx web/src/styles.css
git commit -m "feat(web): the contracts list shows the plan, the free limit and read-only"
```

---

### Task 14: A read-only contract

**Files:**
- Create: `web/src/components/Editable.tsx`
- Modify: `web/src/components/RunningHead.tsx`, `web/src/components/Shell.tsx`, `web/src/pages/MainDataPage.tsx`, `web/src/pages/BaseRatePage.tsx`, `web/src/components/ScheduleTable.tsx`

**Interfaces:**
- Consumes: `useEntitlement`, `planState`, `Band`.
- Produces: `Editable({ children })`; `RunningHead` gains `flag?: string`.

Why not one `<fieldset disabled>` around every stage, as the spec first said: it would also disable the Print buttons on every stage and the bill's in/after period choice, which are how a read-only contract is still used. So the fieldset wraps only what writes, and the Rates Chart stage — shared, and out of scope — is left alone. Task 19 brings the spec in line.

- [ ] **Step 1: Write the wrapper**

`web/src/components/Editable.tsx`:

```tsx
import type { ReactNode } from 'react';
import { useEntitlement } from '../entitlement.tsx';

/**
 * Wraps the controls that write to the contract. When the account is
 * read-only the fieldset disables every input, select and button inside it in
 * one move; Print and the bill's period choice sit outside it and keep working.
 */
export function Editable({ children }: { children: ReactNode }) {
  const { view } = useEntitlement();
  return (
    <fieldset className="editable" disabled={view?.entitlement.readOnly ?? false}>
      {children}
    </fieldset>
  );
}
```

- [ ] **Step 2: Wrap the writing controls**

`web/src/pages/MainDataPage.tsx` — import `Editable` from `../components/Editable.tsx`, and wrap everything from the first `<section className="panel">` through `<ExecutionGrid />`:

```tsx
      <Editable>
        <section className="panel">
          {/* ...unchanged... */}
        </section>

        <section className="panel stack-md">
          {/* ...unchanged... */}
        </section>

        <ComponentTable />
        <SpanwiseGrid />
        <ExecutionGrid />
      </Editable>
```

`web/src/pages/BaseRatePage.tsx` — import `Editable` and wrap the summary:

```tsx
      <Editable>
        <BaseRateSummary rows={rows} onOverride={setOverride} />
      </Editable>
```

`web/src/components/ScheduleTable.tsx` — import `Editable` and wrap the basis selector and the table body that holds the adjustment inputs. Wrap from `<label className="field basis-field no-print">` through the closing `</div>` of `<div className="panel panel--flush scroller">`:

```tsx
      <Editable>
        <label className="field basis-field no-print">
          {/* ...unchanged... */}
        </label>
        <p className="subtitle">
          {/* ...unchanged... */}
        </p>
        <div className="panel panel--flush scroller">
          {/* ...unchanged... */}
        </div>
      </Editable>
```

(ScheduleTable also renders on the Print page, where the wrapper does the same job.)

- [ ] **Step 3: A flag in the running head**

In `web/src/components/RunningHead.tsx`, add `flag?: string;` to the props type and to the destructuring, and render it after the id block:

```tsx
      <div className="running-head__id">
        <span className="running-head__name">{identity}</span>
        {sub && <span className="running-head__sub">{sub}</span>}
      </div>
      {flag && <span className="running-head__flag running-head__flag--inline">{flag}</span>}
```

- [ ] **Step 4: The shell says so, once, above the stage**

In `web/src/components/Shell.tsx`, add imports:

```tsx
import { Link } from 'react-router-dom';
import { planState } from '../billing.ts';
import { useEntitlement } from '../entitlement.tsx';
import { Band } from './Band.tsx';
```

(`NavLink` is already imported from `react-router-dom`; add `Link` to that import.)

In the component body:

```tsx
  const { view } = useEntitlement();
  const readOnly = view?.entitlement.readOnly ?? false;
  const ended = view ? planState(view) === 'ended' : false;
```

Pass `flag={readOnly ? 'Read-only' : undefined}` to `<RunningHead … />`, and directly after the `<RunningHead … />` element:

```tsx
        {readOnly && (
          <Band lock action={<Link to="/plans" className="button">{ended ? 'Renew to edit' : 'See plans'}</Link>}>
            This contract is read-only because {ended
              ? 'the plan on this account has ended'
              : 'the free plan keeps only one contract editable'}. Every figure is kept, and the bill still prints.
          </Band>
        )}
```

- [ ] **Step 5: Type-check, build, and look at it**

Run: `npx tsc -p web && npm run build -w @pes/web`
Expected: passes.

In the dev setup from Task 13, open a contract of the read-only account and compare with canvas board 6: the "Read-only" flag and the band; Main Data's fields, the component table and both grids disabled; Base Rate's overrides, the basis select and the adjustments disabled; every Print button and the bill's in/after choice still work; the Rates Chart stage unchanged.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/Editable.tsx web/src/components/RunningHead.tsx web/src/components/Shell.tsx web/src/pages/MainDataPage.tsx web/src/pages/BaseRatePage.tsx web/src/components/ScheduleTable.tsx
git commit -m "feat(web): a read-only contract says so and disables what writes, not what prints"
```

---

### Task 15: The plans page

**Files:**
- Create: `web/src/pages/PlansPage.tsx`
- Modify: `web/src/App.tsx` (route)

**Interfaces:**
- Consumes: `api.plans`, `useEntitlement`, `PERIODS`, `PERIOD_LABEL`, `PERIOD_EVERY`, `PERIOD_PER`, `formatPaise`, `nextRenewal`, `planState`, `RunningHead`, `Spinner`, `formatDate`.
- Produces: route `/plans`; links to `/plans/checkout?period=<Period>`.

- [ ] **Step 1: Write the page**

`web/src/pages/PlansPage.tsx`:

```tsx
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
```

- [ ] **Step 2: Route it**

In `web/src/App.tsx`, import `PlansPage` and add, beside `/profile`:

```tsx
        <Route path="/plans" element={<PlansPage />} />
```

- [ ] **Step 3: Type-check, build, and look at it**

Run: `npx tsc -p web && npm run build -w @pes/web`
Expected: passes.

In dev with test keys, open `/plans` and compare with canvas board 1: the prices come from the Razorpay test plans; choosing a row turns it to ink and updates the summary and the renewal date; with billing unconfigured the page shows "Billing is not available yet" (the 503) instead of the plans.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/PlansPage.tsx web/src/App.tsx
git commit -m "feat(web): the plans page, priced from Razorpay"
```

---

### Task 16: Checkout

**Files:**
- Create: `web/src/razorpay.ts`, `web/src/pages/CheckoutPage.tsx`
- Modify: `web/src/App.tsx` (route)

**Interfaces:**
- Consumes: `api.subscribe`, `api.verifySubscription`, `api.billing`, `api.plans`, `useEntitlement`, `PERIODS`, `PERIOD_LABEL`, `formatPaise`, `nextRenewal`, `ApiError`.
- Produces: `loadRazorpay(): Promise<RazorpayCtor>`; route `/plans/checkout?period=…`.

- [ ] **Step 1: Load Checkout on demand**

`web/src/razorpay.ts`:

```ts
import type { CheckoutResult } from './api.ts';

interface RazorpayOptions {
  key: string;
  subscription_id: string;
  name: string;
  description: string;
  prefill: { email: string };
  theme: { color: string };
  handler: (result: CheckoutResult) => void;
  modal: { ondismiss: () => void };
}

interface RazorpayInstance {
  open(): void;
  on(event: 'payment.failed', fn: () => void): void;
}

export type RazorpayCtor = new (options: RazorpayOptions) => RazorpayInstance;

declare global {
  interface Window { Razorpay?: RazorpayCtor }
}

let loading: Promise<RazorpayCtor> | null = null;

/** Only the checkout page pays for Razorpay's script, and only once. */
export function loadRazorpay(): Promise<RazorpayCtor> {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  loading ??= new Promise<RazorpayCtor>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => (window.Razorpay ? resolve(window.Razorpay) : reject(new Error('Razorpay did not load')));
    script.onerror = () => {
      loading = null;
      reject(new Error('Could not reach Razorpay. Check the connection and try again.'));
    };
    document.head.appendChild(script);
  });
  return loading;
}
```

- [ ] **Step 2: Write the page**

`web/src/pages/CheckoutPage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { api, ApiError, type BillingView, type Period, type PlanPrice } from '../api.ts';
import { formatPaise, nextRenewal, PERIOD_LABEL, PERIODS } from '../billing.ts';
import { RunningHead } from '../components/RunningHead.tsx';
import { Spinner } from '../components/Spinner.tsx';
import { useEntitlement } from '../entitlement.tsx';
import { formatDate } from '../format.ts';
import { loadRazorpay } from '../razorpay.ts';

type Phase = 'confirm' | 'paying' | 'confirming' | 'done' | 'failed';

const POLL_MS = 3000;
const POLL_TRIES = 20;

const isPeriod = (v: string | null): v is Period => PERIODS.includes(v as Period);
const activated = (v: BillingView) => v.entitlement.source === 'subscription';

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
        if (activated(v)) { clearInterval(timer); void refresh(); setPhase('done'); }
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
            .then((v) => { if (activated(v)) { void refresh(); setPhase('done'); } })
            .catch(() => { /* stay on Confirming; the poll takes over */ });
        },
        modal: { ondismiss: () => setPhase((p) => (p === 'paying' ? 'failed' : p)) },
      });
      checkout.on('payment.failed', () => setPhase('failed'));
      checkout.open();
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : 'Could not start the payment');
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
```

- [ ] **Step 3: Route it**

In `web/src/App.tsx`, import `CheckoutPage` and add:

```tsx
        <Route path="/plans/checkout" element={<CheckoutPage />} />
```

- [ ] **Step 4: Type-check, build, and pay in test mode**

Run: `npx tsc -p web && npm run build -w @pes/web`
Expected: passes.

In dev with test keys, as a free account: `/plans` → Continue → Pay. With the browser console open, confirm Checkout loads with no CSP violation (if one appears, add exactly the blocked origin to the matching directive in `server/src/app.ts` and to the Task 10 test). Then:
- approve with Razorpay's test success method → Confirming → Payment received; the contracts page's limit is gone;
- a second account: close the Razorpay window → Nothing was charged; Try again reopens it;
- a third: use Razorpay's test failure method → Nothing was charged.

- [ ] **Step 5: Commit**

```bash
git add web/src/razorpay.ts web/src/pages/CheckoutPage.tsx web/src/App.tsx
git commit -m "feat(web): confirm and pay through Razorpay Checkout"
```

---

### Task 17: The subscription on Your account

**Files:**
- Create: `web/src/components/SubscriptionPanel.tsx`
- Modify: `web/src/pages/ProfilePage.tsx`

**Interfaces:**
- Consumes: `useEntitlement`, `planState`, `PERIOD_LABEL`, `formatPaise`, `isoDay`, `api.cancelSubscription`, `formatDate`, `ApiError`.
- Produces: `SubscriptionPanel()`.

- [ ] **Step 1: Write the panel**

`web/src/components/SubscriptionPanel.tsx`:

```tsx
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
      <div className="section-head"><h2>Subscription</h2></div>
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
          <div className="section-head"><h2>Payments</h2></div>
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
```

- [ ] **Step 2: Put it on Your account**

In `web/src/pages/ProfilePage.tsx`, import `SubscriptionPanel` from `../components/SubscriptionPanel.tsx` and place it after `{loadError && <p className="notice">{loadError}</p>}`, before the Details section head:

```tsx
      <SubscriptionPanel />
```

- [ ] **Step 3: Type-check, build, and look at it**

Run: `npx tsc -p web && npm run build -w @pes/web`
Expected: passes.

In dev with test keys, compare Your account with canvas boards 7 and 8 for: a free account; the account subscribed in Task 16 (Active, the Payments row); Cancel auto-renew → Stop renewing → "Ends …"; a granted account (grant it with `psql` until Task 18 exists). With billing unconfigured the section is absent.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/SubscriptionPanel.tsx web/src/pages/ProfilePage.tsx
git commit -m "feat(web): Your account shows the plan, its payments, and cancels auto-renew"
```

---

### Task 18: Subscribers, for administrators

**Files:**
- Create: `web/src/pages/SubscribersPage.tsx`
- Modify: `web/src/App.tsx` (route)

**Interfaces:**
- Consumes: `api.subscribers`, `api.grant`, `api.revokeGrant`, `subscriberCategory`, `PERIOD_LABEL`, `isoDay`, `useEntitlement`, `formatDate`.
- Produces: route `/admin/subscribers`.

- [ ] **Step 1: Write the page**

`web/src/pages/SubscribersPage.tsx`:

```tsx
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, type Subscriber } from '../api.ts';
import { isoDay, PERIOD_LABEL, subscriberCategory, type SubscriberCategory } from '../billing.ts';
import { RunningHead } from '../components/RunningHead.tsx';
import { Spinner } from '../components/Spinner.tsx';
import { useEntitlement } from '../entitlement.tsx';
import { formatDate } from '../format.ts';

type Filter = 'all' | Exclude<SubscriberCategory, 'admin'>;
const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'All' }, { key: 'paying', label: 'Paying' }, { key: 'granted', label: 'Granted' },
  { key: 'free', label: 'Free' }, { key: 'ended', label: 'Ended' },
];

const STATUS: Record<SubscriberCategory, { pill: string; label: string }> = {
  admin: { pill: 'pill pill--ok', label: 'Administrator' },
  paying: { pill: 'pill pill--ok', label: 'Active' },
  granted: { pill: 'pill pill--ok', label: 'Granted' },
  free: { pill: 'pill pill--idle', label: 'Free' },
  ended: { pill: 'pill pill--bad', label: 'Ended' },
};

function statusOf(s: Subscriber) {
  if (s.subscription?.status === 'pending' && s.entitlement.source === 'subscription') {
    return { pill: 'pill pill--warn', label: 'Payment retrying' };
  }
  return STATUS[subscriberCategory(s)];
}

export function SubscribersPage() {
  const { view } = useEntitlement();
  const [rows, setRows] = useState<Subscriber[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [granting, setGranting] = useState<number | null>(null);
  const [until, setUntil] = useState('');
  const [note, setNote] = useState('');

  const load = () => { api.subscribers().then(setRows).catch((e: Error) => setError(e.message)); };
  useEffect(load, []);

  if (view && view.entitlement.source !== 'admin') {
    return <main className="page"><p className="notice">Administrator access required.</p></main>;
  }

  const counts = (rows ?? []).reduce<Record<string, number>>((acc, r) => {
    const c = subscriberCategory(r);
    acc[c] = (acc[c] ?? 0) + 1;
    return acc;
  }, {});
  const shown = (rows ?? []).filter((r) =>
    (filter === 'all' || subscriberCategory(r) === filter)
    && r.email.toLowerCase().includes(search.trim().toLowerCase()));

  function openGrant(r: Subscriber) {
    setGranting(r.id);
    setUntil(r.grant?.until ?? '');
    setNote(r.grant?.note ?? '');
    setError(null);
  }

  async function submitGrant(ev: FormEvent) {
    ev.preventDefault();
    if (granting === null) return;
    try {
      await api.grant(granting, until, note);
      setGranting(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not grant access');
    }
  }

  async function revoke(id: number) {
    try {
      await api.revokeGrant(id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not revoke');
    }
  }

  return (
    <main className="page">
      <RunningHead identity="Administration" sub="Subscribers" />
      <div className="page-head">
        <div>
          <h1 className="title">Subscribers</h1>
          <p className="subtitle">Every account, what it pays for, and until when. Administrators are always unlimited.</p>
        </div>
        <Link to="/" className="ghost">← Contracts</Link>
      </div>

      {error && <p className="notice">{error}</p>}

      <div className="filters">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" className="filter" aria-pressed={filter === f.key}
                  onClick={() => setFilter(f.key)}>
            {f.label} <span className="num">{f.key === 'all' ? rows?.length ?? 0 : counts[f.key] ?? 0}</span>
          </button>
        ))}
        <input aria-label="Find an account" placeholder="Find an account by email" className="grow"
               value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {rows === null ? <Spinner /> : (
        <div className="panel panel--flush scroller">
          <table className="grid">
            <thead>
              <tr><th>Account</th><th>Plan</th><th>Status</th><th>Paid until</th><th>Source</th><th className="r">Contracts</th><th /></tr>
            </thead>
            <tbody>
              {shown.flatMap((r) => {
                const status = statusOf(r);
                const row = (
                  <tr key={r.id}>
                    <td>{r.email}<span className="cell-sub">Joined {formatDate(isoDay(r.createdAt))}</span></td>
                    <td>{r.subscription ? PERIOD_LABEL[r.subscription.period] : r.entitlement.source === 'grant' ? '—' : 'Free'}</td>
                    <td><span className={status.pill}>{status.label}</span></td>
                    <td>{r.entitlement.paidUntil ? formatDate(r.entitlement.paidUntil) : <span className="hint">—</span>}</td>
                    <td>
                      {r.grant ? <>Granted<span className="cell-sub">{r.grant.note || '—'}</span></>
                        : r.subscription ? <>Razorpay<span className="cell-sub num num--left">{r.subscription.razorpayId}</span></>
                        : <span className="hint">—</span>}
                    </td>
                    <td className="num">
                      {r.entitlement.contractCount}
                      {r.entitlement.readOnly && <span className="cell-sub">read-only</span>}
                    </td>
                    <td className="actions">
                      {r.role === 'admin' ? null : (
                        <span className="row row--tight">
                          <button className="ghost small" onClick={() => openGrant(r)}>
                            {r.grant ? 'Change' : 'Grant…'}
                          </button>
                          {r.grant && <button className="danger small" onClick={() => void revoke(r.grant!.id)}>Revoke</button>}
                        </span>
                      )}
                    </td>
                  </tr>
                );
                if (granting !== r.id) return [row];
                return [row, (
                  <tr key={`${r.id}-grant`}>
                    <td colSpan={7}>
                      <form onSubmit={submitGrant} className="form-bar stack-sm">
                        <label className="field">
                          Unlimited contracts until
                          <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} required />
                        </label>
                        <label className="field">
                          Note, for your own records
                          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500}
                                 placeholder="e.g. Paid by UPI, ref …" />
                        </label>
                        <button type="submit">Grant access</button>
                        <button type="button" className="ghost" onClick={() => setGranting(null)}>Cancel</button>
                      </form>
                      <p className="hint">
                        A grant runs alongside any Razorpay subscription; the account is unlimited until
                        whichever date is later. The account is not charged.
                      </p>
                    </td>
                  </tr>
                )];
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Route it**

In `web/src/App.tsx`, import `SubscribersPage` and add:

```tsx
        <Route path="/admin/subscribers" element={<SubscribersPage />} />
```

- [ ] **Step 3: Type-check, build, and look at it**

Run: `npx tsc -p web && npm run build -w @pes/web`
Expected: passes.

In dev, as the admin: Contracts shows a Subscribers link; the page lists every account (compare with canvas board 9); the filter counts add up to All; Grant… opens the inline row; a past date shows the server's message; granting the read-only account from Task 13 makes its contracts editable (reload it); Revoke returns it to read-only. As a non-admin, `/admin/subscribers` shows "Administrator access required".

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/SubscribersPage.tsx web/src/App.tsx
git commit -m "feat(web): administrators see every subscriber and grant access until a date"
```

---

### Task 19: Bring the spec in line, and verify the whole

**Files:**
- Modify: `docs/superpowers/specs/2026-09-27-subscriptions-design.md`

- [ ] **Step 1: Correct the spec where the plan departed from it**

In §8, replace the "Contract stages" bullet with:

```markdown
- **Contract stages** — with `readOnly`, a "Read-only" flag in the running head and the
  band above the stage. The controls that write are wrapped in `<Editable>` — a
  `<fieldset disabled>` — on Main Data (particulars, dates, components, both grids),
  Base Rate (overrides) and the Schedule of payment (basis and adjustments). Print
  buttons and the bill's in/after choice stay outside it and keep working. The Rates
  Chart stage is not wrapped (§10).
```

and the "Your account" bullet's Payments description with:

```markdown
  … and a Payments table from `subscription_charges` — date, plan, amount, Razorpay
  payment reference; Razorpay emails the receipts — above Details and Change password.
```

Change **Status:** to `Approved; implemented`.

- [ ] **Step 2: Run everything**

Run: `npm test`
Expected: engine, server and web suites all pass.

Run: `npx tsc -p web && npm run build`
Expected: no type errors; the build succeeds.

- [ ] **Step 3: The by-hand checks in Razorpay test mode**

With test keys and a tunnel (README, "Trying it in test mode"):
- success, failure and dismissal (Task 16);
- cancel auto-renew (Task 17);
- a webhook delivered twice from the Razorpay dashboard's "resend" — one charge row;
- the checkout callback lost: in DevTools, block `/api/billing/subscriptions/verify`, pay, and see the plan switch on from the Confirming page's poll alone;
- billing off: remove one `RAZORPAY_*` variable, restart, and see no pill, no band, no limit anywhere.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-09-27-subscriptions-design.md
git commit -m "docs: the subscriptions spec records how read-only disables the stages"
```
