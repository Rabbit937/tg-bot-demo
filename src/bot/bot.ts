import TelegramBot from 'node-telegram-bot-api';
import { DatabaseService } from '../services/database.js';
import { CoinGeckoService } from '../services/coingecko.js';
import { PriceComparisonService } from '../services/priceComparison.js';
import { BotConfig, CommandHandler, CallbackHandler } from '../types/bot.js';
import { getLogger } from '../utils/logger.js';

// 导入命令处理器
import { handleStart } from './commands/start.js';
import { handleSubscribe } from './commands/subscribe.js';
import { handleUnsubscribe } from './commands/unsubscribe.js';
import { handleHelp } from './commands/help.js';
import { handleList, handleStatus } from './commands/list.js';

export class TelegramBotService {
  private bot: TelegramBot;
  private db: DatabaseService;
  private coinGecko: CoinGeckoService;
  private priceComparison: PriceComparisonService;
  private logger = getLogger();
  private commandHandlers: Map<string, CommandHandler> = new Map();
  private callbackHandlers: Map<string, CallbackHandler> = new Map();

  constructor(
    config: BotConfig,
    db: DatabaseService,
    coinGecko: CoinGeckoService,
    priceComparison: PriceComparisonService
  ) {
    this.bot = new TelegramBot(config.token, { polling: config.polling });
    this.db = db;
    this.coinGecko = coinGecko;
    this.priceComparison = priceComparison;

    this.setupCommandHandlers();
    this.setupCallbackHandlers();
    this.setupEventHandlers();
  }

  private setupCommandHandlers(): void {
    // 注册命令处理器
    this.commandHandlers.set('/start', {
      command: '/start' as any,
      description: '开始使用机器人',
      handler: async (bot, msg, args) => {
        await handleStart(bot, msg, this.db);
      }
    });

    this.commandHandlers.set('/help', {
      command: '/help' as any,
      description: '显示帮助信息',
      handler: async (bot, msg, args) => {
        await handleHelp(bot, msg);
      }
    });

    this.commandHandlers.set('/subscribe', {
      command: '/subscribe' as any,
      description: '添加订阅',
      handler: async (bot, msg, args) => {
        await handleSubscribe(bot, msg, args, this.db);
      }
    });

    this.commandHandlers.set('/unsubscribe', {
      command: '/unsubscribe' as any,
      description: '取消订阅',
      handler: async (bot, msg, args) => {
        await handleUnsubscribe(bot, msg, args, this.db);
      }
    });

    this.commandHandlers.set('/list', {
      command: '/list' as any,
      description: '查看订阅列表',
      handler: async (bot, msg, args) => {
        await handleList(bot, msg, this.db);
      }
    });

    this.commandHandlers.set('/status', {
      command: '/status' as any,
      description: '查看用户状态',
      handler: async (bot, msg, args) => {
        await handleStatus(bot, msg, this.db);
      }
    });
  }

  private setupCallbackHandlers(): void {
    // 订阅相关回调
    this.callbackHandlers.set('add_subscription', {
      pattern: 'add_subscription',
      handler: async (bot, query) => {
        await this.handleAddSubscriptionCallback(query);
      }
    });

    this.callbackHandlers.set('list_subscriptions', {
      pattern: 'list_subscriptions',
      handler: async (bot, query) => {
        await this.handleListSubscriptionsCallback(query);
      }
    });

    // 订阅类型选择回调
    this.callbackHandlers.set('subscribe_', {
      pattern: 'subscribe_',
      handler: async (bot, query) => {
        await this.handleSubscribeTypeCallback(query);
      }
    });

    // 取消订阅回调
    this.callbackHandlers.set('unsubscribe_', {
      pattern: 'unsubscribe_',
      handler: async (bot, query) => {
        await this.handleUnsubscribeTypeCallback(query);
      }
    });
  }

  private setupEventHandlers(): void {
    // 处理文本消息
    this.bot.on('message', async (msg) => {
      if (!msg.text) return;

      const userId = msg.from?.id;
      const chatId = msg.chat.id;

      if (!userId) return;

      try {
        // 解析命令
        const parts = msg.text.trim().split(' ');
        const command = parts[0].toLowerCase();
        const args = parts.slice(1);

        // 查找命令处理器
        const handler = this.commandHandlers.get(command);
        if (handler) {
          await handler.handler(this.bot, msg, args);
        } else if (msg.text.startsWith('/')) {
          // 未知命令
          await this.bot.sendMessage(chatId, '❌ 未知命令。使用 /help 查看可用命令。');
        }
      } catch (error) {
        this.logger.error('Error handling message', { userId, chatId, error: (error as Error).message });
        await this.bot.sendMessage(chatId, '❌ 处理消息时发生错误，请稍后重试。');
      }
    });

    // 处理回调查询
    this.bot.on('callback_query', async (query) => {
      const userId = query.from.id;
      const chatId = query.message?.chat.id;
      const data = query.data;

      if (!data || !chatId) return;

      try {
        // 查找回调处理器
        let handled = false;
        for (const [pattern, handler] of this.callbackHandlers) {
          if (data.startsWith(pattern)) {
            await handler.handler(this.bot, query);
            handled = true;
            break;
          }
        }

        if (!handled) {
          await this.bot.answerCallbackQuery(query.id, { text: '❌ 未知操作' });
        }
      } catch (error) {
        this.logger.error('Error handling callback query', { userId, chatId, data, error: (error as Error).message });
        await this.bot.answerCallbackQuery(query.id, { text: '❌ 操作失败，请稍后重试' });
      }
    });

    // 错误处理
    this.bot.on('polling_error', (error) => {
      this.logger.error('Polling error', { error: error.message });
    });

    this.bot.on('error', (error) => {
      this.logger.error('Bot error', { error: error.message });
    });
  }

