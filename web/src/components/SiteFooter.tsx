import { Link } from 'react-router-dom';
import { SITE } from '../site.ts';

/** The policies, one click from every public page and from sign-in. */
export function SiteFooter() {
  return (
    <footer className="site-foot no-print">
      <span>© {new Date().getFullYear()} {SITE.operator}</span>
      <nav className="row row--tight" aria-label="Policies">
        <Link to="/terms">Terms</Link>
        <Link to="/privacy">Privacy</Link>
        <Link to="/refunds">Refunds and cancellation</Link>
        <Link to="/contact">Contact</Link>
      </nav>
    </footer>
  );
}
