-- Add CRM/Zapier webhook URL column to tenants table
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS crm_webhook_url TEXT;
