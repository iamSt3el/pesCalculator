import type { ReactNode } from 'react';
import { LockIcon } from './LockIcon.tsx';

/**
 * A full-width strip that says what state the account is in and the one thing
 * to do about it. Screen only: a printed bill does not carry the account's plan.
 */
export function Band({ tone = 'warn', lock = false, action, children }: {
  tone?: 'warn' | 'neutral';
  lock?: boolean;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`band band--${tone} no-print`} role="status">
      {lock && <LockIcon />}
      <div className="band__body">{children}</div>
      {action}
    </div>
  );
}
