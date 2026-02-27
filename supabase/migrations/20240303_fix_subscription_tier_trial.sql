-- Fix subscription_tier CHECK constraint to include 'trial'
-- New tenants are created with subscription_tier='trial' but the old constraint
-- only allowed ('free', 'starter', 'growth', 'scale', 'enterprise').

ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_subscription_tier_check;

ALTER TABLE tenants
  ADD CONSTRAINT tenants_subscription_tier_check
  CHECK (subscription_tier IN ('trial', 'free', 'starter', 'growth', 'scale', 'enterprise'));

-- Backfill: any tenant on trial status but stuck with 'starter' (or other) tier
-- due to the old constraint rejecting 'trial' should be corrected.
UPDATE tenants
SET
  subscription_tier = 'trial',
  monthly_conversation_limit = COALESCE(NULLIF(monthly_conversation_limit, 0), 25),
  trial_conversation_limit   = COALESCE(NULLIF(trial_conversation_limit, 0), 25),
  trial_start_date = COALESCE(trial_start_date, created_at),
  trial_end_date   = COALESCE(trial_end_date, created_at + INTERVAL '7 days')
WHERE subscription_status = 'trial'
  AND subscription_tier != 'trial';
