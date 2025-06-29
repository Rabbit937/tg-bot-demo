import { z } from 'zod';
import TelegramBot from 'node-telegram-bot-api';

// 机器人命令类型
export enum BotCommand {
  START = '/start',
  HELP = '/help',
  SUBSCRIBE = '/subscribe',
  UNSUBSCRIBE = '/unsubscribe',
  LIST = '/list',
  STATUS = '/status',
  SETTINGS = '/settings',
  ALERT = '/alert',
  PRICE = '/price',
  TRENDING = '/trending',
  COMPARE = '/compare'
}

// 命令参数类型
export const CommandArgsSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).default([]),
  userId: z.number(),
  chatId: z.number(),
  username: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional()
});

// 机器人响应类型
export const BotResponseSchema = z.object({
  text: z.string(),
  parse_mode: z.enum(['HTML', 'Markdown', 'MarkdownV2']).optional(),
  reply_markup: z.object({
    inline_keyboard: z.array(z.array(z.object({
      text: z.string(),
      callback_data: z.string().optional(),
      url: z.string().optional()
    })))
  }).optional(),
  disable_web_page_preview: z.boolean().optional()
});

// 回调查询数据类型
export const CallbackDataSchema = z.object({
  action: z.string(),
  type: z.string().optional(),
  value: z.string().optional(),
  page: z.number().optional()
});

// 机器人状态类型
export interface BotStatus {
  isRunning: boolean;
  uptime: number;
  totalUsers: number;
  activeSubscriptions: number;
  lastUpdate: string;
  version: string;
}

// 命令处理器接口
export interface CommandHandler {
  command: BotCommand;
  description: string;
  handler: (bot: TelegramBot, msg: TelegramBot.Message, args: string[]) => Promise<void>;
}

// 回调查询处理器接口
export interface CallbackHandler {
  pattern: string;
  handler: (bot: TelegramBot, query: TelegramBot.CallbackQuery) => Promise<void>;
}

// 消息处理器接口
export interface MessageHandler {
  pattern: RegExp;
  handler: (bot: TelegramBot, msg: TelegramBot.Message) => Promise<void>;
}

// 机器人配置类型
export const BotConfigSchema = z.object({
  token: z.string(),
  webhook_url: z.string().optional(),
  polling: z.boolean().default(true),
  admin_users: z.array(z.number()).default([]),
  max_users: z.number().default(1000),
  rate_limit: z.object({
    window_ms: z.number().default(60000),
    max_requests: z.number().default(20)
  }).default({}),
  features: z.object({
    price_alerts: z.boolean().default(true),
    trending_coins: z.boolean().default(true),
    price_comparison: z.boolean().default(true),
    funding_rates: z.boolean().default(true)
  }).default({})
});

// 用户会话类型
export const UserSessionSchema = z.object({
  userId: z.number(),
  chatId: z.number(),
  state: z.string().optional(),
  data: z.record(z.string(), z.any()).default({}),
  lastActivity: z.number(),
  expires: z.number().optional()
});

// 导出类型
export type CommandArgs = z.infer<typeof CommandArgsSchema>;
export type BotResponse = z.infer<typeof BotResponseSchema>;
export type CallbackData = z.infer<typeof CallbackDataSchema>;
export type BotConfig = z.infer<typeof BotConfigSchema>;
export type UserSession = z.infer<typeof UserSessionSchema>;

// 内联键盘构建器
export class InlineKeyboardBuilder {
  private keyboard: TelegramBot.InlineKeyboardButton[][] = [];

  addRow(buttons: TelegramBot.InlineKeyboardButton[]): this {
    this.keyboard.push(buttons);
    return this;
  }

  addButton(text: string, callbackData?: string, url?: string): this {
    const button: TelegramBot.InlineKeyboardButton = { text };
    if (callbackData) button.callback_data = callbackData;
    if (url) button.url = url;
    
    if (this.keyboard.length === 0) {
      this.keyboard.push([]);
    }
    this.keyboard[this.keyboard.length - 1].push(button);
    return this;
  }

  build(): TelegramBot.InlineKeyboardMarkup {
    return { inline_keyboard: this.keyboard };
  }
}

// 消息格式化工具
export interface MessageFormatter {
  formatPrice(price: number, currency?: string): string;
  formatPercentage(percentage: number): string;
  formatVolume(volume: number): string;
  formatMarketCap(marketCap: number): string;
  formatTimestamp(timestamp: number | string): string;
  escapeMarkdown(text: string): string;
  escapeHTML(text: string): string;
}
