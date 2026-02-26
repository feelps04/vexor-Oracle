CREATE TABLE IF NOT EXISTS balance_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id text NOT NULL,
  type text NOT NULL CHECK (type IN ('deposit','withdraw')),
  amount bigint NOT NULL,
  balance_after bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_balance_operations_account_created_at ON balance_operations(account_id, created_at);
