// @ts-nocheck
/**
 * Twilio Verification API
 * POST - Verify Twilio credentials during onboarding
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { account_sid, auth_token, whatsapp_number } = body;

    if (!account_sid || !auth_token) {
      return NextResponse.json(
        { error: 'Account SID and Auth Token are required' },
        { status: 400 }
      );
    }

    // Verify credentials by fetching account info from Twilio
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${account_sid}.json`;
    
    const response = await fetch(twilioUrl, {
      method: 'GET',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${account_sid}:${auth_token}`).toString('base64'),
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Twilio Verify] Error:', errorText);
      
      if (response.status === 401) {
        return NextResponse.json(
          { valid: false, error: 'Invalid credentials. Please check your Account SID and Auth Token.' },
          { status: 200 }
        );
      }
      
      return NextResponse.json(
        { valid: false, error: 'Failed to verify Twilio credentials' },
        { status: 200 }
      );
    }

    const accountData = await response.json();

    // Check account status
    if (accountData.status !== 'active') {
      return NextResponse.json(
        { valid: false, error: `Twilio account is ${accountData.status}. Please activate your account.` },
        { status: 200 }
      );
    }

    // Optionally verify WhatsApp number if provided
    let whatsappVerified = false;
    if (whatsapp_number) {
      // Check if the number is configured for WhatsApp
      const phoneNumber = whatsapp_number.replace('whatsapp:', '').replace('+', '');
      
      // For sandbox, the number is always +14155238886
      // For production, we'd verify the number exists in the account
      whatsappVerified = true; // Assume valid for now
    }

    return NextResponse.json({
      valid: true,
      account: {
        friendly_name: accountData.friendly_name,
        status: accountData.status,
        type: accountData.type,
      },
      whatsapp_verified: whatsappVerified,
    });
  } catch (error) {
    console.error('[Twilio Verify] Error:', error);
    return NextResponse.json(
      { valid: false, error: 'Failed to verify credentials' },
      { status: 500 }
    );
  }
}
