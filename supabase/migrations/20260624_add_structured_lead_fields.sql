-- Add structured, industry-aware qualification fields to contacts.
-- These give the AI somewhere to persist what it qualifies from leads
-- (property type, locations, budget range, move timeline) instead of only
-- writing free-text into budget_range/service_interest.

ALTER TABLE contacts
    ADD COLUMN IF NOT EXISTS property_type TEXT,
    ADD COLUMN IF NOT EXISTS preferred_locations TEXT[],
    ADD COLUMN IF NOT EXISTS budget_min INTEGER,
    ADD COLUMN IF NOT EXISTS budget_max INTEGER,
    ADD COLUMN IF NOT EXISTS move_timeline TEXT,
    ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}'::jsonb;

-- budget_range (free-text, e.g. "1m-3m") is deprecated in favour of the
-- structured budget_min/budget_max pair above. Kept for backward
-- compatibility with existing prompts/tools that still read/write it.
COMMENT ON COLUMN contacts.budget_range IS 'DEPRECATED: use budget_min/budget_max instead. Kept for backward compatibility.';

COMMENT ON COLUMN contacts.property_type IS 'Structured qualification field: type of property/vehicle/service the lead is interested in, depending on tenant industry.';
COMMENT ON COLUMN contacts.preferred_locations IS 'Structured qualification field: list of areas/locations the lead is interested in.';
COMMENT ON COLUMN contacts.budget_min IS 'Structured qualification field: lower bound of lead budget.';
COMMENT ON COLUMN contacts.budget_max IS 'Structured qualification field: upper bound of lead budget.';
COMMENT ON COLUMN contacts.move_timeline IS 'Structured qualification field: when the lead wants to move/start/buy.';
COMMENT ON COLUMN contacts.custom_fields IS 'Industry-specific qualification data beyond the standard columns (e.g. decision_maker, financing, insurance, specialty), keyed per industry_agents.contact_fields.';

-- No RLS change needed: the existing "Contacts tenant access" policy on
-- contacts is row-level (FOR ALL USING tenant_id IN ...), so it already
-- covers all columns including the ones added above.
