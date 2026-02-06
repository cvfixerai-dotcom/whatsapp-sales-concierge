import { NextRequest, NextResponse } from 'next/server';
import { twilioService } from '@/lib/services/twilio';
import { redisQueue } from '@/lib/queue/redis';
import { headers } from 'next/headers';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Get the raw body for signature verification
    const body = await request.text();
    const params = new URLSearchParams(body);
    
    // Convert URLSearchParams to object for easier handling
    const webhookData: Record<string, string> = {};
    for (const [key, value] of params.entries()) {
      webhookData[key] = value;
    }

    // Verify Twilio signature (skip in development with ngrok)
    const signature = request.headers.get('x-twilio-signature') || '';
    const url = request.url;
    
    // Skip signature verification in development (ngrok changes the URL)
    const isDevelopment = process.env.NODE_ENV === 'development' || url.includes('ngrok');
    if (!isDevelopment && !twilioService.verifyWebhookSignature(signature, url, webhookData)) {
      console.error('Invalid Twilio signature');
      return new NextResponse('Invalid signature', { status: 403 });
    }
    
    console.log('Webhook received:', { from: webhookData.From, to: webhookData.To, body: webhookData.Body?.substring(0, 50) });

    // Extract message details
    const messageSid = webhookData.MessageSid;
    const fromNumber = webhookData.From;
    const toNumber = webhookData.To;
    const messageBody = webhookData.Body || '';
    const numMedia = parseInt(webhookData.NumMedia || '0');

    // Get tenant by the 'To' number (our WhatsApp number)
    const tenantId = await twilioService.getTenantByWhatsAppNumber(toNumber);
    
    if (!tenantId) {
      console.error(`No tenant found for WhatsApp number: ${toNumber}`);
      // Still return 200 to avoid Twilio retries
      return new NextResponse('OK', { status: 200 });
    }

    // Check for idempotency
    const isProcessed = await twilioService.isWebhookProcessed(tenantId, messageSid);
    if (isProcessed) {
      console.log(`Webhook already processed: ${messageSid}`);
      return new NextResponse('OK', { status: 200 });
    }

    // Store webhook event for idempotency
    await twilioService.storeWebhookEvent(
      tenantId,
      messageSid,
      'inbound_message',
      {
        from: fromNumber,
        to: toNumber,
        body: messageBody,
        numMedia,
        timestamp: new Date().toISOString(),
      }
    );

    // Prepare media URLs if present
    const mediaUrls: string[] = [];
    for (let i = 0; i < numMedia; i++) {
      const mediaUrl = webhookData[`MediaUrl${i}`];
      if (mediaUrl) {
        mediaUrls.push(mediaUrl);
      }
    }

    // Queue message for async processing
    await redisQueue.queueInboundMessage(tenantId, {
      MessageSid: messageSid,
      From: fromNumber,
      To: toNumber,
      Body: messageBody,
      NumMedia: numMedia.toString(),
      MediaUrls: mediaUrls,
      AccountSid: webhookData.AccountSid,
      timestamp: new Date().toISOString(),
    });

    // Log metrics
    const processingTime = Date.now() - startTime;
    console.log(`Webhook processed in ${processingTime}ms - SID: ${messageSid}`);

    // Return 200 OK immediately (async processing)
    const response = new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      {
        status: 200,
        headers: {
          'Content-Type': 'text/xml',
        },
      }
    );

    return response;
  } catch (error) {
    console.error('Error processing Twilio webhook:', error);
    
    // Still return 200 to avoid Twilio retries for server errors
    // The error is logged for investigation
    return new NextResponse('OK', { status: 200 });
  }
}

// Handle GET requests for health check
export async function GET() {
  return NextResponse.json({
    status: 'healthy',
    service: 'twilio-webhook',
    timestamp: new Date().toISOString(),
  });
}
