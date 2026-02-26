import { NextRequest, NextResponse } from 'next/server';


import { createSubscription } from '@/lib/billing/paystack';
import { supabaseAdmin } from '@/lib/db/client';
import { getSessionUser } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { tier } = await request.json();

    if (!tier || !['starter', 'growth', 'scale'].includes(tier)) {
      return NextResponse.json(
        { error: 'Invalid tier specified' },
        { status: 400 }
      );
    }

    const { tenantId } = sessionUser;

    // Check if tenant has paid setup fee
    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .select('setup_fee_paid')
      .eq('id', tenantId)
      .single<{ setup_fee_paid: boolean }>();

    if (tenantError || !tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    if (!tenant.setup_fee_paid) {
      return NextResponse.json(
        { error: 'Setup fee must be paid before subscribing' },
        { status: 402 }
      );
    }

    // Create subscription
    const subscription = await createSubscription(tenantId, tier);

    return NextResponse.json({
      success: true,
      authorization_url: subscription.authorization_url,
      reference: subscription.reference
    });
  } catch (error) {
    console.error('Error creating subscription:', error);
    return NextResponse.json(
      { error: 'Failed to create subscription' },
      { status: 500 }
    );
  }
}
