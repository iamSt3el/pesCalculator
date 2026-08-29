-- Contracts belong to the account that created them. Sign-up is open, so
-- without this every signed-in stranger could read and delete every bill.

-- Nullable on purpose: a database migrated before anyone signed up (a fresh
-- deploy, or a seeded local database with an empty users table) holds rows
-- that have no possible owner yet. The first account created adopts them --
-- see the bootstrap branch in src/auth/routes.ts.
ALTER TABLE contracts
  ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE RESTRICT;

-- RESTRICT, not CASCADE: deleting an account must not silently destroy its
-- billing data. Reassign the contracts first, and the delete stays loud.

CREATE INDEX idx_contracts_user ON contracts (user_id);

-- Rows that predate this migration go to the first administrator, when there
-- is one. When there is not, they stay NULL and wait to be adopted.
UPDATE contracts
   SET user_id = (SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1)
 WHERE user_id IS NULL;
