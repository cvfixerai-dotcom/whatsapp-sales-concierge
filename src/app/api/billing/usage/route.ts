import { NextRequest, NextResponse } from 'next/server';


import { supabaseAdmin } from '@/lib/db/client';
import { getSessionUser } from '@/lib/supabase-server';
import { getPaymentHistory } from '@/lib/billing/paystack';
import { getUsageReport } from '@/lib/billing/usage-tracker';

export async function GET(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { tenantId } = sessionUser;

    // Get tenant details
    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .single<{
        subscription_tier: string;
        subscription_status: string;
        monthly_conversation_limit: number;
        setup_fee_paid: boolean;
        next_billing_date: string | null;
      }>();

    if (tenantError || !tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // Get current month usage
    const billingMonth = new Date().toISOString().slice(0, 7);
    const { data: usage, error: usageError } = await supabaseAdmin
      .from('conversation_usage')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('billing_month', billingMonth)
      .single<{ conversation_count: number; topup_conversations_remaining: number }>();

    // Get payment history
    const payments = await getPaymentHistory(tenantId);

    // Calculate days in month and current day
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const currentDay = now.getDate();

    // Get month start date
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const response = {
      subscription_tier: tenant.subscription_tier || 'trial',
      subscription_status: tenant.subscription_status || 'trial',
      conversation_count: usage?.conversation_count || 0,
      monthly_conversation_limit: tenant.monthly_conversation_limit || 25,
      topup_conversations_remaining: usage?.topup_conversations_remaining || 0,
      payments,
      current_month_start: monthStart,
      days_in_month: daysInMonth,
      current_day: currentDay,
      setup_fee_paid: tenant.setup_fee_paid || false,
      next_billing_date: tenant.next_billing_date,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching usage data:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
