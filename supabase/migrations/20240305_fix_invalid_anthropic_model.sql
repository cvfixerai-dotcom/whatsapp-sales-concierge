-- Fix invalid Anthropic model in tenant records
-- claude-3-5-sonnet-20241022 does not exist in Anthropic API (returns 404)
-- Replace with valid claude-3-5-sonnet-20240620 or default to claude-3-haiku-20240307

UPDATE tenants
SET ai_model = 'claude-3-haiku-20240307'
WHERE ai_provider = 'anthropic'
  AND ai_model = 'claude-3-5-sonnet-20241022';

-- Also fix any test data that might have the invalid model
UPDATE tenants
SET ai_model = 'claude-3-haiku-20240307'
WHERE ai_provider = 'anthropic'
  AND ai_model NOT IN (
    'claude-3-5-sonnet-20240620',
    'claude-3-opus-20240229',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307'
  );
