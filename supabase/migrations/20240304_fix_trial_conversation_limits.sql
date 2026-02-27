-- Fix monthly_conversation_limit for trial tenants that have wrong values (e.g. 500 instead of 25)
-- This corrects any tenant on trial status whose conversation limit is not 25.

UPDATE tenants
SET
  monthly_conversation_limit = 25,
  trial_conversation_limit   = 25
WHERE subscription_status = 'trial'
  AND (
    monthly_conversation_limit IS NULL
    OR monthly_conversation_limit = 0
    OR monthly_conversation_limit > 25
  );
