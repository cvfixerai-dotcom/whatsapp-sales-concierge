/**
 * Tenant Provisioning Service
 *
 * Shared logic for turning a freshly-created Supabase auth user into a
 * working tenant: creates the `tenants` row, the `public.users` row,
 * default calendar/business-hours records, and a default agent config.
 *
 * Used by both:
 *  - /api/auth/signup (email/password signup)
 *  - /auth/callback (Google OAuth signup/login — first-time users only)
 *
 * Pulled out of the signup route so both paths provision a tenant the
 * same way instead of duplicating (and inevitably drifting on) the logic.
 */

import { supabaseAdmin } from '@/lib/db/client';
import { initializeTenantDefaults, applyIndustryAgent } from '@/lib/services/tenant-initializer';

export interface ProvisionTenantInput {
  authUserId: string;
  email: string;
  fullName: string;
  companyName: string;
}

export interface ProvisionTenantResult {
  tenantId: string;
}

/**
 * Returns the tenant_id for an existing auth user if one has already been
 * provisioned (e.g. a returning Google OAuth user), or null if this is a
 * first-time sign-in that still needs provisioning.
 */
export async function findExistingTenantId(authUserId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('users')
    .select('tenant_id')
    .eq('id', authUserId)
    .maybeSingle();
  return data?.tenant_id ?? null;
}

/**
 * Creates tenants + users rows and seeds tenant defaults for a brand new
 * auth user. Throws on failure; callers are responsible for any auth-user
 * cleanup they want on error (signup route deletes the auth user; the
 * OAuth callback leaves it since the user already has a verified session).
 */
export async function provisionTenantForUser(
  input: ProvisionTenantInput
): Promise<ProvisionTenantResult> {
  const { authUserId, email, fullName, companyName } = input;
  const normalizedEmail = email.toLowerCase().trim();

  const trialStart = new Date();
  const trialEnd = new Date(trialStart);
  trialEnd.setDate(trialEnd.getDate() + 7);

  const { data: tenant, error: tenantError } = await supabaseAdmin
    .from('tenants')
    .insert({
      company_name: companyName.trim() || 'My Business',
      owner_id: authUserId,
      subscription_tier: 'trial',
      subscription_status: 'trial',
      trial_start_date: trialStart.toISOString(),
      trial_end_date: trialEnd.toISOString(),
      trial_conversation_limit: 25,
      monthly_conversation_limit: 25,
      ai_provider: 'anthropic',
      ai_model: 'claude-sonnet-4-6',
      business_hours: {},
      setup_completed: false,
    })
    .select('id')
    .single();

  if (tenantError || !tenant) {
    throw new Error(tenantError?.message ?? 'Failed to create tenant');
  }

  const { error: userError } = await supabaseAdmin
    .from('users')
    .insert({
      id: authUserId,
      tenant_id: tenant.id,
      email: normalizedEmail,
      password_hash: '',
      full_name: fullName.trim() || normalizedEmail.split('@')[0],
      role: 'owner',
      is_active: true,
    });

  if (userError) {
    await supabaseAdmin.from('tenants').delete().eq('id', tenant.id);
    throw new Error('Failed to create user record');
  }

  try {
    await initializeTenantDefaults(tenant.id, {
      timezone: 'UTC', // Will be updated during onboarding
      industry: 'other', // Will be updated during onboarding
    });
  } catch (error) {
    console.error('[ProvisionTenant] Failed to initialize tenant defaults:', error);
    // Non-fatal - tenant can still complete onboarding
  }

  try {
    await applyIndustryAgent(tenant.id, 'other');
  } catch (error) {
    console.error('[ProvisionTenant] Failed to apply default industry agent:', error);
    // Non-fatal - agent.ts falls back to the static prompts.ts default
  }

  console.log(`[ProvisionTenant] Created: auth=${authUserId} tenant=${tenant.id} email=${normalizedEmail}`);
  return { tenantId: tenant.id };
}
