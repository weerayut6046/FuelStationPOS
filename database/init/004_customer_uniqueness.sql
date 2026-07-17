BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS customers_tax_branch_unique_idx
  ON customers (tax_id, coalesce(branch_code, '00000'))
  WHERE tax_id IS NOT NULL;

COMMIT;
