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
