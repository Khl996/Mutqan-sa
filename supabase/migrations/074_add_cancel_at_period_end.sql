-- Add cancel_at_period_end column to tenant_subscriptions
ALTER TABLE tenant_subscriptions
ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN DEFAULT false;

-- Add a comment explaining the column
COMMENT ON COLUMN tenant_subscriptions.cancel_at_period_end IS 'If true, the subscription will be cancelled at the end of the current period instead of renewing.';
