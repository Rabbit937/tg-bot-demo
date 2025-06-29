import TelegramBot from 'node-telegram-bot-api';
import { DatabaseService } from '../../services/database.js';
import { SubscriptionType } from '../../types/subscription.js';
import { InlineKeyboardBuilder } from '../../types/bot.js';
import { getLogger } from '../../utils/logger.js';

export async function handleUnsubscribe(
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
    // 获取用户现有订阅
    const subscriptions = await db.getUserSubscriptions(userId);
    
    if (subscriptions.length === 0) {
      await bot.sendMessage(chatId, '📭 您还没有任何订阅。使用 /subscribe 开始订阅。');
      return;
    }

    // 如果没有参数，显示订阅列表供选择
    if (args.length === 0) {
      await showUnsubscribeOptions(bot, chatId, subscriptions);
      return;
    }

    const subscriptionType = args[0].toLowerCase();
    
    // 验证订阅类型
    const validTypes = Object.values(SubscriptionType);
    if (!validTypes.includes(subscriptionType as SubscriptionType)) {
      await bot.sendMessage(chatId, '❌ 无效的订阅类型。请使用 /unsubscribe 查看可用选项。');
      return;
    }

    // 检查是否已订阅
    const existingSubscription = subscriptions.find(
      sub => sub.subscription_type === subscriptionType
    );

    if (!existingSubscription) {
      await bot.sendMessage(chatId, '❌ 您没有订阅此类型的推送。使用 /list 查看现有订阅。');
      return;
    }

    // 取消订阅
    const success = await db.removeSubscription(userId, subscriptionType);
    
    if (success) {
      const typeNames = {
        [SubscriptionType.CRYPTO_PRICES]: '加密货币价格',
        [SubscriptionType.TRENDING_COINS]: '热门币种',
        [SubscriptionType.PRICE_COMPARISON]: '价格比较',
        [SubscriptionType.FUNDING_RATES]: '资金费率',
        [SubscriptionType.PRICE_ALERTS]: '价格警报'
      };

      const successMessage = `
✅ <b>取消订阅成功！</b>

📋 已取消：${typeNames[subscriptionType as SubscriptionType]}

您可以随时使用 /subscribe 重新订阅。
      `.trim();

      const keyboard = new InlineKeyboardBuilder()
        .addRow([
          { text: '📋 查看剩余订阅', callback_data: 'list_subscriptions' },
          { text: '➕ 添加新订阅', callback_data: 'add_subscription' }
        ])
        .build();

      await bot.sendMessage(chatId, successMessage, {
        parse_mode: 'HTML',
        reply_markup: keyboard
      });

      logger.logSubscriptionEvent(userId, subscriptionType, 'unsubscribed');
    } else {
      await bot.sendMessage(chatId, '❌ 取消订阅失败，请稍后重试');
    }

    logger.logBotMessage(userId, chatId, '/unsubscribe', success);
  } catch (error) {
    logger.error('Failed to handle unsubscribe command', { userId, error: (error as Error).message });
    await bot.sendMessage(chatId, '❌ 处理命令时发生错误，请稍后重试');
    logger.logBotMessage(userId, chatId, '/unsubscribe', false);
  }
}

async function showUnsubscribeOptions(
  bot: TelegramBot, 
  chatId: number, 
  subscriptions: any[]
): Promise<void> {
  const typeNames = {
    [SubscriptionType.CRYPTO_PRICES]: '🪙 加密货币价格',
    [SubscriptionType.TRENDING_COINS]: '🔥 热门币种',
    [SubscriptionType.PRICE_COMPARISON]: '💱 价格比较',
    [SubscriptionType.FUNDING_RATES]: '💰 资金费率',
    [SubscriptionType.PRICE_ALERTS]: '⚡ 价格警报'
  };

  let message = '📋 <b>选择要取消的订阅</b>\n\n';
  message += '您当前的订阅：\n\n';

  const keyboard = new InlineKeyboardBuilder();
  const buttons: TelegramBot.InlineKeyboardButton[] = [];

  subscriptions.forEach((sub, index) => {
    const typeName = typeNames[sub.subscription_type as SubscriptionType] || sub.subscription_type;
    const status = sub.is_active ? '✅' : '❌';
    
    message += `${index + 1}. ${typeName} ${status}\n`;
    
    buttons.push({
      text: typeName,
      callback_data: `unsubscribe_${sub.subscription_type}`
    });
  });

  // 每行最多2个按钮
  for (let i = 0; i < buttons.length; i += 2) {
    const row = buttons.slice(i, i + 2);
    keyboard.addRow(row);
  }

  // 添加取消按钮
  keyboard.addRow([{ text: '❌ 取消', callback_data: 'cancel_unsubscribe' }]);

  message += '\n点击下方按钮选择要取消的订阅：';

  await bot.sendMessage(chatId, message, {
    parse_mode: 'HTML',
    reply_markup: keyboard.build()
  });
}
