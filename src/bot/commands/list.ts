import TelegramBot from 'node-telegram-bot-api';
import { DatabaseService } from '../../services/database.js';
import { SubscriptionType } from '../../types/subscription.js';
import { InlineKeyboardBuilder } from '../../types/bot.js';
import { formatter } from '../../utils/formatter.js';
import { getLogger } from '../../utils/logger.js';

export async function handleList(
  bot: TelegramBot, 
  msg: TelegramBot.Message, 
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
    // 获取用户订阅
    const subscriptions = await db.getUserSubscriptions(userId);
    
    if (subscriptions.length === 0) {
      const emptyMessage = `
📭 <b>您还没有任何订阅</b>

使用 /subscribe 命令开始订阅价格推送服务。

🔥 <b>推荐订阅</b>：
• 热门币种 - 了解市场热点
• 价格比较 - 寻找最优价格
• 加密货币价格 - 跟踪主流币种
      `.trim();

      const keyboard = new InlineKeyboardBuilder()
        .addRow([
          { text: '➕ 添加订阅', callback_data: 'add_subscription' },
          { text: '🔥 热门推荐', callback_data: 'recommended_subscriptions' }
        ])
        .build();

      await bot.sendMessage(chatId, emptyMessage, {
        parse_mode: 'HTML',
        reply_markup: keyboard
      });

      logger.logBotMessage(userId, chatId, '/list', true);
      return;
    }

    // 格式化订阅列表
    const message = formatter.formatSubscriptionList(subscriptions);
    
    // 创建管理按钮
    const keyboard = new InlineKeyboardBuilder();
    
    // 为每个订阅添加管理按钮
    const activeSubscriptions = subscriptions.filter(sub => sub.is_active);
    const inactiveSubscriptions = subscriptions.filter(sub => !sub.is_active);
    
    if (activeSubscriptions.length > 0) {
      // 添加暂停/恢复按钮
      const pauseButtons: TelegramBot.InlineKeyboardButton[] = [];
      activeSubscriptions.slice(0, 3).forEach(sub => { // 最多显示3个
        const typeNames = {
          [SubscriptionType.CRYPTO_PRICES]: '🪙',
          [SubscriptionType.TRENDING_COINS]: '🔥',
          [SubscriptionType.PRICE_COMPARISON]: '💱',
          [SubscriptionType.FUNDING_RATES]: '💰',
          [SubscriptionType.PRICE_ALERTS]: '⚡'
        };
        
        const emoji = typeNames[sub.subscription_type as SubscriptionType] || '📊';
        pauseButtons.push({
          text: `⏸️ ${emoji}`,
          callback_data: `pause_subscription_${sub.subscription_type}`
        });
      });
      
      if (pauseButtons.length > 0) {
        keyboard.addRow(pauseButtons);
      }
    }
    
    if (inactiveSubscriptions.length > 0) {
      // 添加恢复按钮
      const resumeButtons: TelegramBot.InlineKeyboardButton[] = [];
      inactiveSubscriptions.slice(0, 3).forEach(sub => {
        const typeNames = {
          [SubscriptionType.CRYPTO_PRICES]: '🪙',
          [SubscriptionType.TRENDING_COINS]: '🔥',
          [SubscriptionType.PRICE_COMPARISON]: '💱',
          [SubscriptionType.FUNDING_RATES]: '💰',
          [SubscriptionType.PRICE_ALERTS]: '⚡'
        };
        
        const emoji = typeNames[sub.subscription_type as SubscriptionType] || '📊';
        resumeButtons.push({
          text: `▶️ ${emoji}`,
          callback_data: `resume_subscription_${sub.subscription_type}`
        });
      });
      
      if (resumeButtons.length > 0) {
        keyboard.addRow(resumeButtons);
      }
    }

    // 添加管理按钮
    keyboard.addRow([
      { text: '➕ 添加订阅', callback_data: 'add_subscription' },
      { text: '➖ 取消订阅', callback_data: 'remove_subscription' }
    ]);
    
    keyboard.addRow([
      { text: '⚙️ 设置频率', callback_data: 'manage_frequency' },
      { text: '🔄 刷新列表', callback_data: 'refresh_subscriptions' }
    ]);

    await bot.sendMessage(chatId, message, {
      parse_mode: 'HTML',
      reply_markup: keyboard.build()
    });

    logger.logBotMessage(userId, chatId, '/list', true);
  } catch (error) {
    logger.error('Failed to handle list command', { userId, error: (error as Error).message });
    await bot.sendMessage(chatId, '❌ 获取订阅列表失败，请稍后重试');
    logger.logBotMessage(userId, chatId, '/list', false);
  }
}

export async function handleStatus(
  bot: TelegramBot, 
  msg: TelegramBot.Message, 
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
    // 获取用户信息
    const user = await db.getUser(userId);
    if (!user) {
      await bot.sendMessage(chatId, '❌ 用户信息不存在，请使用 /start 重新注册');
      return;
    }

    // 获取订阅统计
    const subscriptions = await db.getUserSubscriptions(userId);
    const activeCount = subscriptions.filter(sub => sub.is_active).length;
    const totalCount = subscriptions.length;

    // 获取价格警报统计
    const alerts = await db.getUserAlerts(userId);
    const activeAlerts = alerts.filter(alert => alert.is_active && !alert.triggered).length;
    const totalAlerts = alerts.length;

    // 获取推送历史统计
    const history = await db.getUserHistory(userId, 10);
    const successfulPushes = history.filter(h => h.success).length;

    const statusMessage = `
👤 <b>用户状态</b>

📊 <b>基本信息</b>
用户ID: <code>${user.user_id}</code>
用户名: ${user.username ? `@${user.username}` : '未设置'}
注册时间: ${new Date(user.created_at).toLocaleDateString('zh-CN')}
会员类型: ${user.is_premium ? '🌟 高级会员' : '👤 普通用户'}

📋 <b>订阅统计</b>
活跃订阅: <b>${activeCount}</b> / ${user.max_subscriptions}
总订阅数: <b>${totalCount}</b>

⚡ <b>价格警报</b>
活跃警报: <b>${activeAlerts}</b>
总警报数: <b>${totalAlerts}</b>

📈 <b>推送统计</b>
最近10次推送成功率: <b>${history.length > 0 ? Math.round((successfulPushes / history.length) * 100) : 0}%</b>

⚙️ <b>设置</b>
语言: ${user.language_code === 'zh' ? '🇨🇳 中文' : user.language_code}
时区: ${user.timezone}
    `.trim();

    const keyboard = new InlineKeyboardBuilder()
      .addRow([
        { text: '📋 查看订阅', callback_data: 'list_subscriptions' },
        { text: '⚡ 管理警报', callback_data: 'manage_alerts' }
      ])
      .addRow([
        { text: '⚙️ 修改设置', callback_data: 'user_settings' },
        { text: '📊 详细统计', callback_data: 'detailed_stats' }
      ])
      .build();

    await bot.sendMessage(chatId, statusMessage, {
      parse_mode: 'HTML',
      reply_markup: keyboard
    });

    logger.logBotMessage(userId, chatId, '/status', true);
  } catch (error) {
    logger.error('Failed to handle status command', { userId, error: (error as Error).message });
    await bot.sendMessage(chatId, '❌ 获取状态信息失败，请稍后重试');
    logger.logBotMessage(userId, chatId, '/status', false);
  }
}
