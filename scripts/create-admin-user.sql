-- ================================================================
-- ADMIN USER SETUP — Run in Supabase SQL Editor
-- Gives you admin access to /dashboard/outreach
-- ================================================================

-- OPTION A: If you ALREADY have a user (lordskempo@yahoo.com), just update the role:
UPDATE users SET role = 'admin' WHERE email = 'lordskempo@yahoo.com';

-- OPTION B: If you need to CREATE a new admin user from scratch:
-- First get your tenant ID:
-- SELECT id FROM tenants WHERE twilio_whatsapp_number = '+14099083940';

-- Then create the admin user (replace <TENANT_ID>):
-- Password: FixerAdmin2026! (bcrypt hash below)
-- Generate your own hash at https://bcrypt-generator.com if you want a different password

-- INSERT INTO users (tenant_id, email, password_hash, role, full_name, is_active)
-- VALUES (
--   '<TENANT_ID>',
--   'lordskempo@yahoo.com',
--   '$2a$10$rOzBqBHwDGvMlP8GpCsQ4OQfMCiiMbwP3BXVkO2ZPBqGBv5v1J3lW',
--   'admin',
--   'FixerAI Admin',
--   true
-- );

-- VERIFY: Check your user has admin role
SELECT id, email, role, full_name FROM users WHERE email = 'lordskempo@yahoo.com';
