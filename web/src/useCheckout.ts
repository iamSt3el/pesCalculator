import { useCallback, useEffect, useState } from 'react';
import { api, type Period } from './api.ts';
import { PERIOD_LABEL, subscriptionActive } from './billing.ts';
import { useEntitlement } from './entitlement.tsx';
import { SITE } from './site.ts';
import { loadRazorpay } from './razorpay.ts';

export type CheckoutPhase = 'choose' | 'paying' | 'confirming' | 'done' | 'failed';

const POLL_MS = 3000;
const POLL_TRIES = 20;

/**
 * Starting a subscription, handing it to Razorpay Checkout, and waiting for it
 * to land. The plan still switches on by itself if the wait gives up — the
 * webhook or the next load of the account's billing lands it.
 */
export function useCheckout() {
  const { refresh } = useEntitlement();
  const [phase, setPhase] = useState<CheckoutPhase>('choose');
  const [error, setError] = useState<string | null>(null);
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    if (phase !== 'confirming') return;
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      api.billing().then((v) => {
        if (subscriptionActive(v)) { clearInterval(timer); void refresh(); setPhase('done'); }
      }).catch(() => {});
      if (tries >= POLL_TRIES) { clearInterval(timer); setGaveUp(true); }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [phase, refresh]);

  const pay = useCallback(async (period: Period) => {
    setError(null);
    setPhase('paying');
    try {
      const [Razorpay, started] = await Promise.all([loadRazorpay(), api.subscribe(period)]);
      const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
      const checkout = new Razorpay({
        key: started.keyId,
        subscription_id: started.subscriptionId,
        name: SITE.name,
        description: `Unlimited contracts — ${PERIOD_LABEL[period].toLowerCase()}`,
        prefill: { email: started.email },
        theme: { color: accent },
        handler: (result) => {
          setPhase('confirming');
          api.verifySubscription(result)
            .then((v) => { if (subscriptionActive(v)) { void refresh(); setPhase('done'); } })
            .catch(() => { /* stay on Confirming; the poll takes over */ });
        },
        modal: { ondismiss: () => setPhase((p) => (p === 'paying' ? 'failed' : p)) },
      });
      checkout.on('payment.failed', () => setPhase('failed'));
      checkout.open();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the payment');
      setPhase('choose');
    }
  }, [refresh]);

  const reset = useCallback(() => { setPhase('choose'); setGaveUp(false); }, []);

  return { phase, error, gaveUp, pay, reset };
}
