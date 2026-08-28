import express from 'express';
import helmet from 'helmet';

export function createApp(): express.Express {
  const app = express();
  app.use(helmet());
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => { res.json({ ok: true }); });

  // Routes from later tasks mount here.

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
