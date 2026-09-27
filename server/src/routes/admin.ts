import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.ts';
import { requireAdmin } from '../auth/middleware.ts';
import { entitlementFor } from '../billing/access.ts';
import { indiaDate } from '../billing/entitlement.ts';
import { createGrant, liveGrantOf, revokeGrant } from '../repo/grants.ts';
import { subscriptionsOf } from '../repo/subscriptions.ts';

export const adminRouter: Router = Router();
adminRouter.use(requireAdmin);

const parseId = (raw: string | undefined): number | null => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** A handful of accounts: one query each is simpler than a join and fast enough. */
adminRouter.get('/subscribers', async (_req, res) => {
  const { rows: users } = await pool.query<{ id: number; email: string; role: 'admin' | 'user'; created_at: Date }>(
    'SELECT id, email, role, created_at FROM users ORDER BY id',
  );
  const today = indiaDate(new Date());
  const out = [];
  for (const u of users) {
    const entitlement = await entitlementFor(u.id);
    if (!entitlement) continue;
    const current = (await subscriptionsOf(u.id)).find((s) => s.status !== 'created') ?? null;
    const grant = await liveGrantOf(u.id, today);
    out.push({
      id: u.id,
      email: u.email,
      role: u.role,
      createdAt: u.created_at.toISOString(),
      entitlement,
      subscription: current && {
        razorpayId: current.razorpayId,
        period: current.period,
        status: current.status,
        currentEnd: current.currentEnd?.toISOString() ?? null,
        cancelAtCycleEnd: current.cancelAtCycleEnd,
      },
      grant: grant && { id: grant.id, until: grant.until, note: grant.note },
    });
  }
  res.json(out);
});

const grantBody = z.object({
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(500).default(''),
});

/** A calendar date that exists: 2027-02-30 parses in JS, and rolls into March. */
function realDate(iso: string): boolean {
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

adminRouter.post('/users/:id/grants', async (req, res) => {
  const userId = parseId(req.params.id);
  if (userId === null) { res.status(400).json({ error: 'Invalid account id' }); return; }
  const parsed = grantBody.safeParse(req.body);
  if (!parsed.success || !realDate(parsed.data.until)) {
    res.status(400).json({ error: 'Give the last day of access as a date' });
    return;
  }
  if (parsed.data.until < indiaDate(new Date())) {
    res.status(400).json({ error: 'A grant must run until today or later' });
    return;
  }
  const { rowCount } = await pool.query('SELECT 1 FROM users WHERE id = $1', [userId]);
  if (!rowCount) { res.status(404).json({ error: 'No such account' }); return; }

  const grant = await createGrant({
    userId, until: parsed.data.until, note: parsed.data.note.trim(), grantedBy: req.session.user!.id,
  });
  res.status(201).json(grant);
});

adminRouter.delete('/grants/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) { res.status(400).json({ error: 'Invalid grant id' }); return; }
  if (!(await revokeGrant(id))) { res.status(404).json({ error: 'No such grant' }); return; }
  res.status(204).end();
});
