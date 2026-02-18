-- Add missing fields to agency_leads table
ALTER TABLE agency_leads 
ADD COLUMN IF NOT EXISTS contact_name TEXT,
ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
ADD COLUMN IF NOT EXISTS company_corrected TEXT;

-- Add index for linkedin searches
CREATE INDEX IF NOT EXISTS idx_agency_leads_linkedin ON agency_leads(linkedin_url) WHERE linkedin_url IS NOT NULL;
