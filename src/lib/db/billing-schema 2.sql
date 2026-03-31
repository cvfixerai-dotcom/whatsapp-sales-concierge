-- Top-up Purchases Table
CREATE TABLE IF NOT EXISTS topup_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  topup_type TEXT NOT NULL,
  conversations INTEGER NOT NULL,
  amount_paid DECIMAL(10,2) NOT NULL,
  paystack_reference TEXT NOT NULL UNIQUE,
  billing_month DATE NOT NULL,
  purchased_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE topup_purchases ENABLE ROW LEVEL SECURITY;

-- RLS Policy
DROP POLICY IF EXISTS "Top-up purchases tenant access" ON topup_purchases;
CREATE POLICY "Top-up purchases tenant access" ON topup_purchases
    FOR ALL USING (
        tenant_id IN (
            SELECT tenant_id FROM users WHERE id = auth.uid()
        )
    );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_topup_tenant ON topup_purchases(tenant_id);
CREATE INDEX IF NOT EXISTS idx_topup_month ON topup_purchases(tenant_id, billing_month);
CREATE INDEX IF NOT EXISTS idx_topup_reference ON topup_purchases(paystack_reference);

-- Conversation Usage Table (if not exists)
CREATE TABLE IF NOT EXISTS conversation_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  billing_month DATE NOT NULL,
  conversation_count INTEGER DEFAULT 0,
  topup_conversations_remaining INTEGER DEFAULT 0,
  topup_conversations_purchased INTEGER DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, billing_month)
);

-- Enable RLS
ALTER TABLE conversation_usage ENABLE ROW LEVEL SECURITY;

-- RLS Policy
DROP POLICY IF EXISTS "Conversation usage tenant access" ON conversation_usage;
CREATE POLICY "Conversation usage tenant access" ON conversation_usage
    FOR ALL USING (
        tenant_id IN (
            SELECT tenant_id FROM users WHERE id = auth.uid()
        )
    );

-- Add topup_conversations_remaining if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='conversation_usage' 
        AND column_name='topup_conversations_remaining'
    ) THEN
        ALTER TABLE conversation_usage ADD COLUMN topup_conversations_remaining INTEGER DEFAULT 0;
    END IF;
END
$$;

-- Payments Table
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  paystack_reference TEXT NOT NULL UNIQUE,
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  type TEXT NOT NULL, -- 'setup_fee', 'subscription', 'topup'
  status TEXT NOT NULL, -- 'pending', 'success', 'failed'
  paid_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- RLS Policy
DROP POLICY IF EXISTS "Payments tenant access" ON payments;
CREATE POLICY "Payments tenant access" ON payments
    FOR ALL USING (
        tenant_id IN (
            SELECT tenant_id FROM users WHERE id = auth.uid()
        )
    );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payments_tenant ON payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_type ON payments(type);
CREATE INDEX IF NOT EXISTS idx_payments_reference ON payments(paystack_reference);

-- Invoices Table
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  paystack_request_code TEXT NOT NULL UNIQUE,
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  description TEXT,
  due_date DATE,
  status TEXT DEFAULT 'pending', -- 'pending', 'paid', 'overdue', 'cancelled'
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- RLS Policy
DROP POLICY IF EXISTS "Invoices tenant access" ON invoices;
CREATE POLICY "Invoices tenant access" ON invoices
    FOR ALL USING (
        tenant_id IN (
            SELECT tenant_id FROM users WHERE id = auth.uid()
        )
    );

