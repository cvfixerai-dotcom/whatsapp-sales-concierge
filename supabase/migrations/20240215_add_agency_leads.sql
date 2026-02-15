-- Agency Leads table for FixerAI internal outreach CRM
CREATE TABLE IF NOT EXISTS agency_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  street TEXT,
  city TEXT,
  website TEXT,
  phone TEXT,
  linkedin_found BOOLEAN DEFAULT false,
  contacted BOOLEAN DEFAULT false,
  replied BOOLEAN DEFAULT false,
  demo_done BOOLEAN DEFAULT false,
  trial_started BOOLEAN DEFAULT false,
  client BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agency_leads_contacted ON agency_leads(contacted, created_at);
CREATE INDEX IF NOT EXISTS idx_agency_leads_city ON agency_leads(city);
