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
