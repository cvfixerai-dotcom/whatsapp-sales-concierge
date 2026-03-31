// @ts-nocheck
import { supabaseAdmin } from '../db/client';

export interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number; // milliseconds
  remaining?: number;
  limitType?: 'per-second' | 'daily' | 'monthly';
  error?: string;
}

export interface RateLimitConfig {
  perSecond: number;
  perDay: number;
  perMonth: number;
  windowSize: number; // in seconds for per-second tracking
}

export class RateLimiter {
  private static instance: RateLimiter;
  private config: RateLimitConfig;
  private _redis: any = null; // Upstash Redis client - lazy loaded

  private constructor() {
    this.config = {
      perSecond: 1, // WhatsApp Business API limit
      perDay: 1000, // Safe daily limit per account
      perMonth: 30000, // Safe monthly limit per account
      windowSize: 1, // 1-second window
    };
    // Don't initialize redis here - use lazy loading
  }

  // Lazy getter for Redis
  private get redis(): any {
    if (!this._redis) {
      // Import dynamically to avoid initialization issues
      const { redisQueue } = require('../queue/redis');
      this._redis = redisQueue.getRedis();
    }
    return this._redis;
  }

  static getInstance(): RateLimiter {
    if (!RateLimiter.instance) {
      RateLimiter.instance = new RateLimiter();
    }
    return RateLimiter.instance;
  }

  /**
   * Check if a message can be sent based on rate limits
   */
  async checkRateLimit(
    tenantId: string,
    phoneNumber: string,
    options: {
      bypassCache?: boolean;
    } = {}
  ): Promise<RateLimitResult> {
    try {
      const now = Date.now();
      const oneSecondAgo = now - 1000;
      const oneDayAgo = now - 24 * 60 * 60 * 1000;
      const oneMonthAgo = now - 30 * 24 * 60 * 60 * 1000;

      // Use Redis for fast rate limiting checks
      const cacheKey = `rate_limit:${tenantId}:${phoneNumber}`;
      
      if (!options.bypassCache) {
        // Check Redis cache first
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          const data = JSON.parse(cached);
          if (data.blockedUntil && data.blockedUntil > now) {
            return {
              allowed: false,
              retryAfter: data.blockedUntil - now,
              limitType: data.limitType,
            };
          }
        }
      }

      // Check per-second limit (most restrictive)
      const perSecondKey = `rate_ps:${tenantId}:${phoneNumber}`;
      const perSecondCount = await this.redis.get(perSecondKey) || '0';
      
      if (parseInt(perSecondCount) >= this.config.perSecond) {
        const result = {
          allowed: false,
          retryAfter: 1000,
          limitType: 'per-second' as const,
        };
        
        // Cache the block
        await this.redis.setex(
          cacheKey,
          1,
          JSON.stringify({
            blockedUntil: now + 1000,
            limitType: 'per-second',
          })
        );
        
        return result;
      }

      // Check daily limit
      const dailyKey = `rate_day:${tenantId}:${new Date().toISOString().slice(0, 10)}`;
      const dailyCount = await this.redis.get(dailyKey) || '0';
      
      if (parseInt(dailyCount) >= this.config.perDay) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        
        const result = {
          allowed: false,
          retryAfter: tomorrow.getTime() - now,
          limitType: 'daily' as const,
        };
        
        // Cache the block
        await this.redis.setex(
          cacheKey,
          86400,
          JSON.stringify({
            blockedUntil: tomorrow.getTime(),
            limitType: 'daily',
          })
        );
        
        return result;
      }

      // Check monthly limit
      const monthlyKey = `rate_month:${tenantId}:${new Date().toISOString().slice(0, 7)}`;
      const monthlyCount = await this.redis.get(monthlyKey) || '0';
      
      if (parseInt(monthlyCount) >= this.config.perMonth) {
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        nextMonth.setDate(1);
        nextMonth.setHours(0, 0, 0, 0);
        
        const result = {
          allowed: false,
          retryAfter: nextMonth.getTime() - now,
          limitType: 'monthly' as const,
        };
        
        // Cache the block
        await this.redis.setex(
          cacheKey,
          2592000, // 30 days
          JSON.stringify({
            blockedUntil: nextMonth.getTime(),
            limitType: 'monthly',
          })
        );
        
        return result;
      }

      // Calculate remaining messages
      const remaining = {
        'per-second': this.config.perSecond - parseInt(perSecondCount),
        'daily': this.config.perDay - parseInt(dailyCount),
        'monthly': this.config.perMonth - parseInt(monthlyCount),
      };

