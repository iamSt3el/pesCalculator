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
