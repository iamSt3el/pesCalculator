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
