import { Redis } from '@upstash/redis';

export interface QueueMessage {
  id: string;
  type: 'inbound_message' | 'outbound_message' | 'ai_response' | 'appointment_reminder';
  tenantId: string;
  payload: Record<string, any>;
  retryCount: number;
  maxRetries: number;
  createdAt: number;
  scheduledAt?: number;
}

export interface QueueConfig {
  redis: Redis;
  queueName: string;
  dlqName: string;
  processingName: string;
  visibilityTimeout: number;
  maxRetries: number;
}

class RedisQueue {
  private _config: QueueConfig | null = null;
  private static instance: RedisQueue;

  private constructor() {
    // Lazy initialization - don't create Redis client here
  }

  // Lazy getter for config - creates Redis client when first accessed
  private get config(): QueueConfig {
    if (!this._config) {
      const url = process.env.UPSTASH_REDIS_REST_URL;
      const token = process.env.UPSTASH_REDIS_REST_TOKEN;
      
      if (!url || !token) {
        throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set');
      }
      
      this._config = {
        redis: new Redis({ url, token }),
        queueName: 'message_queue',
        dlqName: 'message_queue_dlq',
        processingName: 'message_queue_processing',
        visibilityTimeout: 30000, // 30 seconds
        maxRetries: 3,
      };
    }
    return this._config;
  }

  static getInstance(): RedisQueue {
    if (!RedisQueue.instance) {
      RedisQueue.instance = new RedisQueue();
    }
    return RedisQueue.instance;
  }

  /**
   * Queue a message for processing
   */
  async queueMessage(message: Omit<QueueMessage, 'id' | 'createdAt' | 'retryCount'>): Promise<void> {
    const fullMessage: QueueMessage = {
      ...message,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: Date.now(),
      retryCount: 0,
    };

    try {
      await this.config.redis.lpush(
        this.config.queueName,
        JSON.stringify(fullMessage)
      );
      
      console.log(`Message queued: ${fullMessage.id} of type ${fullMessage.type}`);
    } catch (error) {
      console.error('Error queueing message:', error);
      throw error;
    }
  }

  /**
   * Queue an inbound message from Twilio webhook
   */
  async queueInboundMessage(
    tenantId: string,
    payload: Record<string, any>
  ): Promise<void> {
    await this.queueMessage({
      type: 'inbound_message',
      tenantId,
      payload,
      maxRetries: this.config.maxRetries,
    });
  }

  /**
   * Queue an outbound message to be sent
   */
  async queueOutboundMessage(
    tenantId: string,
    to: string,
    body: string,
    options: {
      mediaUrl?: string[];
      conversationId?: string;
      delay?: number;
    } = {}
  ): Promise<void> {
    const scheduledAt = options.delay ? Date.now() + options.delay : undefined;
    
    await this.queueMessage({
      type: 'outbound_message',
      tenantId,
      payload: {
        to,
        body,
        mediaUrl: options.mediaUrl,
        conversationId: options.conversationId,
      },
      maxRetries: this.config.maxRetries,
      scheduledAt,
    });
  }

  /**
   * Dequeue a message for processing
   */
  async dequeueMessage(): Promise<QueueMessage | null> {
    try {
      // Use rpop (Upstash REST API doesn't support brpoplpush)
      const result = await this.config.redis.rpop(this.config.queueName);

      if (!result) {
        return null;
      }

      const messageStr = typeof result === 'string' ? result : JSON.stringify(result);
      const message: QueueMessage = JSON.parse(messageStr);
      
      // Add to processing queue
      await this.config.redis.lpush(
        this.config.processingName,
        messageStr
      );
      
      // Check if message is scheduled for future
      if (message.scheduledAt && message.scheduledAt > Date.now()) {
        // Remove from processing and return to main queue
        await this.config.redis.lrem(this.config.processingName, 1, messageStr);
        await this.config.redis.lpush(
          this.config.queueName,
          messageStr
        );
        return null;
      }

      return message;
    } catch (error) {
      console.error('Error dequeuing message:', error);
      return null;
    }
  }

  /**
   * Mark message as processed (remove from processing queue)
   */
  async markMessageProcessed(messageId: string): Promise<void> {
    try {
      // Remove from processing queue
      const messages = await this.config.redis.lrange(
        this.config.processingName,
        0,
        -1
      );

      for (const msgData of messages) {
        try {
          // Handle both string and object formats from Redis
          const msgStr = typeof msgData === 'string' ? msgData : JSON.stringify(msgData);
          const msg: QueueMessage = typeof msgData === 'string' ? JSON.parse(msgData) : msgData;
          
          if (msg.id === messageId) {
            await this.config.redis.lrem(
              this.config.processingName,
              1,
              msgStr
            );
            break;
          }
        } catch (parseError) {
          console.error('Error parsing message in markMessageProcessed:', parseError);
          continue;
        }
      }

      console.log(`Message processed: ${messageId}`);
    } catch (error) {
      console.error('Error marking message as processed:', error);
    }
  }

