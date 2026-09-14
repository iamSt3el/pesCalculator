-- The schedule of payment bills either from the days entered span by span or
-- from the expenditure entered by hand as the work was executed. Existing
-- contracts keep billing span wise.
ALTER TABLE contracts
  ADD COLUMN schedule_basis TEXT NOT NULL DEFAULT 'spanwise'
    CHECK (schedule_basis IN ('spanwise', 'execution'));

-- Execution-wise expenditure, one figure per month, typed by the operator and
-- never calculated.
CREATE TABLE expenditure (
  contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  month       DATE NOT NULL,
  amount      NUMERIC(16, 2) NOT NULL DEFAULT 0,
  PRIMARY KEY (contract_id, month)
);
