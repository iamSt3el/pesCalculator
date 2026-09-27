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
