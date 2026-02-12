-- Add WhatsApp template messages column to tenants table
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS whatsapp_templates JSONB DEFAULT '{}';
