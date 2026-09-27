import { Link } from 'react-router-dom';
import { SITE } from '../site.ts';

/** The mark and the name. The mark is a ruled sheet: stroke, so it takes the text colour. */
export function Brand({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="brand" aria-label={`${SITE.name} home`}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <rect x="3.5" y="3.5" width="17" height="17" rx="1" />
        <path d="M7 8.5h10M7 12h10M7 15.5h6" />
      </svg>
      <span className="brand__word">{SITE.name}</span>
    </Link>
  );
}
