import * as cron from 'node-cron';
import { DatabaseService } from './database.js';
import { CoinGeckoService } from './coingecko.js';
import { PriceComparisonService } from './priceComparison.js';
import { TelegramBotService } from '../bot/bot.js';
import { SubscriptionType, PushFrequency } from '../types/subscription.js';
import { ScheduledTask, TaskResult } from '../types/index.js';
import { formatter } from '../utils/formatter.js';
import { getLogger } from '../utils/logger.js';
import { sleep } from '../utils/index.js';

export interface SchedulerConfig {
  timezone: string;
  max_concurrent_jobs: number;
}

export class SchedulerService {
  private tasks: Map<string, cron.ScheduledTask> = new Map();
  private runningTasks: Set<string> = new Set();
  private logger = getLogger();
  private config: SchedulerConfig;
  private db: DatabaseService;
  private coinGecko: CoinGeckoService;
  private priceComparison: PriceComparisonService;
  private bot: TelegramBotService;

  constructor(
    config: SchedulerConfig,
    db: DatabaseService,
    coinGecko: CoinGeckoService,
    priceComparison: PriceComparisonService,
    bot: TelegramBotService
  ) {
    this.config = config;
    this.db = db;
    this.coinGecko = coinGecko;
    this.priceComparison = priceComparison;
    this.bot = bot;

    this.setupDefaultTasks();
  }

  private setupDefaultTasks(): void {
    // 设置默认的定时任务
    this.scheduleTask({
      id: 'trending_coins_hourly',
      name: '热门币种推送',
      cron: PushFrequency.HOURLY,
      handler: () => this.pushTrendingCoins(),
      enabled: true,
      error_count: 0,
      max_retries: 3
    });

    this.scheduleTask({
      id: 'price_comparison_hourly',
      name: '价格比较推送',
      cron: PushFrequency.HOURLY,
      handler: () => this.pushPriceComparison(),
      enabled: true,
      error_count: 0,
      max_retries: 3
    });

    this.scheduleTask({
      id: 'funding_rates_every_4h',
      name: '资金费率推送',
      cron: PushFrequency.EVERY_4_HOURS,
      handler: () => this.pushFundingRates(),
      enabled: true,
      error_count: 0,
      max_retries: 3
    });

    this.scheduleTask({
      id: 'crypto_prices_hourly',
      name: '加密货币价格推送',
      cron: PushFrequency.HOURLY,
      handler: () => this.pushCryptoPrices(),
      enabled: true,
      error_count: 0,
      max_retries: 3
    });

    this.scheduleTask({
      id: 'check_price_alerts',
      name: '价格警报检查',
      cron: PushFrequency.EVERY_5_MINUTES,
      handler: () => this.checkPriceAlerts(),
      enabled: true,
      error_count: 0,
      max_retries: 3
    });

    // 数据库清理任务
    this.scheduleTask({
      id: 'cleanup_old_records',
      name: '清理旧记录',
      cron: PushFrequency.DAILY,
      handler: () => this.cleanupOldRecords(),
      enabled: true,
      error_count: 0,
      max_retries: 1
    });
  }

  scheduleTask(task: ScheduledTask): void {
    if (this.tasks.has(task.id)) {
      this.logger.warn('Task already exists, replacing', { taskId: task.id });
      this.unscheduleTask(task.id);
    }

    const cronTask = cron.schedule(task.cron, async () => {
      await this.executeTask(task);
    }, {
      scheduled: task.enabled,
      timezone: this.config.timezone
    });

    this.tasks.set(task.id, cronTask);
    this.logger.info('Task scheduled', { 
      taskId: task.id, 
      name: task.name, 
      cron: task.cron,
      enabled: task.enabled
    });
  }

  unscheduleTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.stop();
      task.destroy();
      this.tasks.delete(taskId);
      this.logger.info('Task unscheduled', { taskId });
    }
  }

  private async executeTask(task: ScheduledTask): Promise<TaskResult> {
    const startTime = Date.now();
    
    // 检查并发限制
    if (this.runningTasks.size >= this.config.max_concurrent_jobs) {
      this.logger.warn('Max concurrent jobs reached, skipping task', { taskId: task.id });
      return {
        task_id: task.id,
        success: false,
        duration: 0,
        error: 'Max concurrent jobs reached',
        timestamp: Date.now()
      };
    }

    this.runningTasks.add(task.id);
    
    try {
      this.logger.info('Executing task', { taskId: task.id, name: task.name });
      
      await task.handler();
      
      const duration = Date.now() - startTime;
      const result: TaskResult = {
        task_id: task.id,
        success: true,
        duration,
        timestamp: Date.now()
      };

      this.logger.logScheduledTask(task.name, true, duration);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = (error as Error).message;
      
      task.error_count++;
      
      const result: TaskResult = {
        task_id: task.id,
        success: false,
        duration,
        error: errorMessage,
        timestamp: Date.now()
      };

      this.logger.logScheduledTask(task.name, false, duration, errorMessage);
      
      // 如果错误次数超过最大重试次数，禁用任务
      if (task.error_count >= task.max_retries) {
        this.logger.error('Task disabled due to too many errors', { 
          taskId: task.id, 
          errorCount: task.error_count 
        });
        this.pauseTask(task.id);
      }
      
      return result;
    } finally {
      this.runningTasks.delete(task.id);
    }
  }

  // 推送热门币种
  private async pushTrendingCoins(): Promise<void> {
    const subscriptions = await this.db.getActiveSubscriptions(SubscriptionType.TRENDING_COINS);
    if (subscriptions.length === 0) return;

    const trendingCoins = await this.coinGecko.getTrendingCoins();
    if (trendingCoins.length === 0) return;

    const message = formatter.formatTrendingCoins(trendingCoins.slice(0, 10));
    
    await this.bot.broadcastToSubscribers(
      SubscriptionType.TRENDING_COINS,
      message,
      { parse_mode: 'HTML' }
    );
  }

  // 推送价格比较
  private async pushPriceComparison(): Promise<void> {
    const subscriptions = await this.db.getActiveSubscriptions(SubscriptionType.PRICE_COMPARISON);
    if (subscriptions.length === 0) return;

    // 获取热门币种进行比较
    const symbols = ['BTCUSDT', 'ETHUSDT', 'SUIUSDT'];
    
    for (const symbol of symbols) {
      try {
        const comparison = await this.priceComparison.comparePrices(symbol as any, false);
        if (!comparison) continue;

        const message = formatter.formatPriceComparison(comparison);
        
        await this.bot.broadcastToSubscribers(
          SubscriptionType.PRICE_COMPARISON,
          message,
          { parse_mode: 'HTML' }
        );

        // 避免API限制
        await sleep(1000);
      } catch (error) {
        this.logger.error('Failed to push price comparison', { symbol, error: (error as Error).message });
      }
    }
  }

  // 推送资金费率
  private async pushFundingRates(): Promise<void> {
    const subscriptions = await this.db.getActiveSubscriptions(SubscriptionType.FUNDING_RATES);
    if (subscriptions.length === 0) return;

    const symbols = ['BTCUSDT', 'ETHUSDT', 'SUIUSDT'];
    const allRates = [];

    for (const symbol of symbols) {
      try {
        const rates = await this.priceComparison.getAllFundingRates(symbol as any);
        allRates.push(...rates);
        await sleep(500);
      } catch (error) {
        this.logger.error('Failed to get funding rates', { symbol, error: (error as Error).message });
      }
    }

    if (allRates.length > 0) {
      const message = formatter.formatFundingRates(allRates);
      
      await this.bot.broadcastToSubscribers(
        SubscriptionType.FUNDING_RATES,
        message,
        { parse_mode: 'HTML' }
      );
    }
  }

  // 推送加密货币价格
  private async pushCryptoPrices(): Promise<void> {
    const subscriptions = await this.db.getActiveSubscriptions(SubscriptionType.CRYPTO_PRICES);
    if (subscriptions.length === 0) return;

    // 获取热门币种价格
    const coinIds = ['bitcoin', 'ethereum', 'sui'];
    
    try {
      const cryptoInfos = await this.coinGecko.getBatchCoinInfo(coinIds);
      
      for (const crypto of cryptoInfos) {
        const message = formatter.formatCryptoInfo(crypto);
        
        await this.bot.broadcastToSubscribers(
          SubscriptionType.CRYPTO_PRICES,
          message,
          { parse_mode: 'HTML' }
        );

        await sleep(500);
      }
    } catch (error) {
      this.logger.error('Failed to push crypto prices', { error: (error as Error).message });
    }
  }

  // 检查价格警报
  private async checkPriceAlerts(): Promise<void> {
    const alerts = await this.db.getActiveAlerts();
    if (alerts.length === 0) return;

    // 按币种分组
    const alertsBySymbol = new Map<string, typeof alerts>();
    alerts.forEach(alert => {
      const symbol = alert.symbol;
      if (!alertsBySymbol.has(symbol)) {
        alertsBySymbol.set(symbol, []);
      }
      alertsBySymbol.get(symbol)!.push(alert);
    });

    // 检查每个币种的价格
    for (const [symbol, symbolAlerts] of alertsBySymbol) {
      try {
        // 获取当前价格（使用CoinGecko）
        const prices = await this.coinGecko.getSimplePrices([symbol.toLowerCase()]);
        const currentPrice = prices[symbol.toLowerCase()]?.usd;
        
        if (!currentPrice) continue;

        // 检查每个警报
        for (const alert of symbolAlerts) {
          let triggered = false;
          
          if (alert.condition === 'above' && currentPrice >= alert.target_price) {
            triggered = true;
          } else if (alert.condition === 'below' && currentPrice <= alert.target_price) {
            triggered = true;
          }

          if (triggered) {
            // 发送警报消息
            const message = `
🚨 <b>价格警报触发！</b>

💰 币种：<b>${alert.symbol.toUpperCase()}</b>
🎯 目标价格：<code>$${alert.target_price}</code>
📊 当前价格：<code>$${currentPrice}</code>
📈 条件：${alert.condition === 'above' ? '高于' : '低于'}目标价格

⏰ 触发时间：${new Date().toLocaleString('zh-CN')}
            `.trim();

            try {
              await this.bot.sendMessage(alert.chat_id, message, { parse_mode: 'HTML' });
              
              // 标记警报为已触发
              await this.db.triggerAlert(alert.id);
              
              this.logger.info('Price alert triggered', { 
                alertId: alert.id, 
                symbol: alert.symbol, 
                targetPrice: alert.target_price,
                currentPrice 
              });
            } catch (error) {
              this.logger.error('Failed to send price alert', { 
                alertId: alert.id, 
                error: (error as Error).message 
              });
            }
          }
        }

        await sleep(200);
      } catch (error) {
        this.logger.error('Failed to check price alerts for symbol', { 
          symbol, 
          error: (error as Error).message 
        });
      }
    }
  }

  // 清理旧记录
  private async cleanupOldRecords(): Promise<void> {
    try {
      const deletedCount = await this.db.cleanOldRecords(30); // 保留30天
      this.logger.info('Cleaned up old records', { deletedCount });
    } catch (error) {
      this.logger.error('Failed to cleanup old records', { error: (error as Error).message });
    }
  }

  // 任务管理方法
  pauseTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.stop();
      this.logger.info('Task paused', { taskId });
    }
  }

  resumeTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.start();
      this.logger.info('Task resumed', { taskId });
    }
  }

  getTaskStatus(): Array<{ id: string; running: boolean; next_run?: Date }> {
    const status = [];
    for (const [id, task] of this.tasks) {
      status.push({
        id,
        running: this.runningTasks.has(id),
        next_run: (task as any).nextDate?.()
      });
    }
    return status;
  }

  // 停止所有任务
  stop(): void {
    for (const [id, task] of this.tasks) {
      task.stop();
      task.destroy();
    }
    this.tasks.clear();
    this.runningTasks.clear();
    this.logger.info('All scheduled tasks stopped');
  }
}
