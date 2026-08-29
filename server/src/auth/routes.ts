import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { pool } from '../db.ts';
import { hashPassword, verifyPassword } from './password.ts';
import { type SessionUser } from './middleware.ts';

const credentials = z.object({
  email: z.string().email().max(320),
  password: z.string().min(12).max(200),
});

const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: true });

export const authRouter: Router = Router();

authRouter.post('/login', loginLimiter, async (req, res) => {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success) { res.status(401).json({ error: 'Invalid email or password' }); return; }

  const { rows } = await pool.query<{ id: number; email: string; role: 'admin' | 'user'; password_hash: string }>(
    'SELECT id, email, role, password_hash FROM users WHERE email = $1', [parsed.data.email],
  );
  const user = rows[0];
  if (!user || !(await verifyPassword(user.password_hash, parsed.data.password))) {
    res.status(401).json({ error: 'Invalid email or password' }); return;
  }

  // Rotate the session id on login so a pre-auth cookie cannot be replayed.
  req.session.regenerate((regenErr) => {
    if (regenErr) { res.status(500).json({ error: 'Could not start session' }); return; }
    req.session.user = { id: user.id, email: user.email, role: user.role };
    // Persist before responding. express-session otherwise writes to the store
    // in its res.end hook, so the client's next request can arrive before the
    // session exists and be rejected as signed out.
    req.session.save((saveErr) => {
      if (saveErr) { res.status(500).json({ error: 'Could not start session' }); return; }
      res.json(req.session.user);
    });
  });
});

authRouter.post('/logout', (req, res) => {
  req.session.destroy(() => { res.clearCookie('connect.sid'); res.status(204).end(); });
});

authRouter.get('/me', (req, res) => {
  if (!req.session.user) { res.status(401).json({ error: 'Not signed in' }); return; }
  res.json(req.session.user);
});

export const usersRouter: Router = Router();

// Sign-up is open and unauthenticated, and hashing a password is deliberately
// expensive, so cap how fast one address can mint accounts.
const signupLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 10, standardHeaders: true });

/**
 * Open sign-up: anyone may create an account. The first one still becomes the
 * administrator, so the role column keeps its meaning.
 *
 * This is only safe because contracts are owner-scoped -- a new account starts
 * with an empty list and cannot read or delete anybody else's bills. See the
 * ownership guard in routes/contracts.ts.
 */
usersRouter.post('/', signupLimiter, async (req, res, next) => {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Email must be valid and the password at least 12 characters' });
    return;
  }

  try {
    const { rows: counted } = await pool.query<{ count: string }>('SELECT count(*)::text FROM users');
    const isFirst = counted[0]!.count === '0';
    const hash = await hashPassword(parsed.data.password);

    const { rows } = await pool.query<SessionUser>(
      'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role',
      [parsed.data.email, hash, isFirst ? 'admin' : 'user'],
    );
    const user = rows[0]!;

    // The founding admin adopts every contract that predates sign-up: seeded
    // rows, and anything migrated while the users table was still empty.
    // Without this those rows have no owner and nobody could ever open them.
    if (isFirst) {
      await pool.query('UPDATE contracts SET user_id = $1 WHERE user_id IS NULL', [user.id]);
    }

    res.status(201).json(user);
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'That email address already has an account' });
      return;
    }
    next(err);
  }
});
