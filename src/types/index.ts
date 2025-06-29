// 导出所有类型定义
export * from './crypto.js';
export * from './subscription.js';
export * from './bot.js';

// 通用类型
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
}

export interface DatabaseConfig {
  path: string;
  backup_interval?: number;
  max_connections?: number;
}

export interface LogConfig {
  level: 'error' | 'warn' | 'info' | 'debug';
  file?: string;
  console: boolean;
  max_files?: number;
  max_size?: string;
}

export interface AppConfig {
  bot: {
    token: string;
    polling: boolean;
    webhook_url?: string;
  };
  database: DatabaseConfig;
  logging: LogConfig;
  coingecko: {
    api_key?: string;
    base_url: string;
    rate_limit: number;
  };
  exchanges: {
    binance: {
      base_url: string;
      rate_limit: number;
    };
    okx: {
      base_url: string;
      rate_limit: number;
    };
    bybit: {
      base_url: string;
      rate_limit: number;
    };
  };
  scheduler: {
    timezone: string;
    max_concurrent_jobs: number;
  };
}

// 错误类型
export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 'DATABASE_ERROR', 500, details);
    this.name = 'DatabaseError';
  }
}

export class ApiError extends AppError {
  constructor(message: string, statusCode: number = 500, details?: any) {
    super(message, 'API_ERROR', statusCode, details);
    this.name = 'ApiError';
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded', details?: any) {
    super(message, 'RATE_LIMIT_ERROR', 429, details);
    this.name = 'RateLimitError';
  }
}

// 工具类型
export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// 分页类型
export interface PaginationOptions {
  page: number;
  limit: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
}

// 缓存类型
export interface CacheOptions {
  ttl: number; // Time to live in seconds
  max_size?: number;
  strategy?: 'lru' | 'fifo';
}

export interface CacheEntry<T> {
  value: T;
  expires: number;
  created: number;
}

// 任务调度类型
export interface ScheduledTask {
  id: string;
  name: string;
  cron: string;
  handler: () => Promise<void>;
  enabled: boolean;
  last_run?: number;
  next_run?: number;
  error_count: number;
  max_retries: number;
}

export interface TaskResult {
  task_id: string;
  success: boolean;
  duration: number;
  error?: string;
  timestamp: number;
}
