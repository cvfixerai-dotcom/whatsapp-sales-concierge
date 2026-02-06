import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { purchaseTopUp } from '@/lib/billing/paystack';
import { supabaseAdmin } from '@/lib/db/client';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { topup_type } = await request.json();

    if (!topup_type || !['small', 'medium', 'large'].includes(topup_type)) {
      return NextResponse.json(
        { error: 'Invalid top-up type specified' },
        { status: 400 }
      );
    }

    const tenantId = session.user.tenantId;

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

    // Initialize top-up purchase
    const topup = await purchaseTopUp(tenantId, topup_type);

    return NextResponse.json({
      success: true,
      authorization_url: topup.authorization_url,
      reference: topup.reference
    });
  } catch (error) {
    console.error('Error purchasing top-up:', error);
    return NextResponse.json(
      { error: 'Failed to purchase top-up' },
      { status: 500 }
    );
  }
}
