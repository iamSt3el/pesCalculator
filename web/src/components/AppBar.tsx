import { NavLink, Outlet } from 'react-router-dom';
import type { SessionUser } from '../api.ts';
import { isoDay, PERIOD_LABEL, planState } from '../billing.ts';
import { useEntitlement } from '../entitlement.tsx';
import { formatDate } from '../format.ts';
import { Brand } from './Brand.tsx';
import { ThemeToggle } from './ThemeToggle.tsx';

/** The account's plan, in the fewest words that still say what it allows. */
function PlanPill() {
  const { view } = useEntitlement();
  if (!view?.configured) return null;
  const state = planState(view);
  const e = view.entitlement;
  const s = view.subscription;
  if (state === 'free' || state === 'ended') {
    return (
      <span className={`pill ${e.readOnly ? 'pill--warn' : 'pill--idle'}`}>
        {e.readOnly ? 'Read-only' : `Free plan · ${e.contractCount} of ${e.limit} contract${e.limit === 1 ? '' : 's'}`}
      </span>
    );
  }
  if (state === 'retrying') return <span className="pill pill--warn">Payment retrying</span>;
  if (state === 'granted') return <span className="pill pill--ok">Unlimited · granted</span>;
  if (state === 'ending' && s?.currentEnd) return <span className="pill pill--idle">Ends {formatDate(isoDay(s.currentEnd))}</span>;
  if (state === 'active' && s) return <span className="pill pill--ok">Unlimited · {PERIOD_LABEL[s.period].toLowerCase()}</span>;
  return null;
}

/** Every page outside a contract sits under this bar; the contract stages have their own rail. */
export function AppLayout({ user, onSignOut }: { user: SessionUser; onSignOut: () => void }) {
  return (
    <>
      <header className="appbar no-print">
        <Brand />
        <nav className="appbar__tabs" aria-label="App">
          <NavLink to="/" end className="appbar__tab">Contracts</NavLink>
          <NavLink to="/plans" className="appbar__tab">Plans</NavLink>
          {user.role === 'admin' && <NavLink to="/admin/subscribers" className="appbar__tab">Subscribers</NavLink>}
        </nav>
        <div className="appbar__end">
          <PlanPill />
          <ThemeToggle />
          <NavLink to="/profile" className="account-link">
            <span className="avatar" aria-hidden="true">{user.email.slice(0, 1).toUpperCase()}</span>
            Your account
          </NavLink>
          <button className="ghost small" onClick={onSignOut}>Sign out</button>
        </div>
      </header>
      <Outlet />
    </>
  );
}
