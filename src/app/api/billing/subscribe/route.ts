import { NextRequest, NextResponse } from 'next/server';
import { initializePaystackTransaction } from '@/lib/billing/paystack';
import { getSessionUser } from '@/lib/supabase-server';

// Paystack subscription flow:
// 1. Initialize a transaction to collect card details (this route)
// 2. Customer pays via Paystack hosted page
// 3. Paystack webhook (charge.success) activates the subscription
// We removed the setup_fee_paid gate — fee is $0 so it was blocking everyone.

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

    const { tenantId } = sessionUser;

    // Initialize Paystack transaction (redirects user to Paystack checkout)
    const transaction = await initializePaystackTransaction(tenantId, tier);

    return NextResponse.json({
      success: true,
      authorization_url: transaction.authorization_url,
      reference: transaction.reference,
    });
  } catch (error) {
    console.error('[Billing] Subscribe error:', error);
    return NextResponse.json({ error: 'Failed to initialize subscription' }, { status: 500 });
  }
}
