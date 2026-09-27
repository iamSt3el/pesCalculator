-- A subscription mirrors one Razorpay subscription. Razorpay is the source of
-- truth; this row is what the app last fetched from it, so status is stored
-- verbatim rather than mapped onto a vocabulary of our own.
CREATE TABLE subscriptions (
  id                        SERIAL PRIMARY KEY,
  user_id                   INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  razorpay_subscription_id  TEXT NOT NULL UNIQUE,
  period                    TEXT NOT NULL CHECK (period IN ('monthly', 'half_yearly', 'yearly')),
  status                    TEXT NOT NULL,
  current_start             TIMESTAMPTZ,
  current_end               TIMESTAMPTZ,
  cancel_at_cycle_end       BOOLEAN NOT NULL DEFAULT false,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_subscriptions_user ON subscriptions (user_id);

-- One row per captured charge, for the account's payment history.
CREATE TABLE subscription_charges (
  razorpay_payment_id  TEXT PRIMARY KEY,
  subscription_id      INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE RESTRICT,
  amount_paise         BIGINT NOT NULL,
  paid_at              TIMESTAMPTZ NOT NULL,
  razorpay_invoice_id  TEXT
);

-- Paid access given by an administrator, independent of Razorpay. `until` is
-- an Indian calendar date and is inclusive.
CREATE TABLE access_grants (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  until       DATE NOT NULL,
  note        TEXT NOT NULL DEFAULT '',
  granted_by  INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at  TIMESTAMPTZ
);
CREATE INDEX idx_access_grants_user ON access_grants (user_id);

-- Every webhook delivery that was applied, so a retried one is applied once.
CREATE TABLE billing_events (
  event_id     TEXT PRIMARY KEY,
  event_type   TEXT NOT NULL,
  payload      JSONB NOT NULL,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
