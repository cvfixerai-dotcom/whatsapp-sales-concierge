// ─────────────────────────────────────────────────────────────────────────
// BACKUP / INACTIVE — Paystack is no longer the live payment processor.
// Whop (./whop.ts) handles subscriptions now. This file is kept in the
// repo on purpose as a fallback in case Whop needs to be swapped out
// later — do not delete it, but do not wire new code into it either.
// Functions here are only still called from:
//   - /api/billing/usage (read-only: getPaymentHistory, just queries the
//     `payments` table, doesn't hit the Paystack API)
// The money-moving functions (createSubscription, purchaseTopUp,
// chargeSetupFee, initializePaystackTransaction) are disconnected from
// any live route as of the Whop migration.
// ─────────────────────────────────────────────────────────────────────────
import axios from 'axios';
import { supabaseAdmin } from '../db/client';
import { PRICING, getPriceForTier, getConversationsForTier } from './pricing';
import { sendEmail } from '../ai/tools/send-email';
import { log } from '../monitoring/logger';

const paystackClient = axios.create({
  baseURL: 'https://api.paystack.co',
  headers: {
    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
    'Content-Type': 'application/json',
  },
});

interface Tenant {
  id: string;
  owner_email: string;
  company_name: string;
  phone_number?: string;
  paystack_customer_code?: string;
  paystack_customer_id?: string;
  subscription_tier?: string;
  subscription_status?: string;
  monthly_conversation_limit?: number;
}

export async function createPaystackCustomer(tenant: Tenant) {
  try {
    const response = await paystackClient.post('/customer', {
      email: tenant.owner_email,
      first_name: tenant.company_name.split(' ')[0],
      last_name: tenant.company_name.split(' ').slice(1).join(' ') || 'Company',
      phone: tenant.phone_number,
      metadata: {
        tenant_id: tenant.id,
        company_name: tenant.company_name
      }
    });
    
    await supabaseAdmin
      .from('tenants')
      .update({
        paystack_customer_code: response.data.data.customer_code,
        paystack_customer_id: response.data.data.id
      })
      .eq('id', tenant.id);
    
    log('info', 'Paystack customer created', { 
      tenant_id: tenant.id,
      customer_code: response.data.data.customer_code 
    });
    
    return response.data.data;
  } catch (error) {
    log('error', 'Failed to create Paystack customer', { tenant_id: tenant.id, error });
    throw error;
  }
}

export async function createSubscription(
  tenantId: string,
  tier: string
) {
  try {
    const tenant = await getTenant(tenantId);
    
    if (!tenant.paystack_customer_code) {
      await createPaystackCustomer(tenant);
    }
    
    // Paystack subscription plan codes
    const planCodes = {
      starter: process.env.PAYSTACK_PLAN_STARTER,
      growth: process.env.PAYSTACK_PLAN_GROWTH,
      scale: process.env.PAYSTACK_PLAN_SCALE
    };
    
    if (!planCodes[tier as keyof typeof planCodes]) {
      throw new Error(`No plan code configured for tier: ${tier}`);
    }
    
    const response = await paystackClient.post('/subscription', {
      customer: tenant.paystack_customer_code || (await createPaystackCustomer(tenant)).customer_code,
      plan: planCodes[tier as keyof typeof planCodes],
      start_date: new Date().toISOString()
    });
    
    await supabaseAdmin
      .from('tenants')
      .update({
        subscription_tier: tier,
        subscription_status: 'active',
        paystack_subscription_code: response.data.data.subscription_code,
        monthly_conversation_limit: getConversationsForTier(tier),
        subscription_updated_at: new Date().toISOString()
      })
      .eq('id', tenantId);
    
    log('info', 'Subscription created', { 
      tenant_id: tenantId, 
      tier,
      subscription_code: response.data.data.subscription_code 
    });
    
    return response.data.data;
  } catch (error) {
    log('error', 'Failed to create subscription', { tenant_id: tenantId, tier, error });
    throw error;
  }
}

