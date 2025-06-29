import winston from 'winston';
import { LogConfig } from '../types/index.js';

class Logger {
  private logger: winston.Logger;

  constructor(config: LogConfig) {
    const transports: winston.transport[] = [];

    // 控制台输出
    if (config.console) {
      transports.push(
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.timestamp(),
            winston.format.printf(({ timestamp, level, message, ...meta }) => {
              const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
              return `${timestamp} [${level}]: ${message} ${metaStr}`;
            })
          )
        })
      );
    }

    // 文件输出
    if (config.file) {
      transports.push(
        new winston.transports.File({
          filename: config.file,
          maxsize: this.parseSize(config.max_size || '10MB'),
          maxFiles: config.max_files || 5,
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
          )
        })
      );
    }

    this.logger = winston.createLogger({
      level: config.level,
      transports,
      exitOnError: false
    });
  }

  private parseSize(size: string): number {
    const units: { [key: string]: number } = {
      'B': 1,
      'KB': 1024,
      'MB': 1024 * 1024,
      'GB': 1024 * 1024 * 1024
    };

    const match = size.match(/^(\d+)(B|KB|MB|GB)$/i);
    if (!match) return 10 * 1024 * 1024; // 默认 10MB

    const value = parseInt(match[1]);
    const unit = match[2].toUpperCase();
    return value * (units[unit] || 1);
  }

  error(message: string, meta?: any): void {
    this.logger.error(message, meta);
  }

  warn(message: string, meta?: any): void {
    this.logger.warn(message, meta);
  }

  info(message: string, meta?: any): void {
    this.logger.info(message, meta);
  }

  debug(message: string, meta?: any): void {
    this.logger.debug(message, meta);
  }

  // 专用方法
  logApiCall(method: string, url: string, status: number, duration: number): void {
    this.info('API Call', {
      method,
      url,
      status,
      duration: `${duration}ms`,
      type: 'api_call'
    });
  }

  logBotMessage(userId: number, chatId: number, command: string, success: boolean): void {
    this.info('Bot Message', {
      userId,
      chatId,
      command,
      success,
      type: 'bot_message'
    });
  }

  logScheduledTask(taskName: string, success: boolean, duration: number, error?: string): void {
    const level = success ? 'info' : 'error';
    this.logger.log(level, 'Scheduled Task', {
      taskName,
      success,
      duration: `${duration}ms`,
      error,
      type: 'scheduled_task'
    });
  }

  logDatabaseOperation(operation: string, table: string, success: boolean, duration: number, error?: string): void {
    const level = success ? 'debug' : 'error';
    this.logger.log(level, 'Database Operation', {
      operation,
      table,
      success,
      duration: `${duration}ms`,
      error,
      type: 'database_operation'
    });
  }

  logUserAction(userId: number, action: string, details?: any): void {
    this.info('User Action', {
      userId,
      action,
      details,
      type: 'user_action'
    });
  }

  logPriceUpdate(symbol: string, exchange: string, price: number, change: number): void {
    this.debug('Price Update', {
      symbol,
      exchange,
      price,
      change,
      type: 'price_update'
    });
  }

  logSubscriptionEvent(userId: number, subscriptionType: string, action: string): void {
    this.info('Subscription Event', {
      userId,
      subscriptionType,
      action,
      type: 'subscription_event'
    });
  }

  logRateLimit(service: string, userId?: number): void {
    this.warn('Rate Limit Hit', {
      service,
      userId,
      type: 'rate_limit'
    });
  }
}

// 单例模式
let loggerInstance: Logger | null = null;

export function createLogger(config: LogConfig): Logger {
  if (!loggerInstance) {
    loggerInstance = new Logger(config);
  }
  return loggerInstance;
}

export function getLogger(): Logger {
  if (!loggerInstance) {
    throw new Error('Logger not initialized. Call createLogger first.');
  }
  return loggerInstance;
}

export { Logger };
