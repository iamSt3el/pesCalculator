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
