import type { RequestHandler } from 'express';

export interface SessionUser {
  id: number;
  email: string;
  role: 'admin' | 'user';
}

declare module 'express-session' {
  interface SessionData { user?: SessionUser }
}

export const requireAuth: RequestHandler = (req, res, next) => {
  if (!req.session.user) { res.status(401).json({ error: 'Not signed in' }); return; }
  next();
};

export const requireAdmin: RequestHandler = (req, res, next) => {
  if (!req.session.user) { res.status(401).json({ error: 'Not signed in' }); return; }
  if (req.session.user.role !== 'admin') {
    res.status(403).json({ error: 'Administrator access required' }); return;
  }
  next();
};
