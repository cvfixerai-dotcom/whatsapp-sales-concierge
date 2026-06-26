import { NextRequest, NextResponse } from 'next/server';
import { getCheckoutUrlForTier } from '@/lib/billing/whop';
import { getSessionUser } from '@/lib/supabase-server';

// Whop subscription flow (active processor):
// 1. Look up the pre-existing Whop plan's hosted checkout URL (this route)
// 2. Customer pays on Whop's hosted checkout page
// 3. Whop webhook (payment.succeeded / membership.activated) activates the subscription
//
// Paystack remains in the codebase (lib/billing/paystack.ts) but is no
// longer called from this route.

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser();

    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { tier } = await request.json();

    if (!tier || !['starter', 'growth', 'scale'].includes(tier)) {
      return NextResponse.json({ error: 'Invalid tier specified' }, { status: 400 });
    }

    const checkoutUrl = await getCheckoutUrlForTier(tier);

    return NextResponse.json({
      success: true,
      checkout_url: checkoutUrl,
    });
  } catch (error) {
    console.error('[Billing] Subscribe error:', error);
    return NextResponse.json({ error: 'Failed to initialize subscription' }, { status: 500 });
  }
}
