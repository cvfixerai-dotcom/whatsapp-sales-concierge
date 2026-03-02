-- Switch Dubai Elite Properties to use Claude (Anthropic)
-- Reason: Better tool calling reliability (95%+ vs 70-80% with OpenAI)

-- Step 1: Update tenant to use Anthropic
UPDATE tenants 
SET ai_provider = 'anthropic',
    ai_model = 'claude-sonnet-4-20250514'
WHERE company_name = 'Dubai Elite Properties';

-- Step 2: Verify the change
SELECT 
    id,
    company_name, 
    ai_provider, 
    ai_model,
    created_at
FROM tenants 
WHERE company_name = 'Dubai Elite Properties';

-- Expected result:
-- ai_provider: 'anthropic'
-- ai_model: 'claude-sonnet-4-20250514'
