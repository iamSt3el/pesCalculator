import type { ReactNode } from 'react';
import { useEntitlement } from '../entitlement.tsx';

/**
 * Wraps the controls that write to the contract. When the account is
 * read-only the fieldset disables every input, select and button inside it in
 * one move; Print and the bill's period choice sit outside it and keep working.
 */
export function Editable({ children }: { children: ReactNode }) {
  const { view } = useEntitlement();
  return (
    <fieldset className="editable" disabled={view?.entitlement.readOnly ?? false}>
      {children}
    </fieldset>
  );
}
