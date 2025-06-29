import { z } from 'zod';

// 订阅类型枚举
export enum SubscriptionType {
  CRYPTO_PRICES = 'crypto_prices',
  TRENDING_COINS = 'trending_coins',
  PRICE_COMPARISON = 'price_comparison',
  FUNDING_RATES = 'funding_rates',
  PRICE_ALERTS = 'price_alerts'
}

// 推送频率枚举
export enum PushFrequency {
  EVERY_5_MINUTES = '*/5 * * * *',
  EVERY_15_MINUTES = '*/15 * * * *',
  EVERY_30_MINUTES = '*/30 * * * *',
  HOURLY = '0 * * * *',
  EVERY_2_HOURS = '0 */2 * * *',
  EVERY_4_HOURS = '0 */4 * * *',
  EVERY_6_HOURS = '0 */6 * * *',
  EVERY_12_HOURS = '0 */12 * * *',
  DAILY = '0 0 * * *',
  TWICE_DAILY = '0 0,12 * * *'
}

// 用户订阅配置
export const UserSubscriptionSchema = z.object({
  user_id: z.number(),
  chat_id: z.number(),
  subscription_type: z.nativeEnum(SubscriptionType),
  is_active: z.boolean().default(true),
  frequency: z.nativeEnum(PushFrequency).default(PushFrequency.HOURLY),
  symbols: z.array(z.string()).default([]),
  exchanges: z.array(z.string()).default([]),
  price_threshold: z.number().optional(),
  created_at: z.string(),
  updated_at: z.string()
});

// 用户配置
export const UserConfigSchema = z.object({
  user_id: z.number(),
  chat_id: z.number(),
  username: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  language_code: z.string().default('zh'),
  timezone: z.string().default('Asia/Shanghai'),
  is_premium: z.boolean().default(false),
  max_subscriptions: z.number().default(5),
  created_at: z.string(),
  updated_at: z.string()
});

// 价格警报配置
export const PriceAlertSchema = z.object({
  id: z.string(),
  user_id: z.number(),
  chat_id: z.number(),
  symbol: z.string(),
  target_price: z.number(),
  condition: z.enum(['above', 'below']),
  is_active: z.boolean().default(true),
  triggered: z.boolean().default(false),
  created_at: z.string(),
  triggered_at: z.string().optional()
});

// 推送历史记录
export const PushHistorySchema = z.object({
  id: z.string(),
  user_id: z.number(),
  chat_id: z.number(),
  subscription_type: z.nativeEnum(SubscriptionType),
  content: z.string(),
  success: z.boolean(),
  error_message: z.string().optional(),
  timestamp: z.string()
});

// 导出类型
export type UserSubscription = z.infer<typeof UserSubscriptionSchema>;
export type UserConfig = z.infer<typeof UserConfigSchema>;
export type PriceAlert = z.infer<typeof PriceAlertSchema>;
export type PushHistory = z.infer<typeof PushHistorySchema>;

// 订阅管理相关类型
export interface SubscriptionManager {
  addSubscription(subscription: Omit<UserSubscription, 'created_at' | 'updated_at'>): Promise<boolean>;
  removeSubscription(userId: number, subscriptionType: SubscriptionType): Promise<boolean>;
  getUserSubscriptions(userId: number): Promise<UserSubscription[]>;
  updateSubscription(userId: number, subscriptionType: SubscriptionType, updates: Partial<UserSubscription>): Promise<boolean>;
  getActiveSubscriptions(subscriptionType?: SubscriptionType): Promise<UserSubscription[]>;
}

// 用户管理相关类型
export interface UserManager {
  createUser(user: Omit<UserConfig, 'created_at' | 'updated_at'>): Promise<boolean>;
  getUser(userId: number): Promise<UserConfig | null>;
  updateUser(userId: number, updates: Partial<UserConfig>): Promise<boolean>;
  deleteUser(userId: number): Promise<boolean>;
}

// 价格警报管理相关类型
export interface AlertManager {
  createAlert(alert: Omit<PriceAlert, 'id' | 'created_at'>): Promise<string>;
  getUserAlerts(userId: number): Promise<PriceAlert[]>;
  updateAlert(alertId: string, updates: Partial<PriceAlert>): Promise<boolean>;
  deleteAlert(alertId: string): Promise<boolean>;
  getActiveAlerts(): Promise<PriceAlert[]>;
  triggerAlert(alertId: string): Promise<boolean>;
}

// 推送历史管理相关类型
export interface PushHistoryManager {
  addRecord(record: Omit<PushHistory, 'id' | 'timestamp'>): Promise<string>;
  getUserHistory(userId: number, limit?: number): Promise<PushHistory[]>;
  getHistoryByType(subscriptionType: SubscriptionType, limit?: number): Promise<PushHistory[]>;
  cleanOldRecords(daysToKeep: number): Promise<number>;
}
