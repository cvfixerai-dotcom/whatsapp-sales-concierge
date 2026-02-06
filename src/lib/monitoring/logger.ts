// @ts-nocheck
import { supabaseAdmin } from '../db/client';

type LogLevel = 'info' | 'warning' | 'error' | 'debug';

interface LogEntry {
  level: LogLevel;
  message: string;
  data?: any;
  timestamp?: string;
  user_id?: string;
  tenant_id?: string;
  conversation_id?: string;
  request_id?: string;
}

class Logger {
  private async writeLog(entry: LogEntry) {
    try {
      // Add timestamp if not provided
      if (!entry.timestamp) {
        entry.timestamp = new Date().toISOString();
      }

      // Log to console in development
      if (process.env.NODE_ENV === 'development') {
        console.log(`[${entry.level.toUpperCase()}] ${entry.message}`, entry.data || '');
      }

      // Write to database for production
      if (process.env.NODE_ENV === 'production') {
        await supabaseAdmin
          .from('logs')
          .insert({
            level: entry.level,
            message: entry.message,
            data: entry.data,
            timestamp: entry.timestamp,
            user_id: entry.user_id,
            tenant_id: entry.tenant_id,
            conversation_id: entry.conversation_id,
            request_id: entry.request_id
          });
      }

      // TODO: Send to external logging service (e.g., Sentry, LogRocket)
      // if (process.env.SENTRY_DSN) {
      //   Sentry.captureMessage(entry.message, {
      //     level: entry.level,
      //     extra: entry.data
      //   });
      // }
    } catch (error) {
      // Avoid infinite loops - don't log errors from the logger itself
      console.error('Logger error:', error);
    }
  }

  async info(message: string, data?: any, context?: Partial<LogEntry>) {
    await this.writeLog({
      level: 'info',
      message,
      data,
      ...context
    });
  }

  async warning(message: string, data?: any, context?: Partial<LogEntry>) {
    await this.writeLog({
      level: 'warning',
      message,
      data,
      ...context
    });
  }

  async error(message: string, data?: any, context?: Partial<LogEntry>) {
    await this.writeLog({
      level: 'error',
      message,
      data,
      ...context
    });
  }

  async debug(message: string, data?: any, context?: Partial<LogEntry>) {
    if (process.env.LOG_LEVEL === 'debug') {
      await this.writeLog({
        level: 'debug',
        message,
        data,
        ...context
      });
    }
  }

  // Convenience method for API request logging
  async apiRequest(method: string, url: string, userId?: string, tenantId?: string, duration?: number) {
    await this.info('API Request', {
      method,
      url,
      duration: duration ? `${duration}ms` : undefined
    }, {
      user_id: userId,
      tenant_id: tenantId
    });
  }

  // Convenience method for conversation events
  async conversationEvent(
    event: string,
    conversationId: string,
    tenantId: string,
    data?: any
  ) {
    await this.info(`Conversation: ${event}`, data, {
      conversation_id: conversationId,
      tenant_id: tenantId
    });
  }

  // Convenience method for billing events
  async billingEvent(
    event: string,
    tenantId: string,
    data?: any
  ) {
    await this.info(`Billing: ${event}`, data, {
      tenant_id: tenantId
    });
  }

  // Convenience method for AI events
  async aiEvent(
    event: string,
    tenantId: string,
    conversationId?: string,
    data?: any
  ) {
    await this.info(`AI: ${event}`, data, {
      tenant_id: tenantId,
      conversation_id: conversationId
    });
  }
}

// Create singleton instance
const logger = new Logger();

// Function wrapper for backward compatibility with log('level', 'message', data) pattern
export function log(level: LogLevel, message: string, data?: any): void {
  switch (level) {
    case 'info':
      logger.info(message, data);
      break;
    case 'warning':
      logger.warning(message, data);
      break;
    case 'error':
      logger.error(message, data);
      break;
    case 'debug':
      logger.debug(message, data);
      break;
  }
}

// Also export the logger instance for method-style access
export { logger };

// Create logs table if it doesn't exist
export const createLogsTable = async () => {
  try {
    const { error } = await supabaseAdmin.rpc('create_logs_table_if_not_exists');
    if (error) {
      console.error('Error creating logs table:', error);
    }
  } catch (error) {
    console.error('Error creating logs table:', error);
  }
};

// Export default for convenience
export default log;
