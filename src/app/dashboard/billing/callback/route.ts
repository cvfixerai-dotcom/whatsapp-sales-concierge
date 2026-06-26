// ─────────────────────────────────────────────────────────────────────────
// BACKUP / DORMANT — this is the return URL for Paystack's hosted checkout
// page. Since subscribe/topup no longer initialize Paystack transactions,
// nothing redirects here anymore (Whop's checkout is fully hosted on
// whop.com and confirms via webhook, not a callback redirect). Left intact
// in case Paystack is reactivated.
// ─────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server';
import { verifyTransaction } from '@/lib/billing/paystack';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const reference = searchParams.get('reference');

    if (!reference) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?error=missing_reference`);
    }

    // Verify the transaction
    const transaction = await verifyTransaction(reference);

    if (transaction.status === 'success') {
      const type = transaction.metadata?.type;
      
      // Redirect to appropriate success page
      let redirectUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`;
      
      if (type === 'setup_fee') {
        redirectUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?success=setup_fee`;
      } else if (type === 'topup') {
        redirectUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?success=topup&conversations=${transaction.metadata?.conversations}`;
      } else if (type === 'subscription') {
        redirectUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?success=subscription`;
      }

      return NextResponse.redirect(redirectUrl);
    } else {
      // Payment failed
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?error=payment_failed&reference=${reference}`
      );
    }
  } catch (error) {
    console.error('Error in payment callback:', error);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?error=verification_failed`
    );
  }
}
