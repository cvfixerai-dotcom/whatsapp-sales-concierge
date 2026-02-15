-- Discovery Call leads captured from /realestate landing page
CREATE TABLE IF NOT EXISTS discovery_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  agency TEXT,
  source TEXT DEFAULT 'realestate_page',
  status TEXT DEFAULT 'new',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discovery_leads_status ON discovery_leads(status, created_at);
CREATE INDEX IF NOT EXISTS idx_discovery_leads_email ON discovery_leads(email);
