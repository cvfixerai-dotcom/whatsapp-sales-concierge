import crypto from 'crypto';
import { supabaseAdmin } from '../db/client';
import { env } from '../env';
import { rateLimiter, RateLimitResult } from './rate-limiter';
import { redisQueue } from '../queue/redis';

export interface TwilioMessage {
  to: string;
  from: string;
  body: string;
  mediaUrl?: string[];
}

export interface TwilioWebhookPayload {
  MessageSid: string;
  SmsStatus: string;
  ApiVersion: string;
  From: string;
  To: string;
  Body: string;
  NumMedia: string;
  NumSegments: string;
  AccountSid: string;
  MessagingServiceSid?: string;
  ReferralNumMedia?: string;
}

export class TwilioService {
  private static instance: TwilioService;
  private accountSid: string;
  private authToken: string;

  private constructor() {
    this.accountSid = env.TWILIO_ACCOUNT_SID || '';
    this.authToken = env.TWILIO_AUTH_TOKEN || '';
  }

  static getInstance(): TwilioService {
    if (!TwilioService.instance) {
      TwilioService.instance = new TwilioService();
    }
    return TwilioService.instance;
  }

  /**
   * Verify Twilio webhook signature
   */
  verifyWebhookSignature(
    signature: string,
    url: string,
    params: Record<string, string>
  ): boolean {
    // Skip verification in development if no auth token
    if (!this.authToken) {
      console.warn('Twilio auth token not configured - skipping signature verification');
      return true; // Allow in development
    }

    // Skip verification if no signature provided (development/testing)
    if (!signature) {
      console.warn('No Twilio signature provided - skipping verification');
      return true;
    }

    try {
      // Twilio signature verification algorithm:
      // 1. Take the full URL of the request
      // 2. Append each POST parameter, sorted alphabetically by key name
      // 3. Hash with HMAC-SHA1 using auth token
      const sortedParams = Object.keys(params)
        .sort()
        .map(key => `${key}${params[key]}`)
        .join('');
      
      const data = url + sortedParams;
      const expectedSignature = crypto
        .createHmac('sha1', this.authToken)
        .update(data)
        .digest('base64');

      // Secure compare function to prevent timing attacks
      if (signature.length !== expectedSignature.length) {
        console.error('Signature length mismatch');
        return false;
      }
      
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      console.error('Error verifying webhook signature:', error);
      // In development, allow the request to proceed
      if (process.env.NODE_ENV === 'development') {
        console.warn('Allowing request in development mode despite signature error');
        return true;
      }
      return false;
    }
  }

  /**
   * 🔥 CRIT-4 FIX: Verify Twilio webhook signature using a specific auth token (tenant-specific)
   */
  verifyWebhookSignatureWithToken(
    signature: string,
    url: string,
    params: Record<string, string>,
    authToken: string
  ): boolean {
    if (!authToken) {
      console.warn('No auth token provided for signature verification');
      return false;
    }

    if (!signature) {
      console.warn('No Twilio signature provided — rejecting in production');
      if (process.env.NODE_ENV === 'development') return true;
      return false;
    }

    try {
      const sortedParams = Object.keys(params)
        .sort()
        .map(key => `${key}${params[key]}`)
        .join('');
      
      const data = url + sortedParams;
      const expectedSignature = crypto
        .createHmac('sha1', authToken)
        .update(data)
        .digest('base64');

      if (signature.length !== expectedSignature.length) {
        console.error('Signature length mismatch (tenant-verified)');
        return false;
      }
      
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      console.error('Error verifying webhook signature with tenant token:', error);
      if (process.env.NODE_ENV === 'development') return true;
      return false;
    }
  }

