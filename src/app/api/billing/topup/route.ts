import { NextRequest, NextResponse } from 'next/server';

// Top-ups now run through Whop one-time checkout links (WHOP_PLAN_TOPUP_*
// env vars). Paystack's purchaseTopUp() in lib/billing/paystack.ts is kept
// as a backup only — not called from here anymore.
import { getCheckoutUrlForTopup } from '@/lib/billing/whop';
import { supabaseAdmin } from '@/lib/db/client';
import { getSessionUser } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { topup_type } = await request.json();

    if (!topup_type || !['small', 'medium', 'large'].includes(topup_type)) {
      return NextResponse.json(
        { error: 'Invalid top-up type specified' },
        { status: 400 }
      );
    }

    const { tenantId } = sessionUser;

    // Check if tenant has active subscription
    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .select('subscription_status, setup_fee_paid')
      .eq('id', tenantId)
      .single<{ subscription_status: string; setup_fee_paid: boolean }>();

    if (tenantError || !tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    if (!tenant.setup_fee_paid) {
      return NextResponse.json(
        { error: 'Setup fee must be paid before purchasing top-ups' },
        { status: 402 }
      );
    }

    if (tenant.subscription_status !== 'active') {
      return NextResponse.json(
        { error: 'Active subscription required to purchase top-ups' },
        { status: 402 }
      );
    }

    // Resolve the Whop one-time checkout link for this top-up tier
    const checkoutUrl = await getCheckoutUrlForTopup(topup_type);

    // Field is named authorization_url for backwards compatibility with
    // the existing dashboard billing page, which redirects to whatever
    // this returns regardless of processor.
    return NextResponse.json({
      success: true,
      authorization_url: checkoutUrl,
    });
  } catch (error) {
    console.error('Error purchasing top-up:', error);
    return NextResponse.json(
      { error: 'Failed to purchase top-up' },
      { status: 500 }
    );
  }
}