export async function chargeSetupFee(tenantId: string) {
  try {
    const tenant = await getTenant(tenantId);
    
    const response = await paystackClient.post('/transaction/initialize', {
      email: tenant.owner_email,
      amount: PRICING.setup_fee * 100, // Convert to cents
      currency: 'USD',
      reference: `setup-${tenantId}-${Date.now()}`,
      callback_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing/callback`,
      metadata: {
        tenant_id: tenantId,
        type: 'setup_fee',
        description: 'One-time setup fee'
      }
    });
    
    log('info', 'Setup fee payment initialized', { 
      tenant_id: tenantId, 
      amount: PRICING.setup_fee,
      reference: response.data.data.reference 
    });
    
    return response.data.data;
  } catch (error) {
    log('error', 'Failed to initialize setup fee', { tenant_id: tenantId, error });
    throw error;
  }
}

export async function purchaseTopUp(
  tenantId: string,
  topupType: 'small' | 'medium' | 'large'
) {
  try {
    const tenant = await getTenant(tenantId);
    const topup = PRICING.topups[topupType];
    
    const response = await paystackClient.post('/transaction/initialize', {
      email: tenant.owner_email,
      amount: topup.price * 100, // Convert to cents
      currency: 'USD',
      reference: `topup-${tenantId}-${Date.now()}`,
      callback_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing/callback`,
      metadata: {
        tenant_id: tenantId,
        type: 'topup',
        topup_type: topupType,
        conversations: topup.conversations,
        description: `${topup.name} - ${topup.conversations} conversations` 
      }
    });
    
    log('info', 'Top-up purchase initialized', { 
      tenant_id: tenantId, 
      topup_type: topupType,
      amount: topup.price,
      reference: response.data.data.reference 
    });
    
    return response.data.data;
  } catch (error) {
    log('error', 'Failed to initialize top-up purchase', { tenant_id: tenantId, topupType, error });
    throw error;
  }
}

export async function verifyTransaction(reference: string) {
  try {
    const response = await paystackClient.get(`/transaction/verify/${reference}`);
    return response.data.data;
  } catch (error) {
    log('error', 'Failed to verify transaction', { reference, error });
    throw error;
  }
}

export async function cancelSubscription(tenantId: string) {
  try {
    const tenant = await getTenant(tenantId);
    
// @ts-ignore
    if (!tenant.paystack_subscription_code) {
      throw new Error('No active subscription found');
    }
    
    const response = await paystackClient.post('/subscription/disable', {
// @ts-ignore
      code: tenant.paystack_subscription_code,
      token: process.env.PAYSTACK_SECRET_KEY
    });
    
    await supabaseAdmin
      .from('tenants')
      .update({
        subscription_status: 'cancelled',
        subscription_cancelled_at: new Date().toISOString()
      })
      .eq('id', tenantId);
    
    log('info', 'Subscription cancelled', { 
      tenant_id: tenantId,
// @ts-ignore
      subscription_code: tenant.paystack_subscription_code 
    });
    
    return response.data;
  } catch (error) {
    log('error', 'Failed to cancel subscription', { tenant_id: tenantId, error });
    throw error;
  }
}

export async function updateSubscription(
  tenantId: string,
  newTier: string
) {
  try {
    const tenant = await getTenant(tenantId);
    
    // Cancel current subscription
// @ts-ignore
    if (tenant.paystack_subscription_code) {
      await cancelSubscription(tenantId);
    }
    
    // Create new subscription
    await createSubscription(tenantId, newTier);
    
    log('info', 'Subscription updated', { 
      tenant_id: tenantId,
      old_tier: tenant.subscription_tier,
      new_tier: newTier
    });
  } catch (error) {
    log('error', 'Failed to update subscription', { tenant_id: tenantId, newTier, error });
    throw error;
  }
}