  /**
   * Mark message as failed and move to DLQ or retry
   */
  async markMessageFailed(
    message: QueueMessage,
    error: Error
  ): Promise<void> {
    try {
      // Remove from processing queue
      await this.markMessageProcessed(message.id);

      // Increment retry count
      message.retryCount++;

      if (message.retryCount >= message.maxRetries) {
        // Move to dead letter queue
        await this.config.redis.lpush(
          this.config.dlqName,
          JSON.stringify({
            ...message,
            failedAt: Date.now(),
            error: error.message,
          })
        );
        console.error(`Message moved to DLQ: ${message.id}`);
      } else {
        // Requeue with exponential backoff
        const delayMs = Math.pow(2, message.retryCount) * 1000;
        message.scheduledAt = Date.now() + delayMs;
        
        await this.config.redis.lpush(
          this.config.queueName,
          JSON.stringify(message)
        );
        console.log(`Message requeued for retry: ${message.id} (attempt ${message.retryCount})`);
      }
    } catch (queueError) {
      console.error('Error handling failed message:', queueError);
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<{
    pending: number;
    processing: number;
    dlq: number;
  }> {
    try {
      const [pending, processing, dlq] = await Promise.all([
        this.config.redis.llen(this.config.queueName),
        this.config.redis.llen(this.config.processingName),
        this.config.redis.llen(this.config.dlqName),
      ]);

      return { pending, processing, dlq };
    } catch (error) {
      console.error('Error getting queue stats:', error);
      return { pending: 0, processing: 0, dlq: 0 };
    }
  }

  /**
   * Process messages from the dead letter queue
   */
  async processDLQ(
    handler: (message: QueueMessage, error: string) => Promise<void>
  ): Promise<void> {
    try {
      const messageStr = await this.config.redis.rpop(this.config.dlqName);
      if (!messageStr) return;

      const message: QueueMessage & { failedAt: number; error: string } = JSON.parse(messageStr);
      
      console.log(`Processing DLQ message: ${message.id}`);
      
      await handler(
        {
          id: message.id,
          type: message.type,
          tenantId: message.tenantId,
          payload: message.payload,
          retryCount: message.retryCount,
          maxRetries: message.maxRetries,
          createdAt: message.createdAt,
        },
        message.error
      );
    } catch (error) {
      console.error('Error processing DLQ message:', error);
    }
  }

  /**
   * Clean up stale messages in processing queue
   */
  async cleanupStaleMessages(): Promise<void> {
    try {
      const messages = await this.config.redis.lrange(
        this.config.processingName,
        0,
        -1
      );

      const now = Date.now();
      const staleMessages: string[] = [];

      for (const msgData of messages) {
        try {
          // Handle both string and object formats from Redis
          const msgStr = typeof msgData === 'string' ? msgData : JSON.stringify(msgData);
          const msg: QueueMessage = typeof msgData === 'string' ? JSON.parse(msgData) : msgData;
          
          // If message has been processing longer than visibility timeout
          if (now - msg.createdAt > this.config.visibilityTimeout) {
            staleMessages.push(msgStr);
          }
        } catch (parseError) {
          console.error('Error parsing message in cleanup:', parseError);
          continue;
        }
      }

      // Requeue stale messages
      for (const msgStr of staleMessages) {
        const msg: QueueMessage = JSON.parse(msgStr);
        
        await this.config.redis.lrem(
          this.config.processingName,
          1,
          msgStr
        );

        // Increment retry count
        msg.retryCount++;
        
        if (msg.retryCount < msg.maxRetries) {
          await this.config.redis.lpush(
            this.config.queueName,
            JSON.stringify(msg)
          );
          console.log(`Requeued stale message: ${msg.id}`);
        } else {
          // Move to DLQ
          await this.config.redis.lpush(
            this.config.dlqName,
            JSON.stringify({
              ...msg,
              failedAt: now,
              error: 'Processing timeout',
            })
          );
        }
      }

      if (staleMessages.length > 0) {
        console.log(`Cleaned up ${staleMessages.length} stale messages`);
      }
    } catch (error) {
      console.error('Error cleaning up stale messages:', error);
    }
  }

  /**
   * Get Redis client for custom operations
   */
  getRedis(): Redis {
    return this.config.redis;
  }
}

// Export singleton instance
export const redisQueue = RedisQueue.getInstance();

// Export QueueMessage type
// @ts-ignore
export type { QueueMessage };