-- Update Tenants Table to Add Billing Fields
DO $$
BEGIN
    -- Check and add columns if they don't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='tenants' 
        AND column_name='paystack_customer_code'
    ) THEN
        ALTER TABLE tenants ADD COLUMN paystack_customer_code TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='tenants' 
        AND column_name='paystack_customer_id'
    ) THEN
        ALTER TABLE tenants ADD COLUMN paystack_customer_id TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='tenants' 
        AND column_name='paystack_subscription_code'
    ) THEN
        ALTER TABLE tenants ADD COLUMN paystack_subscription_code TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='tenants' 
        AND column_name='subscription_tier'
    ) THEN
        ALTER TABLE tenants ADD COLUMN subscription_tier TEXT DEFAULT 'starter';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='tenants' 
        AND column_name='subscription_status'
    ) THEN
        ALTER TABLE tenants ADD COLUMN subscription_status TEXT DEFAULT 'trial';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='tenants' 
        AND column_name='monthly_conversation_limit'
    ) THEN
        ALTER TABLE tenants ADD COLUMN monthly_conversation_limit INTEGER DEFAULT 500;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='tenants' 
        AND column_name='setup_fee_paid'
    ) THEN
        ALTER TABLE tenants ADD COLUMN setup_fee_paid BOOLEAN DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='tenants' 
        AND column_name='setup_fee_paid_at'
    ) THEN
        ALTER TABLE tenants ADD COLUMN setup_fee_paid_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='tenants' 
        AND column_name='current_usage'
    ) THEN
        ALTER TABLE tenants ADD COLUMN current_usage INTEGER DEFAULT 0;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='tenants' 
        AND column_name='usage_updated_at'
    ) THEN
        ALTER TABLE tenants ADD COLUMN usage_updated_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='tenants' 
        AND column_name='subscription_started_at'
    ) THEN
        ALTER TABLE tenants ADD COLUMN subscription_started_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='tenants' 
        AND column_name='subscription_cancelled_at'
    ) THEN
        ALTER TABLE tenants ADD COLUMN subscription_cancelled_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='tenants' 
        AND column_name='next_billing_date'
    ) THEN
        ALTER TABLE tenants ADD COLUMN next_billing_date DATE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='tenants' 
        AND column_name='access_until'
    ) THEN
        ALTER TABLE tenants ADD COLUMN access_until TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='tenants' 
        AND column_name='subscription_updated_at'
    ) THEN
        ALTER TABLE tenants ADD COLUMN subscription_updated_at TIMESTAMPTZ;
    END IF;
END
$$;

-- Create indexes for new tenant columns
CREATE INDEX IF NOT EXISTS idx_tenants_subscription ON tenants(subscription_tier, subscription_status);
CREATE INDEX IF NOT EXISTS idx_tenants_paystack_customer ON tenants(paystack_customer_code);
CREATE INDEX IF NOT EXISTS idx_tenants_paystack_subscription ON tenants(paystack_subscription_code);

-- Onboarding Queue Table
CREATE TABLE IF NOT EXISTS onboarding_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  step TEXT NOT NULL, -- 'welcome_email', 'whatsapp_setup', 'ai_training', 'completed'
  status TEXT DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'failed'
  data JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE onboarding_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policy
DROP POLICY IF EXISTS "Onboarding queue tenant access" ON onboarding_queue;
CREATE POLICY "Onboarding queue tenant access" ON onboarding_queue
    FOR ALL USING (
        tenant_id IN (
            SELECT tenant_id FROM users WHERE id = auth.uid()
        )
    );

-- Grant permissions
GRANT ALL ON topup_purchases TO authenticated;
GRANT ALL ON conversation_usage TO authenticated;
GRANT ALL ON payments TO authenticated;
GRANT ALL ON invoices TO authenticated;
GRANT ALL ON onboarding_queue TO authenticated;

