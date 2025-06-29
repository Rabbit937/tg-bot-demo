import TelegramBot from 'node-telegram-bot-api';
import { DatabaseService } from '../../services/database.js';
import { SubscriptionType, PushFrequency } from '../../types/subscription.js';
import { InlineKeyboardBuilder } from '../../types/bot.js';
import { getLogger } from '../../utils/logger.js';

export async function handleSubscribe(
  bot: TelegramBot, 
  msg: TelegramBot.Message, 
  args: string[],
  db: DatabaseService
): Promise<void> {
  const logger = getLogger();
  const userId = msg.from?.id;
  const chatId = msg.chat.id;

  if (!userId) {
    await bot.sendMessage(chatId, '❌ 无法获取用户信息');
    return;
  }

  try {
    // 检查用户是否存在
    const user = await db.getUser(userId);
    if (!user) {
      await bot.sendMessage(chatId, '❌ 请先使用 /start 命令注册');
      return;
    }

    // 检查现有订阅数量
    const existingSubscriptions = await db.getUserSubscriptions(userId);
    if (existingSubscriptions.length >= user.max_subscriptions) {
      await bot.sendMessage(chatId, `❌ 您已达到最大订阅数量限制 (${user.max_subscriptions})。请先取消一些订阅。`);
      return;
    }

    // 如果没有参数，显示订阅类型选择
    if (args.length === 0) {
      await showSubscriptionTypes(bot, chatId);
      return;
    }

    const subscriptionType = args[0].toLowerCase();
    
    // 验证订阅类型
    const validTypes = Object.values(SubscriptionType);
    if (!validTypes.includes(subscriptionType as SubscriptionType)) {
      await bot.sendMessage(chatId, '❌ 无效的订阅类型。请使用 /subscribe 查看可用选项。');
      return;
    }

    // 检查是否已经订阅
    const existingSubscription = existingSubscriptions.find(
      sub => sub.subscription_type === subscriptionType
    );

    if (existingSubscription) {
      await bot.sendMessage(chatId, '❌ 您已经订阅了此类型的推送。使用 /list 查看现有订阅。');
      return;
    }

    // 创建订阅
    await db.addSubscription({
      user_id: userId,
      chat_id: chatId,
      subscription_type: subscriptionType as SubscriptionType,
      is_active: true,
      frequency: PushFrequency.HOURLY,
      symbols: getDefaultSymbols(subscriptionType as SubscriptionType),
      exchanges: getDefaultExchanges(subscriptionType as SubscriptionType)
    });

    const typeNames = {
      [SubscriptionType.CRYPTO_PRICES]: '加密货币价格',
      [SubscriptionType.TRENDING_COINS]: '热门币种',
      [SubscriptionType.PRICE_COMPARISON]: '价格比较',
      [SubscriptionType.FUNDING_RATES]: '资金费率',
      [SubscriptionType.PRICE_ALERTS]: '价格警报'
    };

    const successMessage = `
✅ <b>订阅成功！</b>

📋 订阅类型：${typeNames[subscriptionType as SubscriptionType]}
⏰ 推送频率：每小时
🔔 状态：已激活

您可以使用以下命令管理订阅：
• /list - 查看所有订阅
• /settings - 修改推送频率
• /unsubscribe - 取消订阅
    `.trim();

    const keyboard = new InlineKeyboardBuilder()
      .addRow([
        { text: '📋 查看订阅', callback_data: 'list_subscriptions' },
        { text: '⚙️ 设置频率', callback_data: `set_frequency_${subscriptionType}` }
      ])
      .build();

    await bot.sendMessage(chatId, successMessage, {
      parse_mode: 'HTML',
      reply_markup: keyboard
    });

    logger.logSubscriptionEvent(userId, subscriptionType, 'subscribed');
    logger.logBotMessage(userId, chatId, '/subscribe', true);
  } catch (error) {
    logger.error('Failed to handle subscribe command', { userId, error: (error as Error).message });
    await bot.sendMessage(chatId, '❌ 订阅失败，请稍后重试');
    logger.logBotMessage(userId, chatId, '/subscribe', false);
  }
}

async function showSubscriptionTypes(bot: TelegramBot, chatId: number): Promise<void> {
  const message = `
📋 <b>选择订阅类型</b>

请选择您想要订阅的推送类型：

🪙 <b>加密货币价格</b> - 定时推送主流币种价格信息
🔥 <b>热门币种</b> - 推送CoinGecko热门币种排行榜
💱 <b>价格比较</b> - 多交易所价格对比分析
💰 <b>资金费率</b> - 各交易所资金费率监控
⚡ <b>价格警报</b> - 自定义价格提醒服务

点击下方按钮选择订阅类型：
  `.trim();

  const keyboard = new InlineKeyboardBuilder()
    .addRow([
      { text: '🪙 加密货币价格', callback_data: 'subscribe_crypto_prices' },
      { text: '🔥 热门币种', callback_data: 'subscribe_trending_coins' }
    ])
    .addRow([
      { text: '💱 价格比较', callback_data: 'subscribe_price_comparison' },
      { text: '💰 资金费率', callback_data: 'subscribe_funding_rates' }
    ])
    .addRow([
      { text: '⚡ 价格警报', callback_data: 'subscribe_price_alerts' }
    ])
    .build();

  await bot.sendMessage(chatId, message, {
    parse_mode: 'HTML',
    reply_markup: keyboard
  });
}

function getDefaultSymbols(subscriptionType: SubscriptionType): string[] {
  switch (subscriptionType) {
    case SubscriptionType.CRYPTO_PRICES:
    case SubscriptionType.PRICE_COMPARISON:
    case SubscriptionType.FUNDING_RATES:
      return ['BTCUSDT', 'ETHUSDT', 'SUIUSDT'];
    case SubscriptionType.TRENDING_COINS:
    case SubscriptionType.PRICE_ALERTS:
    default:
      return [];
  }
}

function getDefaultExchanges(subscriptionType: SubscriptionType): string[] {
  switch (subscriptionType) {
    case SubscriptionType.PRICE_COMPARISON:
    case SubscriptionType.FUNDING_RATES:
      return ['binance', 'okx', 'bybit'];
    default:
      return [];
  }
}
