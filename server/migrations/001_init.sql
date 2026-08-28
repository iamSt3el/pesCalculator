CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Shared master data: one row per month, used by every contract.
CREATE TABLE rates (
  month      DATE PRIMARY KEY,
  labour     NUMERIC(12, 3),
  material   NUMERIC(12, 3),
  cement     NUMERIC(12, 3),
  steel      NUMERIC(12, 3),
  pol        NUMERIC(12, 3),
  bitumen_g  NUMERIC(14, 2),
  bitumen_h  NUMERIC(14, 2),
  source     TEXT
);

CREATE TABLE contracts (
  id                     SERIAL PRIMARY KEY,
  agreement_no           TEXT NOT NULL,
  contractor             TEXT NOT NULL DEFAULT '',
  work_name              TEXT NOT NULL DEFAULT '',
  wo_no_date             TEXT NOT NULL DEFAULT '',
  wo_amount              NUMERIC(16, 2) NOT NULL DEFAULT 0,
  work_done_amount       NUMERIC(16, 2) NOT NULL DEFAULT 0,
  bid_date               DATE,
  commencement           DATE,
  stipulated_completion  DATE,
  actual_completion      DATE,
  bitumen_offset_days    INTEGER NOT NULL DEFAULT 28,
  already_paid           NUMERIC(16, 2) NOT NULL DEFAULT 0,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE components (
  contract_id   INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  key           TEXT NOT NULL CHECK (key IN ('labour','material','cement','steel','pol','bitumen')),
  percent       NUMERIC(8, 4) NOT NULL DEFAULT 0,
  factor        NUMERIC(5, 3) NOT NULL DEFAULT 0.75,
  base_rule     TEXT NOT NULL CHECK (base_rule IN ('quarter_average','bid_month','offset_month')),
  base_override NUMERIC(14, 4),
  PRIMARY KEY (contract_id, key)
);

CREATE TABLE progress (
  contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  month       DATE NOT NULL,
  span1_days  INTEGER NOT NULL DEFAULT 0,
  span2_days  INTEGER NOT NULL DEFAULT 0,
  span3_days  INTEGER NOT NULL DEFAULT 0,
  span4_days  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (contract_id, month)
);

-- Only the operator's adjustment is stored; the computed part is always
-- recalculated from progress, so correcting a day count propagates.
CREATE TABLE payments (
  contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  month       DATE NOT NULL,
  adjustment  NUMERIC(16, 2) NOT NULL DEFAULT 0,
  PRIMARY KEY (contract_id, month)
);

CREATE TABLE session (
  sid    TEXT PRIMARY KEY,
  sess   JSON NOT NULL,
  expire TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_session_expire ON session (expire);
