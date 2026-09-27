import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, onEntitlementStale, type BillingView } from './api.ts';

interface EntitlementValue {
  /** null until the first load answers. Treat as "not limited" meanwhile. */
  view: BillingView | null;
  refresh: () => Promise<void>;
}

const EntitlementContext = createContext<EntitlementValue>({ view: null, refresh: async () => {} });

/**
 * What the signed-in account may do, loaded once and refetched after anything
 * that could change it: a billing action, a create or delete, and any 402 —
 * which is how a plan that lapses mid-session turns the page read-only.
 */
export function EntitlementProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<BillingView | null>(null);

  const refresh = useCallback(async () => {
    try {
      setView(await api.billing());
    } catch {
      // Keep the last answer: a blip must not flip the page between states.
    }
  }, []);

  useEffect(() => {
    void refresh();
    return onEntitlementStale(() => { void refresh(); });
  }, [refresh]);

  return <EntitlementContext.Provider value={{ view, refresh }}>{children}</EntitlementContext.Provider>;
}

export const useEntitlement = () => useContext(EntitlementContext);
