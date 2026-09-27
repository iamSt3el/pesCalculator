import { pool, withTransaction } from '../db.ts';
import type { Queryable } from './subscriptions.ts';

export interface GrantRow {
  id: number;
  userId: number;
  until: string;
  note: string;
  grantedBy: number;
  createdAt: Date;
  revokedAt: Date | null;
}

const COLUMNS = `id, user_id AS "userId", until, note, granted_by AS "grantedBy",
  created_at AS "createdAt", revoked_at AS "revokedAt"`;

export async function liveGrantOf(userId: number, today: string, q: Queryable = pool): Promise<GrantRow | null> {
  const { rows } = await q.query<GrantRow>(
    `SELECT ${COLUMNS} FROM access_grants
      WHERE user_id = $1 AND revoked_at IS NULL AND until >= $2::date
      ORDER BY until DESC LIMIT 1`, [userId, today],
  );
  return rows[0] ?? null;
}

/** One live grant per account: the new one replaces whatever was there. */
export async function createGrant(g: { userId: number; until: string; note: string; grantedBy: number }): Promise<GrantRow> {
  return withTransaction(async (client) => {
    await client.query(
      'UPDATE access_grants SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [g.userId],
    );
    const { rows } = await client.query<GrantRow>(
      `INSERT INTO access_grants (user_id, until, note, granted_by) VALUES ($1, $2, $3, $4)
       RETURNING ${COLUMNS}`,
      [g.userId, g.until, g.note, g.grantedBy],
    );
    return rows[0]!;
  });
}

/** Marks it revoked; nothing is deleted. False when there was no live grant by that id. */
export async function revokeGrant(id: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    'UPDATE access_grants SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL', [id],
  );
  return (rowCount ?? 0) > 0;
}