-- Function to get monthly usage summary
CREATE OR REPLACE FUNCTION get_monthly_usage_summary(tenant_uuid UUID, months INTEGER DEFAULT 12)
RETURNS TABLE (
  billing_month DATE,
  conversation_count INTEGER,
  topup_purchased INTEGER,
  topup_used INTEGER,
  total_cost DECIMAL(10,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cu.billing_month,
    cu.conversation_count,
    COALESCE(SUM(tp.conversations), 0) as topup_purchased,
    cu.topup_conversations_remaining as topup_used,
    COALESCE(SUM(tp.amount_paid), 0) as total_cost
  FROM conversation_usage cu
  LEFT JOIN topup_purchases tp ON cu.tenant_id = tp.tenant_id 
    AND cu.billing_month = tp.billing_month
  WHERE cu.tenant_id = tenant_uuid
    AND cu.billing_month >= (CURRENT_DATE - INTERVAL '1 month' * months)
  GROUP BY cu.billing_month, cu.conversation_count, cu.topup_conversations_remaining
  ORDER BY cu.billing_month DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to check and update conversation limits
CREATE OR REPLACE FUNCTION check_conversation_limit(tenant_uuid UUID)
RETURNS TABLE (
  can_converse BOOLEAN,
  current_usage INTEGER,
  monthly_limit INTEGER,
  topup_remaining INTEGER,
  is_over_limit BOOLEAN
) AS $$
DECLARE
  current_month DATE := DATE_TRUNC('month', CURRENT_DATE);
  usage_record RECORD;
  tenant_record RECORD;
BEGIN
  -- Get tenant info
  SELECT * INTO tenant_record
  FROM tenants
  WHERE id = tenant_uuid;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Get or create usage record
  SELECT * INTO usage_record
  FROM conversation_usage
  WHERE tenant_id = tenant_uuid AND billing_month = current_month;
  
  IF NOT FOUND THEN
    INSERT INTO conversation_usage (tenant_id, billing_month)
    VALUES (tenant_uuid, current_month)
    RETURNING * INTO usage_record;
  END IF;
  
  RETURN QUERY
  SELECT 
    (usage_record.conversation_count < tenant_record.monthly_conversation_limit) 
      OR (usage_record.topup_conversations_remaining > 0) as can_converse,
    usage_record.conversation_count as current_usage,
    tenant_record.monthly_conversation_limit as monthly_limit,
    usage_record.topup_conversations_remaining as topup_remaining,
    usage_record.conversation_count > tenant_record.monthly_conversation_limit 
      AND usage_record.topup_conversations_remaining = 0 as is_over_limit;
END;
$$ LANGUAGE plpgsql;

-- View for billing dashboard
CREATE OR REPLACE VIEW billing_dashboard AS
SELECT 
  t.id as tenant_id,
  t.company_name,
  t.subscription_tier,
  t.subscription_status,
  t.monthly_conversation_limit,
  t.current_usage,
  t.setup_fee_paid,
  t.next_billing_date,
  -- Current month usage
  COALESCE(cu.conversation_count, 0) as current_month_conversations,
  COALESCE(cu.topup_conversations_remaining, 0) as topup_conversations_remaining,
  -- Calculate percentage used
  CASE 
    WHEN t.monthly_conversation_limit > 0 
    THEN ROUND((COALESCE(cu.conversation_count, 0)::DECIMAL / t.monthly_conversation_limit) * 100, 2)
    ELSE 0
  END as usage_percentage,
  -- Last payment
  (SELECT amount FROM payments 
   WHERE tenant_id = t.id AND status = 'success' 
   ORDER BY paid_at DESC LIMIT 1) as last_payment_amount,
  (SELECT paid_at FROM payments 
   WHERE tenant_id = t.id AND status = 'success' 
   ORDER BY paid_at DESC LIMIT 1) as last_payment_date
FROM tenants t
LEFT JOIN conversation_usage cu ON t.id = cu.tenant_id 
  AND cu.billing_month = DATE_TRUNC('month', CURRENT_DATE);

-- Grant access to the view
GRANT SELECT ON billing_dashboard TO authenticated;

-- Trigger to reset top-up conversations at month start
CREATE OR REPLACE FUNCTION reset_monthly_topups()
RETURNS TRIGGER AS $$
BEGIN
  -- Reset top-up conversations to 0 for all tenants on the first of each month
  IF EXTRACT(DAY FROM CURRENT_DATE) = 1 THEN
    UPDATE conversation_usage
    SET topup_conversations_remaining = 0,
        last_updated = NOW()
    WHERE billing_month = DATE_TRUNC('month', CURRENT_DATE);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a dummy table for the trigger (if it doesn't exist)
CREATE TABLE IF NOT EXISTS monthly_reset_trigger (
  id INTEGER PRIMARY KEY DEFAULT 1
);

-- Insert the trigger row if it doesn't exist
INSERT INTO monthly_reset_trigger (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Create the trigger
DROP TRIGGER IF EXISTS trigger_reset_monthly_topups ON monthly_reset_trigger;
CREATE TRIGGER trigger_reset_monthly_topups
  AFTER INSERT OR UPDATE ON monthly_reset_trigger
  FOR EACH ROW
  EXECUTE FUNCTION reset_monthly_topups();
