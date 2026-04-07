import { supabaseAdmin } from '../db/client';
import { PRICING, calculateOverageCost } from './pricing';
import { sendEmail } from '../ai/tools/send-email';
import { log } from '../monitoring/logger';

interface Tenant {
  id: string;
  owner_email: string;
  company_name: string;
  subscription_tier: string;
  monthly_conversation_limit: number;
  current_usage?: number;
}

interface UsageRecord {
  id: string;
  tenant_id: string;
  billing_month: string;
  conversation_count: number;
  topup_conversations_remaining: number;
  last_updated: string;
}

export async function trackConversation(conversationId: string) {
  try {
    // Get conversation details
    const { data: conversation, error: convError } = await supabaseAdmin
      .from('conversations')
      .select('*, tenant_id')
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) {
      log('error', 'Conversation not found for tracking', { conversationId });
      return null;
    }

    const billingMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format
    
    // Get or create usage record
    let usage: UsageRecord | null = null;
    const { data: existingUsage } = await supabaseAdmin
      .from('conversation_usage')
      .select('*')
      .eq('tenant_id', conversation.tenant_id)
      .eq('billing_month', billingMonth)
      .single();

    if (existingUsage) {
      usage = existingUsage;
    } else {
      // Create new usage record
      const { data: newUsage } = await supabaseAdmin
        .from('conversation_usage')
        .insert({
          tenant_id: conversation.tenant_id,
          billing_month: billingMonth,
          conversation_count: 0,
          topup_conversations_remaining: 0,
          last_updated: new Date().toISOString()
        })
        .select()
        .single();

      usage = newUsage;
    }

    if (!usage) {
      throw new Error('Failed to create or retrieve usage record');
    }

    // Increment count
    const newCount = usage.conversation_count + 1;
    
    await supabaseAdmin
      .from('conversation_usage')
      .update({
        conversation_count: newCount,
        last_updated: new Date().toISOString()
      })
      .eq('id', usage.id);

    // Get tenant details
    const tenant = await getTenant(conversation.tenant_id);
    const limit = tenant.monthly_conversation_limit;
    const topupRemaining = usage.topup_conversations_remaining || 0;

    // Check if exceeded limit
    const isOverLimit = newCount > limit;
    const hasTopupRemaining = topupRemaining > 0;

    // Log usage tracking
    log('info', 'Conversation tracked', {
      tenant_id: conversation.tenant_id,
      conversation_id: conversationId,
      new_count: newCount,
      limit,
      topup_remaining: topupRemaining,
      over_limit: isOverLimit
    });

    // Handle overage scenarios
    if (isOverLimit) {
      if (!hasTopupRemaining) {
        // First time exceeding without top-up - send alert
        const wasPreviouslyOverLimit = usage.conversation_count > limit;
        if (!wasPreviouslyOverLimit) {
          await notifyConversationLimitReached(tenant, newCount, limit);
        }
      } else {
        // Use top-up conversation
        await supabaseAdmin
          .from('conversation_usage')
          .update({
            topup_conversations_remaining: topupRemaining - 1
          })
          .eq('id', usage.id);

        log('info', 'Top-up conversation used', {
          tenant_id: conversation.tenant_id,
          remaining: topupRemaining - 1
        });
      }
    }

    // Update tenant's current usage
    await supabaseAdmin
      .from('tenants')
      .update({
        current_usage: newCount,
        usage_updated_at: new Date().toISOString()
      })
      .eq('id', conversation.tenant_id);

    // Check for approaching limit (80% threshold)
    const thresholdPercent = 0.8;
    if (newCount >= limit * thresholdPercent && newCount - 1 < limit * thresholdPercent) {
      await notifyApproachingLimit(tenant, newCount, limit);
    }

    return {
      usage: newCount,
      limit,
      exceeded: isOverLimit && !hasTopupRemaining,
      topupRemaining,
      percentUsed: (newCount / limit) * 100
    };
  } catch (error) {
    log('error', 'Failed to track conversation', { conversationId, error });
    throw error;
  }
}

