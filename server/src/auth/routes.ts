import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { pool } from '../db.ts';
import { hashPassword, verifyPassword } from './password.ts';
import { requireAdmin, type SessionUser } from './middleware.ts';

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

async function createUser(req: Request, res: Response, role: 'admin' | 'user'): Promise<void> {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Email must be valid and the password at least 12 characters' });
    return;
  }
  const hash = await hashPassword(parsed.data.password);
  try {
    const { rows } = await pool.query<SessionUser>(
      'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role',
      [parsed.data.email, hash, role],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'That email address already has an account' });
      return;
    }
    throw err;
  }
}

export const usersRouter: Router = Router();

/**
 * No open sign-up: the very first account bootstraps an admin, and after that
 * only an admin may create accounts.
 */
usersRouter.post('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query<{ count: string }>('SELECT count(*)::text FROM users');
    if (rows[0]!.count === '0') { await createUser(req, res, 'admin'); return; }
    requireAdmin(req, res, () => { void createUser(req, res, 'user').catch(next); });
  } catch (err) {
    next(err);
  }
});
