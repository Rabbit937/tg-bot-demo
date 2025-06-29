import { z } from 'zod';
import { AppConfig } from '../types/index.js';

// 配置验证模式
const AppConfigSchema = z.object({
  bot: z.object({
    token: z.string().min(1, 'Bot token is required'),
    polling: z.boolean().default(true),
    webhook_url: z.string().url().optional()
  }),
  database: z.object({
    path: z.string().default('./data/bot.db'),
    backup_interval: z.number().default(24 * 60 * 60 * 1000), // 24 hours
    max_connections: z.number().default(10)
  }),
  logging: z.object({
    level: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
    file: z.string().optional(),
    console: z.boolean().default(true),
    max_files: z.number().default(5),
    max_size: z.string().default('10MB')
  }),
  coingecko: z.object({
    api_key: z.string().optional(),
    base_url: z.string().default('https://api.coingecko.com/api/v3'),
    rate_limit: z.number().default(50) // requests per minute
  }),
  exchanges: z.object({
    binance: z.object({
      base_url: z.string().default('https://fapi.binance.com'),
      rate_limit: z.number().default(1200) // requests per minute
    }),
    okx: z.object({
      base_url: z.string().default('https://www.okx.com'),
      rate_limit: z.number().default(600) // requests per minute
    }),
    bybit: z.object({
      base_url: z.string().default('https://api.bybit.com'),
      rate_limit: z.number().default(600) // requests per minute
    })
  }),
  scheduler: z.object({
    timezone: z.string().default('Asia/Shanghai'),
    max_concurrent_jobs: z.number().default(5)
  })
});

class ConfigManager {
  private config: AppConfig;

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): AppConfig {
    // 从环境变量加载配置
    const envConfig = {
      bot: {
        token: process.env.TG_BOT_TOKEN || '',
        polling: process.env.TG_BOT_POLLING !== 'false',
        webhook_url: process.env.TG_BOT_WEBHOOK_URL
      },
      database: {
        path: process.env.DB_PATH || './data/bot.db',
        backup_interval: parseInt(process.env.DB_BACKUP_INTERVAL || '86400000'),
        max_connections: parseInt(process.env.DB_MAX_CONNECTIONS || '10')
      },
      logging: {
        level: (process.env.LOG_LEVEL as any) || 'info',
        file: process.env.LOG_FILE,
        console: process.env.LOG_CONSOLE !== 'false',
        max_files: parseInt(process.env.LOG_MAX_FILES || '5'),
        max_size: process.env.LOG_MAX_SIZE || '10MB'
      },
      coingecko: {
        api_key: process.env.COINGECKO_API_KEY,
        base_url: process.env.COINGECKO_BASE_URL || 'https://api.coingecko.com/api/v3',
        rate_limit: parseInt(process.env.COINGECKO_RATE_LIMIT || '50')
      },
      exchanges: {
        binance: {
          base_url: process.env.BINANCE_BASE_URL || 'https://fapi.binance.com',
          rate_limit: parseInt(process.env.BINANCE_RATE_LIMIT || '1200')
        },
        okx: {
          base_url: process.env.OKX_BASE_URL || 'https://www.okx.com',
          rate_limit: parseInt(process.env.OKX_RATE_LIMIT || '600')
        },
        bybit: {
          base_url: process.env.BYBIT_BASE_URL || 'https://api.bybit.com',
          rate_limit: parseInt(process.env.BYBIT_RATE_LIMIT || '600')
        }
      },
      scheduler: {
        timezone: process.env.SCHEDULER_TIMEZONE || 'Asia/Shanghai',
        max_concurrent_jobs: parseInt(process.env.SCHEDULER_MAX_JOBS || '5')
      }
    };

    // 验证配置
    const result = AppConfigSchema.safeParse(envConfig);
    if (!result.success) {
      console.error('Configuration validation failed:', result.error.format());
      throw new Error('Invalid configuration');
    }

    return result.data;
  }

  getConfig(): AppConfig {
    return this.config;
  }

  getBotConfig() {
    return {
      token: this.config.bot.token,
      polling: this.config.bot.polling,
      webhook_url: this.config.bot.webhook_url,
      admin_users: [],
      max_users: 1000,
      rate_limit: {
        window_ms: 60000,
        max_requests: 20
      },
      features: {
        price_alerts: true,
        trending_coins: true,
        price_comparison: true,
        funding_rates: true
      }
    };
  }

  getDatabaseConfig() {
    return this.config.database;
  }

  getLoggingConfig() {
    return this.config.logging;
  }

  getCoinGeckoConfig() {
    return this.config.coingecko;
  }

  getExchangeConfig(exchange: 'binance' | 'okx' | 'bybit') {
    return this.config.exchanges[exchange];
  }

  getSchedulerConfig() {
    return this.config.scheduler;
  }

  // 更新配置（运行时）
  updateConfig(updates: Partial<AppConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  // 验证必需的环境变量
  validateRequiredEnvVars(): void {
    const required = ['TG_BOT_TOKEN'];
    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }

  // 获取环境信息
  getEnvironment(): 'development' | 'production' | 'test' {
    return (process.env.NODE_ENV as any) || 'development';
  }

  isDevelopment(): boolean {
    return this.getEnvironment() === 'development';
  }

  isProduction(): boolean {
    return this.getEnvironment() === 'production';
  }

  isTest(): boolean {
    return this.getEnvironment() === 'test';
  }
}

// 单例模式
let configInstance: ConfigManager | null = null;

export function createConfig(): ConfigManager {
  if (!configInstance) {
    configInstance = new ConfigManager();
  }
  return configInstance;
}

export function getConfig(): ConfigManager {
  if (!configInstance) {
    configInstance = new ConfigManager();
  }
  return configInstance;
}

export { ConfigManager };
