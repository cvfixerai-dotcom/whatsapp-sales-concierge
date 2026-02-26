-- Add owner_id to tenants table
-- Links a tenant to the Supabase Auth user who created it.
-- This enables proper RLS policies using auth.uid().

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Index for fast owner lookups
CREATE INDEX IF NOT EXISTS idx_tenants_owner_id ON tenants(owner_id);

-- Drop the old tenant RLS policy that relied on the users join
DROP POLICY IF EXISTS "Tenant access" ON tenants;

-- INSERT: any authenticated user can create a tenant for themselves
CREATE POLICY "Tenants: authenticated insert"
  ON tenants
  FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

-- SELECT: owner can read their own tenant,
--         OR any user in the tenant's users table (team members)
CREATE POLICY "Tenants: owner or member select"
  ON tenants
  FOR SELECT
  TO authenticated
  USING (
    owner_id = auth.uid()
    OR id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid()
    )
  );

-- UPDATE: only the owner or a member can update
CREATE POLICY "Tenants: owner or member update"
  ON tenants
  FOR UPDATE
  TO authenticated
  USING (
    owner_id = auth.uid()
    OR id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    owner_id = auth.uid()
    OR id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid()
    )
  );

-- DELETE: only the owner can delete their tenant
CREATE POLICY "Tenants: owner delete"
  ON tenants
  FOR DELETE
  TO authenticated
  USING (owner_id = auth.uid());
