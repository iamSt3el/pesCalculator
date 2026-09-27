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
