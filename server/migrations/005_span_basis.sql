-- The four spans are cut from the period between commencement and a completion
-- date, either the actual one or the stipulated one. Existing contracts keep
-- spreading over the actual period.
ALTER TABLE contracts
  ADD COLUMN span_basis TEXT NOT NULL DEFAULT 'actual'
    CHECK (span_basis IN ('actual', 'stipulated'));