  // 回调处理方法
  private async handleAddSubscriptionCallback(query: TelegramBot.CallbackQuery): Promise<void> {
    const chatId = query.message?.chat.id;
    if (!chatId) return;

    await this.bot.answerCallbackQuery(query.id);
    
    // 重新发送订阅选择消息
    const msg = { chat: { id: chatId }, from: query.from } as TelegramBot.Message;
    await handleSubscribe(this.bot, msg, [], this.db);
  }

  private async handleListSubscriptionsCallback(query: TelegramBot.CallbackQuery): Promise<void> {
    const chatId = query.message?.chat.id;
    if (!chatId) return;

    await this.bot.answerCallbackQuery(query.id);
    
    // 重新发送订阅列表
    const msg = { chat: { id: chatId }, from: query.from } as TelegramBot.Message;
    await handleList(this.bot, msg, this.db);
  }

  private async handleSubscribeTypeCallback(query: TelegramBot.CallbackQuery): Promise<void> {
    const chatId = query.message?.chat.id;
    const data = query.data;
    if (!chatId || !data) return;

    const subscriptionType = data.replace('subscribe_', '');
    
    await this.bot.answerCallbackQuery(query.id, { text: '正在添加订阅...' });
    
    // 执行订阅
    const msg = { chat: { id: chatId }, from: query.from } as TelegramBot.Message;
    await handleSubscribe(this.bot, msg, [subscriptionType], this.db);
  }

  private async handleUnsubscribeTypeCallback(query: TelegramBot.CallbackQuery): Promise<void> {
    const chatId = query.message?.chat.id;
    const data = query.data;
    if (!chatId || !data) return;

    const subscriptionType = data.replace('unsubscribe_', '');
    
    await this.bot.answerCallbackQuery(query.id, { text: '正在取消订阅...' });
    
    // 执行取消订阅
    const msg = { chat: { id: chatId }, from: query.from } as TelegramBot.Message;
    await handleUnsubscribe(this.bot, msg, [subscriptionType], this.db);
  }

  // 发送消息方法
  async sendMessage(
    chatId: number, 
    text: string, 
    options?: TelegramBot.SendMessageOptions
  ): Promise<TelegramBot.Message> {
    return this.bot.sendMessage(chatId, text, options);
  }

  // 广播消息给所有订阅用户
  async broadcastToSubscribers(
    subscriptionType: string,
    message: string,
    options?: TelegramBot.SendMessageOptions
  ): Promise<void> {
    try {
      const subscriptions = await this.db.getActiveSubscriptions(subscriptionType);
      
      for (const subscription of subscriptions) {
        try {
          await this.bot.sendMessage(subscription.chat_id, message, options);
          
          // 记录推送历史
          await this.db.addRecord({
            user_id: subscription.user_id,
            chat_id: subscription.chat_id,
            subscription_type: subscriptionType,
            content: message,
            success: true
          });
          
          // 避免触发速率限制
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          this.logger.error('Failed to send broadcast message', {
            userId: subscription.user_id,
            chatId: subscription.chat_id,
            subscriptionType,
            error: (error as Error).message
          });
          
          // 记录失败的推送
          await this.db.addRecord({
            user_id: subscription.user_id,
            chat_id: subscription.chat_id,
            subscription_type: subscriptionType,
            content: message,
            success: false,
            error_message: (error as Error).message
          });
        }
      }
      
      this.logger.info('Broadcast completed', { 
        subscriptionType, 
        totalSubscribers: subscriptions.length 
      });
    } catch (error) {
      this.logger.error('Failed to broadcast message', { 
        subscriptionType, 
        error: (error as Error).message 
      });
    }
  }

  // 获取机器人信息
  async getBotInfo(): Promise<TelegramBot.User> {
    return this.bot.getMe();
  }

  // 停止机器人
  stop(): void {
    this.bot.stopPolling();
    this.logger.info('Bot stopped');
  }

  // 获取机器人实例（用于定时任务等）
  getBot(): TelegramBot {
    return this.bot;
  }
}