      return {
        allowed: true,
        remaining: Math.min(...Object.values(remaining)),
      };
    } catch (error) {
      console.error('Error checking rate limit:', error);
      // Allow the message if rate limit check fails
      return { allowed: true, error: 'Rate limit check failed' };
    }
  }

  /**
   * Record that a message was sent successfully
   */
  async recordMessageSent(
    tenantId: string,
    phoneNumber: string
  ): Promise<void> {
    try {
      const now = Date.now();
      const today = new Date().toISOString().slice(0, 10);
      const thisMonth = new Date().toISOString().slice(0, 7);

      // Update per-second counter (with 1-second TTL)
      const perSecondKey = `rate_ps:${tenantId}:${phoneNumber}`;
      await this.redis.incr(perSecondKey);
      await this.redis.expire(perSecondKey, 1);

      // Update daily counter (with 24-hour TTL)
      const dailyKey = `rate_day:${tenantId}:${today}`;
      await this.redis.incr(dailyKey);
      await this.redis.expire(dailyKey, 86400);

      // Update monthly counter (with 30-day TTL)
      const monthlyKey = `rate_month:${tenantId}:${thisMonth}`;
      await this.redis.incr(monthlyKey);
      await this.redis.expire(monthlyKey, 2592000);

      // Also record in database for analytics
      await this.recordInDatabase(tenantId, phoneNumber);
    } catch (error) {
      console.error('Error recording message sent:', error);
    }
  }

  /**
   * Record rate limit data in database for analytics
   */
  private async recordInDatabase(
    tenantId: string,
    phoneNumber: string
  ): Promise<void> {
    try {
      const windowStart = new Date();
      windowStart.setSeconds(windowStart.getSeconds() - 1);

      // Check if record exists for this window
      const { data: existing } = await supabaseAdmin
        .from('rate_limits')
        .select('message_count')
        .eq('tenant_id', tenantId)
        .eq('whatsapp_number', phoneNumber)
        .eq('window_start', windowStart.toISOString())
        .single();

      if (existing) {
        // Update existing record
        await supabaseAdmin
          .from('rate_limits')
          .update({
            message_count: existing.message_count + 1,
          })
          .eq('tenant_id', tenantId)
          .eq('whatsapp_number', phoneNumber)
          .eq('window_start', windowStart.toISOString());
      } else {
        // Create new record
        await supabaseAdmin
          .from('rate_limits')
          .insert({
            tenant_id: tenantId,
            whatsapp_number: phoneNumber,
            window_start: windowStart.toISOString(),
            message_count: 1,
          });
      }
    } catch (error) {
      // Don't throw here as this is just for analytics
      console.error('Error recording rate limit in database:', error);
    }
  }

  /**
   * Handle rate limited message by requeuing with delay
   */
  async handleRateLimitedMessage(
    tenantId: string,
    phoneNumber: string,
    messageData: any,
    rateLimitResult: RateLimitResult
  ): Promise<void> {
    if (!rateLimitResult.retryAfter) {
      console.error('Rate limited but no retry after time provided');
      return;
    }

    // Calculate delay with jitter to avoid thundering herd
    const jitter = Math.random() * 1000; // Add up to 1 second jitter
    const delay = rateLimitResult.retryAfter + jitter;

    // Requeue message with delay - import dynamically
    const { redisQueue } = require('../queue/redis');
    await redisQueue.queueOutboundMessage(
      tenantId,
      messageData.to,
      messageData.body,
      {
        ...messageData.options,
        delay,
        rateLimited: true,
        originalAttempt: Date.now(),
      }
    );

    console.log(
      `Message requeued due to rate limit. ` +
      `Tenant: ${tenantId}, Phone: ${phoneNumber}, ` +
      `Delay: ${delay}ms, Type: ${rateLimitResult.limitType}`
    );
  }

  /**
   * Get current usage statistics
   */
  async getUsageStats(tenantId: string): Promise<{
    perSecond: { used: number; limit: number; remaining: number };
    daily: { used: number; limit: number; remaining: number };
    monthly: { used: number; limit: number; remaining: number };
  }> {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const thisMonth = new Date().toISOString().slice(0, 7);

      const [perSecond, daily, monthly] = await Promise.all([
        this.redis.get(`rate_ps:${tenantId}:*`) || '0',
        this.redis.get(`rate_day:${tenantId}:${today}`) || '0',
        this.redis.get(`rate_month:${tenantId}:${thisMonth}`) || '0',
      ]);

      return {
        perSecond: {
          used: parseInt(perSecond as string),
          limit: this.config.perSecond,
          remaining: this.config.perSecond - parseInt(perSecond as string),
        },
        daily: {
          used: parseInt(daily as string),
          limit: this.config.perDay,
          remaining: this.config.perDay - parseInt(daily as string),
        },
        monthly: {
          used: parseInt(monthly as string),
          limit: this.config.perMonth,
          remaining: this.config.perMonth - parseInt(monthly as string),
        },
      };
    } catch (error) {
      console.error('Error getting usage stats:', error);
      return {
        perSecond: { used: 0, limit: this.config.perSecond, remaining: this.config.perSecond },
        daily: { used: 0, limit: this.config.perDay, remaining: this.config.perDay },
        monthly: { used: 0, limit: this.config.perMonth, remaining: this.config.perMonth },
      };
    }
  }

  /**
   * Reset rate limits for a tenant (admin function)
   */
  async resetRateLimits(tenantId: string): Promise<void> {
    try {
      // Get all keys for this tenant
      const keys = await this.redis.keys(`rate_*:${tenantId}:*`);
      
      if (keys.length > 0) {
        await this.redis.del(...keys);
        console.log(`Reset ${keys.length} rate limit entries for tenant ${tenantId}`);
      }

      // Also clear database records
      await supabaseAdmin
        .from('rate_limits')
        .delete()
        .eq('tenant_id', tenantId);
    } catch (error) {
      console.error('Error resetting rate limits:', error);
      throw error;
    }
  }

  /**
   * Clean up old rate limit records from database
   */
  async cleanupOldRecords(): Promise<void> {
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { error } = await supabaseAdmin
        .from('rate_limits')
        .delete()
        .lt('window_start', sevenDaysAgo.toISOString());

      if (error) {
        throw error;
      }

      console.log('Cleaned up old rate limit records');
    } catch (error) {
      console.error('Error cleaning up old rate limit records:', error);
    }
  }

  /**
   * Update rate limit configuration
   */
  updateConfig(newConfig: Partial<RateLimitConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('Rate limit config updated:', this.config);
  }
}

// Export singleton instance
export const rateLimiter = RateLimiter.getInstance();

// Export types
export type { RateLimitConfig };