export async function getPaymentHistory(tenantId: string, limit: number = 50) {
  try {
    const { data, error } = await supabaseAdmin
      .from('payments')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('paid_at', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    
    return data || [];
  } catch (error) {
    log('error', 'Failed to fetch payment history', { tenant_id: tenantId, error });
    throw error;
  }
}

export async function createInvoice(
  tenantId: string,
  amount: number,
  description: string,
  dueDate?: Date
) {
  try {
    const tenant = await getTenant(tenantId);
    
    const response = await paystackClient.post('/paymentrequest', {
      customer: tenant.paystack_customer_code,
      amount: amount * 100, // Convert to cents,
      due_date: dueDate ? dueDate.toISOString() : undefined,
      description,
      currency: 'USD',
      metadata: {
        tenant_id: tenantId
      }
    });
    
    // Record invoice
    await supabaseAdmin
      .from('invoices')
      .insert({
        tenant_id: tenantId,
        paystack_request_code: response.data.data.request_code,
        amount,
        description,
        due_date: dueDate,
        status: 'pending',
        created_at: new Date().toISOString()
      });
    
    log('info', 'Invoice created', { 
      tenant_id: tenantId,
      amount,
      request_code: response.data.data.request_code 
    });
    
    return response.data.data;
  } catch (error) {
    log('error', 'Failed to create invoice', { tenant_id: tenantId, amount, error });
    throw error;
  }
}

// Helper to verify webhook signature
export function verifyPaystackWebhook(signature: string, body: string): boolean {
  const crypto = require('crypto');
  const hash = crypto
    .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY!)
    .update(body)
    .digest('hex');
  
  return hash === signature;
}

// Helper function to get tenant with owner email resolved from users table.
// The tenants table now has owner_email as a column (added in migration),
// but we also do a live JOIN as a fallback in case it's not yet populated.
async function getTenant(tenantId: string): Promise<Tenant> {
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('*')
    .eq('id', tenantId)
    .single();

  if (error || !data) {
    throw new Error('Tenant not found');
  }

  // Resolve owner_email: use stored value or look up from users table
  if (!data.owner_email) {
    const { data: owner } = await supabaseAdmin
      .from('users')
      .select('email')
      .eq('tenant_id', tenantId)
      .eq('role', 'owner')
      .maybeSingle();

    if (owner?.email) {
      // Cache it for next time
      await supabaseAdmin
        .from('tenants')
        .update({ owner_email: owner.email })
        .eq('id', tenantId);
      data.owner_email = owner.email;
    }
  }

  return data;
}

/**
 * Initialize a Paystack transaction for a subscription tier.
 * The customer completes payment on Paystack's hosted page.
 * On success, the charge.success webhook activates their subscription.
 */
export async function initializePaystackTransaction(tenantId: string, tier: string) {
  try {
    const tenant = await getTenant(tenantId);
    const price = getPriceForTier(tier);

    const response = await paystackClient.post('/transaction/initialize', {
      email: tenant.owner_email,
      amount: price * 100, // Paystack uses kobo/cents
      currency: 'USD',
      reference: `sub-${tier}-${tenantId}-${Date.now()}`,
      callback_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing/callback`,
      metadata: {
        tenant_id: tenantId,
        type: 'subscription',
        tier,
        description: `${tier} plan — ${getConversationsForTier(tier)} conversations/month`,
      },
    });

    log('info', 'Subscription transaction initialized', {
      tenant_id: tenantId,
      tier,
      amount: price,
      reference: response.data.data.reference,
    });

    return response.data.data;
  } catch (error) {
    log('error', 'Failed to initialize subscription transaction', { tenantId, tier, error });
    throw error;
  }
}

// Export customer data for GDPR compliance
export async function exportCustomerData(tenantId: string) {
  try {
    const tenant = await getTenant(tenantId);
    
    const [payments, usage, invoices] = await Promise.all([
      getPaymentHistory(tenantId),
      supabaseAdmin
        .from('conversation_usage')
        .select('*')
        .eq('tenant_id', tenantId),
      supabaseAdmin
        .from('invoices')
        .select('*')
        .eq('tenant_id', tenantId)
    ]);
    
    const customerData = {
      tenant,
      payments,
      usage,
      invoices,
      exported_at: new Date().toISOString()
    };
    
    log('info', 'Customer data exported', { tenant_id: tenantId });
    
    return customerData;
  } catch (error) {
    log('error', 'Failed to export customer data', { tenant_id: tenantId, error });
    throw error;
  }
}
