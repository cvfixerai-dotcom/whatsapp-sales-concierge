// @ts-nocheck
/**
 * Demo Bot Webhook Handler
 * Handles incoming WhatsApp messages for the demo bot
 */

import { NextRequest, NextResponse } from 'next/server';
import { processDemoMessage, getDemoStats } from '@/lib/demo/demo-bot';
import { twilioService } from '@/lib/services/twilio';

// Demo Twilio credentials (use your demo account)
const DEMO_TWILIO_SID = process.env.DEMO_TWILIO_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID;
const DEMO_TWILIO_TOKEN = process.env.DEMO_TWILIO_AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN;
const DEMO_WHATSAPP_NUMBER = process.env.DEMO_WHATSAPP_NUMBER || 'whatsapp:+14099083940';

/**
 * POST /api/webhook/demo
 * Receives incoming WhatsApp messages for demo bot
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    
    const from = formData.get('From') as string;
    const to = formData.get('To') as string;
    const body = formData.get('Body') as string;
    const messageSid = formData.get('MessageSid') as string;

    console.log(`[DemoBot] Incoming message from ${from}: ${body}`);

    if (!from || !body) {
      return new NextResponse('Missing required fields', { status: 400 });
    }

    // Process the demo message
    const result = await processDemoMessage(from, body);

    // Send response via Twilio
    await sendDemoResponse(from, result.response);

    console.log(`[DemoBot] Response sent to ${from}`);

    // Return TwiML response (empty to prevent double-send)
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      {
        status: 200,
        headers: { 'Content-Type': 'text/xml' },
      }
    );
  } catch (error) {
    console.error('[DemoBot] Error processing message:', error);
    
    // Still return 200 to prevent Twilio retries
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      {
        status: 200,
        headers: { 'Content-Type': 'text/xml' },
      }
    );
  }
}

/**
 * GET /api/webhook/demo
 * Health check and stats endpoint
 */
export async function GET(request: NextRequest) {
  const stats = getDemoStats();
  
  return NextResponse.json({
    status: 'ok',
    service: 'demo-bot',
    stats,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Send demo response via Twilio
 */
async function sendDemoResponse(to: string, message: string): Promise<void> {
  try {
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${DEMO_TWILIO_SID}/Messages.json`;
    
    const response = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${DEMO_TWILIO_SID}:${DEMO_TWILIO_TOKEN}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: to,
        From: DEMO_WHATSAPP_NUMBER,
        Body: message,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[DemoBot] Twilio error:', errorText);
      throw new Error(`Twilio error: ${response.status}`);
    }

    const result = await response.json();
    console.log(`[DemoBot] Message sent, SID: ${result.sid}`);
  } catch (error) {
    console.error('[DemoBot] Error sending response:', error);
    throw error;
  }
}