async function notifyConversationLimitReached(tenant: Tenant, usage: number, limit: number) {
  try {
    const overageInfo = calculateOverageCost(usage, limit);
    
    await sendEmail({
      to: tenant.owner_email,
      template: 'conversation_limit_reached',
      data: {
        company_name: tenant.company_name,
        conversations_used: usage,
        limit: limit,
        overage: overageInfo.overage,
        recommended_topup: overageInfo.recommendedTopup,
        topup_cost: overageInfo.cost,
        dashboard_link: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`
      }
    });

    // Create in-app notification
    await supabaseAdmin
      .from('notifications')
      .insert({
        user_id: tenant.id, // Assuming owner is also a user
        type: 'usage_limit',
        title: 'Conversation Limit Reached',
        message: `You've used ${usage} of ${limit} conversations. Purchase a top-up to continue using the service.`,
        data: {
          usage,
          limit,
          overage: overageInfo.overage,
          recommended_topup: overageInfo.recommendedTopup
        },
        priority: 'high',
        read: false,
        created_at: new Date().toISOString()
      });

    log('info', 'Limit reached notification sent', {
      tenant_id: tenant.id,
      usage,
      limit,
      overage: overageInfo.overage
    });
  } catch (error) {
    log('error', 'Failed to send limit reached notification', { tenant_id: tenant.id, error });
  }
}

async function notifyApproachingLimit(tenant: Tenant, usage: number, limit: number) {
  try {
    await sendEmail({
      to: tenant.owner_email,
      template: 'conversation_approaching_limit',
      data: {
        company_name: tenant.company_name,
        conversations_used: usage,
        limit: limit,
        percent_used: Math.round((usage / limit) * 100),
        dashboard_link: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`
      }
    });

    log('info', 'Approaching limit notification sent', {
      tenant_id: tenant.id,
      usage,
      limit,
      percent_used: Math.round((usage / limit) * 100)
    });
  } catch (error) {
    log('error', 'Failed to send approaching limit notification', { tenant_id: tenant.id, error });
  }
}

export async function addTopUpConversations(
  tenantId: string,
  topupType: string,
  reference: string
) {
  try {
    const topup = PRICING.topups[topupType as keyof typeof PRICING.topups];
    if (!topup) {
      throw new Error(`Invalid topup type: ${topupType}`);
    }

    const billingMonth = new Date().toISOString().slice(0, 7);

    // Add conversations to current month
    const { data: usage } = await supabaseAdmin
      .from('conversation_usage')
      .select('topup_conversations_remaining')
      .eq('tenant_id', tenantId)
      .eq('billing_month', billingMonth)
      .single();

    const currentRemaining = usage?.topup_conversations_remaining || 0;
    const newRemaining = currentRemaining + topup.conversations;

    await supabaseAdmin
      .from('conversation_usage')
      .update({
        topup_conversations_remaining: newRemaining,
        last_updated: new Date().toISOString()
      })
      .eq('tenant_id', tenantId)
      .eq('billing_month', billingMonth);

    // Record top-up purchase
    await supabaseAdmin
      .from('topup_purchases')
      .insert({
        tenant_id: tenantId,
        topup_type: topupType,
        conversations: topup.conversations,
        amount_paid: topup.price,
        paystack_reference: reference,
        billing_month: billingMonth,
        purchased_at: new Date().toISOString()
      });

    // Send confirmation
    const tenant = await getTenant(tenantId);
    await sendEmail({
      to: tenant.owner_email,
      template: 'topup_confirmed',
      data: {
        company_name: tenant.company_name,
        conversations: topup.conversations,
        amount: topup.price,
        total_remaining: newRemaining,
        dashboard_link: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`
      }
    });

    log('info', 'Top-up conversations added', {
      tenant_id: tenantId,
      topup_type: topupType,
      conversations: topup.conversations,
      total_remaining: newRemaining
    });

    return newRemaining;
  } catch (error) {
    log('error', 'Failed to add top-up conversations', { tenant_id: tenantId, topupType, error });
    throw error;
  }
}

export async function getUsageReport(tenantId: string, months: number = 12) {
  try {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const { data, error } = await supabaseAdmin
      .from('conversation_usage')
      .select('*')
      .eq('tenant_id', tenantId)
      .gte('billing_month', startDate.toISOString().slice(0, 7))
      .order('billing_month', { ascending: false });

    if (error) throw error;

    const tenant = await getTenant(tenantId);
    const report = {
      tenant_id: tenantId,
      current_tier: tenant.subscription_tier,
      monthly_limit: tenant.monthly_conversation_limit,
      months: data || [],
      total_conversations: (data || []).reduce((sum, month) => sum + month.conversation_count, 0),
      total_topups: (data || []).reduce((sum, month) => sum + (month.topup_conversations_purchased || 0), 0),
      average_usage: 0,
      projected_usage: 0
    };

    if (data && data.length > 0) {
      report.average_usage = Math.round(report.total_conversations / data.length);
      
      // Project current month usage
      const currentMonth = data.find(m => m.billing_month === new Date().toISOString().slice(0, 7));
      if (currentMonth) {
        const daysInMonth = new Date().getDate();
        const daysPassed = new Date().getDate();
        const dailyAverage = currentMonth.conversation_count / daysPassed;
        report.projected_usage = Math.round(dailyAverage * daysInMonth);
      }
    }

    return report;
  } catch (error) {
    log('error', 'Failed to generate usage report', { tenant_id: tenantId, error });
    throw error;
  }
}

export async function resetMonthlyUsage(tenantId: string) {
  try {
    const billingMonth = new Date().toISOString().slice(0, 7);
    
    // Reset top-up conversations at the start of new month
    await supabaseAdmin
      .from('conversation_usage')
      .update({
        conversation_count: 0,
        topup_conversations_remaining: 0,
        last_updated: new Date().toISOString()
      })
      .eq('tenant_id', tenantId)
      .eq('billing_month', billingMonth);

    // Reset tenant current usage
    await supabaseAdmin
      .from('tenants')
      .update({
        current_usage: 0,
        usage_updated_at: new Date().toISOString()
      })
      .eq('id', tenantId);

    log('info', 'Monthly usage reset', { tenant_id: tenantId, billing_month: billingMonth });
  } catch (error) {
    log('error', 'Failed to reset monthly usage', { tenant_id: tenantId, error });
    throw error;
  }
}

// Helper function to get tenant
async function getTenant(tenantId: string): Promise<Tenant> {
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('*')
    .eq('id', tenantId)
    .single();

  if (error || !data) {
    throw new Error('Tenant not found');
  }

  return data;
}

// Cron job to check and reset usage at month start
export async function handleMonthlyRollover() {
  try {
    const firstDayOfMonth = new Date();
    firstDayOfMonth.setDate(1);
    
    const { data: tenants } = await supabaseAdmin
      .from('tenants')
      .select('id')
      .eq('subscription_status', 'active');

    if (tenants) {
      for (const tenant of tenants) {
        await resetMonthlyUsage(tenant.id);
      }
      
      log('info', 'Monthly rollover completed', { tenants_processed: tenants.length });
    }
  } catch (error) {
    log('error', 'Failed to handle monthly rollover', { error });
    throw error;
  }
}
