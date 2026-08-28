import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import connectPgSimple from 'connect-pg-simple';
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import { authRouter, usersRouter } from './auth/routes.ts';
import { pool } from './db.ts';
import { contractsRouter } from './routes/contracts.ts';
import { ratesRouter } from './routes/rates.ts';

export function createApp(): express.Express {
  const app = express();
  app.set('trust proxy', 1);  // Render terminates TLS in front of us
  app.use(helmet());
  app.use(express.json({ limit: '2mb' }));

  const PgStore = connectPgSimple(session);
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not set');

  app.use(session({
    store: new PgStore({ pool, tableName: 'session', createTableIfMissing: false }),
    secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 12 * 60 * 60 * 1000,
    },
  }));

  app.get('/api/health', (_req, res) => { res.json({ ok: true }); });
  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);

  app.use('/api/rates', ratesRouter);
  app.use('/api/contracts', contractsRouter);

  // An unmatched /api path is a client error, not a missing page.
  app.use('/api', (_req, res) => { res.status(404).json({ error: 'No such endpoint' }); });

  const webDist = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'web', 'dist');
  if (existsSync(webDist)) {
    app.use(express.static(webDist, { index: false, maxAge: '1h' }));
    // Deep links are client-routed, so every non-API path gets the shell.
    app.get(/.*/, (_req, res) => { res.sendFile(join(webDist, 'index.html')); });
  }

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
