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

  // Routes from later tasks mount here.

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
