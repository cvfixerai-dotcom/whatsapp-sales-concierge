import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // Frontend (onboarding/page.tsx) posts its twilioSetup state object,
    // which uses the twilio_-prefixed field names — accept both that and
    // the unprefixed names so this route works regardless of caller.
    const account_sid = body.twilio_account_sid ?? body.account_sid;
    const auth_token = body.twilio_auth_token ?? body.auth_token;
    const whatsapp_number = body.twilio_whatsapp_number ?? body.whatsapp_number;

    if (!account_sid || !auth_token) {
      return NextResponse.json({
        success: false,
        message: 'Account SID and Auth Token are required',
      });
    }

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${account_sid}.json`,
      {
        headers: {
          Authorization:
            'Basic ' +
            Buffer.from(`${account_sid}:${auth_token}`).toString('base64'),
        },
      }
    );

    if (response.ok) {
      const data = await response.json();
      return NextResponse.json({
        success: true,
        message: `Twilio credentials verified ✅ (${data.friendly_name || account_sid})`,
      });
    } else {
      const status = response.status;
      const msg =
        status === 401
          ? 'Invalid Auth Token ❌'
          : status === 404
            ? 'Account SID not found ❌'
            : `Twilio returned error ${status} ❌`;
      return NextResponse.json({ success: false, message: msg });
    }
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: 'Could not connect to Twilio. Check your network.',
    });
  }
}
