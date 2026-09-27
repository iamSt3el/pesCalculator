import { pool } from '../src/db.ts';
import { runMigrations } from '../src/migrate.ts';
import { createApp, type AppOptions } from '../src/app.ts';
import { hashPassword } from '../src/auth/password.ts';

export const PASSWORD = 'correct horse battery';

export async function resetDatabase(): Promise<void> {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await runMigrations(pool);
}

export async function startApp(options: AppOptions = {}) {
  const server = createApp(options).listen(0);
  await new Promise((r) => server.once('listening', r));
  const addr = server.address();
  const base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
  return { base, close: () => new Promise<void>((r) => server.close(() => r())) };
}

export type Agent = (path: string, init?: RequestInit) => Promise<Response>;

/** A cookie-jar fetch: keeps connect.sid between calls. */
export function agent(base: string): Agent {
  let cookie = '';
  return async (path, init = {}) => {
    const res = await fetch(base + path, {
      ...init,
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...init.headers },
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0]!;
    return res;
  };
}

/**
 * Makes the account directly rather than through sign-up, whose limiter allows
 * ten an hour, then signs in through the real route. Login allows twenty per
 * fifteen minutes, so keep a file under that.
 */
export async function signedIn(base: string, email: string, role: 'admin' | 'user' = 'user') {
  const { rows } = await pool.query<{ id: number }>(
    'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
    [email, await hashPassword(PASSWORD), role],
  );
  const as = agent(base);
  const res = await as('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password: PASSWORD }) });
  if (res.status !== 200) throw new Error(`sign-in failed for ${email}: ${res.status}`);
  return { as, id: rows[0]!.id };
}
