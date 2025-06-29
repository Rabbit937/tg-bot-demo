import TelegramBot from 'node-telegram-bot-api';
import { DatabaseService } from '../../services/database.js';
import { InlineKeyboardBuilder } from '../../types/bot.js';
import { getLogger } from '../../utils/logger.js';

export async function handleStart(
  bot: TelegramBot, 
  msg: TelegramBot.Message, 
  db: DatabaseService
): Promise<void> {
  const logger = getLogger();
  const userId = msg.from?.id;
  const chatId = msg.chat.id;
  const username = msg.from?.username;
  const firstName = msg.from?.first_name;
  const lastName = msg.from?.last_name;

  if (!userId) {
    await bot.sendMessage(chatId, '❌ 无法获取用户信息');
    return;
  }

  try {
    // 检查用户是否已存在
    let user = await db.getUser(userId);
    
    if (!user) {
      // 创建新用户
      await db.createUser({
        user_id: userId,
        chat_id: chatId,
        username,
        first_name: firstName,
        last_name: lastName,
        language_code: 'zh',
        timezone: 'Asia/Shanghai',
        is_premium: false,
        max_subscriptions: 5
      });
      
      logger.logUserAction(userId, 'user_created', { username, firstName });
    } else {
      // 更新用户信息
      await db.updateUser(userId, {
        chat_id: chatId,
        username,
        first_name: firstName,
        last_name: lastName
      });
      
      logger.logUserAction(userId, 'user_updated', { username, firstName });
    }

    const welcomeMessage = `
🎉 <b>欢迎使用加密货币价格监控机器人！</b>

我可以为您提供以下服务：

📊 <b>实时价格监控</b>
• 获取热门加密货币价格
• 多交易所价格比较
• 资金费率监控

🔔 <b>定时推送服务</b>
• 热门币种排行榜
• 价格变化提醒
• 自定义推送频率

⚡ <b>价格警报</b>
• 设置目标价格提醒
• 支持涨跌双向警报

🚀 <b>开始使用</b>
点击下方按钮开始配置您的订阅，或使用 /help 查看所有命令。
    `.trim();

    const keyboard = new InlineKeyboardBuilder()
      .addRow([
        { text: '📋 查看订阅', callback_data: 'list_subscriptions' },
        { text: '➕ 添加订阅', callback_data: 'add_subscription' }
      ])
      .addRow([
        { text: '💰 查看价格', callback_data: 'view_prices' },
        { text: '🔥 热门币种', callback_data: 'trending_coins' }
      ])
      .addRow([
        { text: '⚙️ 设置', callback_data: 'settings' },
        { text: '❓ 帮助', callback_data: 'help' }
      ])
      .build();

    await bot.sendMessage(chatId, welcomeMessage, {
      parse_mode: 'HTML',
      reply_markup: keyboard
    });

    logger.logBotMessage(userId, chatId, '/start', true);
  } catch (error) {
    logger.error('Failed to handle start command', { userId, error: (error as Error).message });
    await bot.sendMessage(chatId, '❌ 处理命令时发生错误，请稍后重试');
    logger.logBotMessage(userId, chatId, '/start', false);
  }
}
