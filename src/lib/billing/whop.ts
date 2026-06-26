import { Whop } from '@whop/sdk';
import { supabaseAdmin } from '../db/client';
import { getConversationsForTier } from './pricing';
import { log } from '../monitoring/logger';

// ─────────────────────────────────────────────────────────────────────────
// Whop is the ACTIVE recurring-payment processor. Paystack code in
// ./paystack.ts is kept in the repo but is no longer wired into the
// subscribe/webhook routes — do not delete it, it may be reactivated later.
// ─────────────────────────────────────────────────────────────────────────

let _client: Whop | null = null;

export function getWhopClient(): Whop {
  if (!_client) {
    _client = new Whop({
      apiKey: process.env.WHOP_API_KEY,
      webhookKey: process.env.WHOP_WEBHOOK_SECRET || null,
      appID: process.env.NEXT_PUBLIC_WHOP_APP_ID || null,
    });
  }
  return _client;
}

// Tier -> Whop plan ID, sourced from the plans created manually in the
// Whop dashboard (company "FixerAI Technologies").
export const WHOP_TIER_PLAN_IDS: Record<string, string | undefined> = {
  starter: process.env.WHOP_PLAN_STARTER,
  growth: process.env.WHOP_PLAN_GROWTH,
  scale: process.env.WHOP_PLAN_SCALE,
};

// Reverse lookup used by the webhook handler to figure out which tier a
// given plan_id corresponds to.
export function getTierForPlanId(planId: string | null | undefined): string | null {
  if (!planId) return null;
  for (const [tier, id] of Object.entries(WHOP_TIER_PLAN_IDS)) {
    if (id && id === planId) return tier;
  }
  return null;
}

/**
 * Resolve the checkout (purchase) URL for a given pricing tier by looking
 * up the pre-existing Whop plan. The customer is redirected here, completes
 * payment on Whop's hosted checkout, and the membership/payment webhooks
 * activate their subscription afterward.
 */
export async function getCheckoutUrlForTier(tier: string): Promise<string> {
  const planId = WHOP_TIER_PLAN_IDS[tier];
  if (!planId) {
    throw new Error(`No Whop plan configured for tier: ${tier}`);
  }

  try {
    const client = getWhopClient();
    const plan = await client.plans.retrieve(planId);
    if (plan?.purchase_url) {
      return plan.purchase_url;
    }
    // Fallback if the SDK response is ever missing purchase_url
    return `https://whop.com/checkout/${planId}/`;
  } catch (error) {
    log('error', 'Failed to retrieve Whop plan, falling back to direct URL', { tier, planId, error });
    return `https://whop.com/checkout/${planId}/`;
  }
}

/**
 * Verify and unwrap an incoming Whop webhook using the Standard Webhooks
 * signature scheme. Throws if the signature is invalid.
 */
export function verifyAndUnwrapWhopWebhook(body: string, headers: Record<string, string>) {
  const client = getWhopClient();
  return client.webhooks.unwrap(body, { headers });
}

/**
 * Find the tenant that a Whop webhook event belongs to. We have no
 * metadata field on these dashboard-created checkout links, so we
 * correlate by the payer's email matching tenants.owner_email.
 */
export async function getTenantByEmail(email: string | null | undefined) {
  if (!email) return null;

  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('*')
    .ilike('owner_email', email)
    .maybeSingle();

  if (error) {
    log('error', 'Failed to look up tenant by email for Whop webhook', { email, error });
    return null;
  }

  return data;
}

/**
 * Activate a tenant's subscription after a successful Whop payment/membership event.
 */
export async function activateWhopSubscription(params: {
  tenantId: string;
  tier: string;
  membershipId?: string | null;
  planId?: string | null;
  customerId?: string | null;
}) {
  const { tenantId, tier, membershipId, planId, customerId } = params;

  await supabaseAdmin
    .from('tenants')
    .update({
      subscription_status: 'active',
      subscription_tier: tier,
      monthly_conversation_limit: getConversationsForTier(tier),
      subscription_updated_at: new Date().toISOString(),
      ...(membershipId ? { whop_membership_id: membershipId } : {}),
      ...(planId ? { whop_plan_id: planId } : {}),
      ...(customerId ? { whop_customer_id: customerId } : {}),
    })
    .eq('id', tenantId);

  log('info', 'Whop subscription activated', { tenantId, tier, membershipId });
}

export async function deactivateWhopSubscription(tenantId: string) {
  await supabaseAdmin
    .from('tenants')
    .update({
      subscription_status: 'cancelled',
      subscription_cancelled_at: new Date().toISOString(),
    })
    .eq('id', tenantId);

  log('info', 'Whop subscription deactivated', { tenantId });
}