  /**
   * Send WhatsApp message with retry logic and rate limiting
   */
  async sendWhatsAppMessage(
    tenantId: string,
    to: string,
    body: string,
    options: {
      mediaUrl?: string[];
      retries?: number;
      delay?: number;
      bypassRateLimit?: boolean;
    } = {}
  ): Promise<{ success: boolean; messageSid?: string; error?: string; rateLimited?: boolean }> {
    const { mediaUrl, retries = 3, delay = 1000, bypassRateLimit = false } = options;

    // Get tenant's Twilio credentials
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('twilio_account_sid, twilio_auth_token, twilio_whatsapp_number')
      .eq('id', tenantId)
      .single();

    if (!tenant?.twilio_account_sid || !tenant?.twilio_auth_token) {
      return {
        success: false,
        error: 'Twilio not configured for tenant',
      };
    }

    // Check rate limits unless bypassed
    if (!bypassRateLimit) {
      const rateLimitResult = await rateLimiter.checkRateLimit(tenantId, to);
      
      if (!rateLimitResult.allowed) {
        console.log(`Rate limit exceeded for ${to}. Type: ${rateLimitResult.limitType}`);
        
        // Requeue message with delay if rate limited
        await rateLimiter.handleRateLimitedMessage(
          tenantId,
          to,
          { to, body, options },
          rateLimitResult
        );
        
        return {
          success: false,
          error: `Rate limit exceeded. Retry after ${rateLimitResult.retryAfter}ms`,
          rateLimited: true,
        };
      }
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        // Exponential backoff
        if (attempt > 0) {
          await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, attempt - 1)));
        }

        // Ensure both To and From have whatsapp: prefix
        const toNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
        const fromNumber = tenant.twilio_whatsapp_number.startsWith('whatsapp:') 
          ? tenant.twilio_whatsapp_number 
          : `whatsapp:${tenant.twilio_whatsapp_number}`;

        const response = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${tenant.twilio_account_sid}/Messages.json`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Authorization: `Basic ${Buffer.from(
                `${tenant.twilio_account_sid}:${tenant.twilio_auth_token}`
              ).toString('base64')}`,
            },
            body: new URLSearchParams({
              To: toNumber,
              From: fromNumber,
              Body: body,
              ...(mediaUrl && mediaUrl.length > 0 && { MediaUrl: mediaUrl.join(',') }),
            }),
          }
        );

        if (!response.ok) {
          const errorData = await response.text();
          
          // Check for specific rate limit errors from Twilio
          if (response.status === 429) {
            const retryAfter = parseInt(response.headers.get('Retry-After') || '1') * 1000;
            
            // Requeue with Twilio's suggested retry time
            await rateLimiter.handleRateLimitedMessage(
              tenantId,
              to,
              { to, body, options },
              { allowed: false, retryAfter, limitType: 'per-second' }
            );
            
            return {
              success: false,
              error: `Twilio rate limit exceeded. Retry after ${retryAfter}ms`,
              rateLimited: true,
            };
          }
          
          throw new Error(`Twilio API error: ${response.status} - ${errorData}`);
        }

        const data = await response.json();
        
        // Record successful send in rate limiter
        if (!bypassRateLimit) {
          await rateLimiter.recordMessageSent(tenantId, to);
        }
        
        // Log successful send
        console.log(`Message sent successfully. SID: ${data.sid}`);
        
        return {
          success: true,
          messageSid: data.sid,
        };
      } catch (error) {
        lastError = error as Error;
        console.error(`Attempt ${attempt + 1} failed:`, error);
        
        // Don't retry on certain errors
        if (error instanceof Error) {
          if (error.message.includes('21610') || // Unsubscribed
              error.message.includes('21612') || // Account suspended
              error.message.includes('21614')) { // Phone number not capable
            break;
          }
        }
      }
    }

    return {
      success: false,
      error: lastError?.message || 'Failed to send message after retries',
    };
  }

  /**
   * Send SMS message
   */
  async sendSMS(
    tenantId: string,
    to: string,
    body: string,
    options: {
      retries?: number;
      delay?: number;
    } = {}
  ): Promise<{ success: boolean; messageSid?: string; error?: string }> {
    const { retries = 3, delay = 1000 } = options;

    // Get tenant's Twilio credentials
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('twilio_account_sid, twilio_auth_token, twilio_phone_number, twilio_whatsapp_number')
      .eq('id', tenantId)
      .single();

    if (!tenant?.twilio_account_sid || !tenant?.twilio_auth_token) {
      return {
        success: false,
        error: 'Twilio not configured for tenant',
      };
    }

    // Use tenant's phone number or fall back to WhatsApp number
    const fromNumber = tenant.twilio_phone_number || tenant.twilio_whatsapp_number;
    if (!fromNumber) {
      return {
        success: false,
        error: 'No SMS-capable phone number configured',
      };
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        // Exponential backoff
        if (attempt > 0) {
          await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, attempt - 1)));
        }

        const response = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${tenant.twilio_account_sid}/Messages.json`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Authorization: `Basic ${Buffer.from(
                `${tenant.twilio_account_sid}:${tenant.twilio_auth_token}`
              ).toString('base64')}`,
            },
            body: new URLSearchParams({
              To: to,
              From: fromNumber,
              Body: body,
            }),
          }
        );

        if (!response.ok) {
          const errorData = await response.text();
          throw new Error(`Twilio API error: ${response.status} - ${errorData}`);
        }

        const data = await response.json();
        console.log(`SMS sent successfully. SID: ${data.sid}`);
        
        return {
          success: true,
          messageSid: data.sid,
        };
      } catch (error) {
        lastError = error as Error;
        console.error(`SMS attempt ${attempt + 1} failed:`, error);
      }
    }

    return {
      success: false,
      error: lastError?.message || 'Failed to send SMS after retries',
    };
  }

  /**
   * Get tenant by WhatsApp number
   */
  async getTenantByWhatsAppNumber(whatsappNumber: string): Promise<string | null> {
    try {
      // Try both with and without 'whatsapp:' prefix
      const withPrefix = whatsappNumber.startsWith('whatsapp:') 
        ? whatsappNumber 
        : `whatsapp:${whatsappNumber}`;
      const withoutPrefix = whatsappNumber.replace('whatsapp:', '');

      console.log(`Looking for tenant with WhatsApp number: ${withPrefix} or ${withoutPrefix}`);

      // Try with prefix first (as stored in our SQL update)
      let { data: tenant, error } = await supabaseAdmin
        .from('tenants')
        .select('id, subscription_status, twilio_whatsapp_number')
        .or(`twilio_whatsapp_number.eq.${withPrefix},twilio_whatsapp_number.eq.${withoutPrefix}`)
        .single();

      if (error) {
        console.error('Error querying tenant:', error);
        
        // Fallback: try without subscription_status filter for debugging
        const { data: allTenants } = await supabaseAdmin
          .from('tenants')
          .select('id, subscription_status, twilio_whatsapp_number')
          .limit(5);
        console.log('Available tenants:', allTenants);
      }

      if (!tenant) {
        console.error(`No tenant found for WhatsApp number: ${whatsappNumber}`);
        return null;
      }

      console.log(`Found tenant: ${tenant.id}, status: ${tenant.subscription_status}`);

      // Allow active and trial tenants; block only cancelled
      if (tenant.subscription_status === 'cancelled') {
        console.warn(`Tenant ${tenant.id} subscription is cancelled - blocking message`);
        return null;
      }

      return tenant.id;
    } catch (error) {
      console.error('Error finding tenant by WhatsApp number:', error);
      return null;
    }
  }

  /**
   * Mark message as processed in webhook events
   */
  async markWebhookProcessed(
    tenantId: string,
    messageSid: string,
    error?: string
  ): Promise<void> {
    try {
      await supabaseAdmin
        .from('webhook_events')
        .update({
          processed: true,
          processed_at: new Date().toISOString(),
          error_message: error,
        })
        .eq('source', 'twilio')
        .eq('idempotency_key', messageSid)
        .eq('tenant_id', tenantId);
    } catch (error) {
      console.error('Error marking webhook as processed:', error);
    }
  }

  /**
   * Check if webhook was already processed
   */
  async isWebhookProcessed(
    tenantId: string,
    messageSid: string
  ): Promise<boolean> {
    try {
      const { data } = await supabaseAdmin
        .from('webhook_events')
        .select('processed')
        .eq('source', 'twilio')
        .eq('idempotency_key', messageSid)
        .eq('tenant_id', tenantId)
        .single();

      return data?.processed || false;
    } catch (error) {
      // If not found, it hasn't been processed
      return false;
    }
  }

  /**
   * Store webhook event for idempotency
   */
  async storeWebhookEvent(
    tenantId: string | null,
    messageSid: string,
    eventType: string,
    payload: Record<string, any>
  ): Promise<void> {
    try {
      await supabaseAdmin
        .from('webhook_events')
        .insert({
          tenant_id: tenantId,
          idempotency_key: messageSid,
          source: 'twilio',
          event_type: eventType,
          payload,
          processed: false,
        });
    } catch (error) {
      // If it's a duplicate, that's fine
      if (error instanceof Error && !error.message.includes('duplicate')) {
        console.error('Error storing webhook event:', error);
      }
    }
  }
}

// Export singleton instance
export const twilioService = TwilioService.getInstance();
