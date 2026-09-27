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
