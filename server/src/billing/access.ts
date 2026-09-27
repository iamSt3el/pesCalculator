import { pool } from '../db.ts';
import { loadEntitlementFacts, type Queryable } from '../repo/subscriptions.ts';
import { decideEntitlement, type Entitlement } from './entitlement.ts';
import { getBilling } from './state.ts';

/** Null when the account no longer exists. */
export async function entitlementFor(userId: number, q: Queryable = pool): Promise<Entitlement | null> {
  const facts = await loadEntitlementFacts(userId, q);
  return facts && decideEntitlement(facts, { enforced: getBilling() !== null, now: new Date() });
}
