import TelegramBot from 'node-telegram-bot-api';
import { InlineKeyboardBuilder } from '../../types/bot.js';
import { getLogger } from '../../utils/logger.js';

export async function handleHelp(
  bot: TelegramBot, 
  msg: TelegramBot.Message
): Promise<void> {
  const logger = getLogger();
  const userId = msg.from?.id;
  const chatId = msg.chat.id;

  if (!userId) {
    await bot.sendMessage(chatId, '❌ 无法获取用户信息');
    return;
  }

  try {
    const helpMessage = `
📖 <b>帮助文档</b>

🤖 <b>基本命令</b>
/start - 开始使用机器人
/help - 显示此帮助信息
/status - 查看机器人状态

📋 <b>订阅管理</b>
/subscribe - 添加新订阅
/unsubscribe - 取消订阅
/list - 查看所有订阅
/settings - 修改订阅设置

💰 <b>价格查询</b>
/price [币种] - 查询特定币种价格
/compare [币种] - 比较多交易所价格
/trending - 查看热门币种

⚡ <b>价格警报</b>
/alert [币种] [价格] [above/below] - 设置价格警报
例如：/alert BTC 50000 above

🔧 <b>订阅类型说明</b>

🪙 <b>加密货币价格</b>
定时推送主流币种的价格信息，包括价格变化、市值等数据。

🔥 <b>热门币种</b>
推送CoinGecko平台上的热门币种排行榜，帮您发现市场热点。

💱 <b>价格比较</b>
比较币安、OKX、Bybit等主流交易所的价格差异，寻找套利机会。

💰 <b>资金费率</b>
监控各交易所的资金费率变化，为合约交易提供参考。

⚡ <b>价格警报</b>
设置目标价格，当币种达到指定价格时自动推送提醒。

⏰ <b>推送频率</b>
• 每5分钟
• 每15分钟  
• 每30分钟
• 每小时（默认）
• 每2小时
• 每4小时
• 每6小时
• 每12小时
• 每天
• 每天两次

💡 <b>使用技巧</b>
• 建议先从热门币种订阅开始
• 可以同时订阅多种类型的推送
• 价格警报支持设置多个目标价格
• 使用价格比较功能寻找最优交易价格

❓ <b>常见问题</b>

<b>Q: 如何修改推送频率？</b>
A: 使用 /settings 命令或点击订阅管理中的设置按钮。

<b>Q: 最多可以设置多少个订阅？</b>
A: 普通用户最多5个订阅，高级用户可以设置更多。

<b>Q: 价格数据多久更新一次？</b>
A: 价格数据实时获取，推送频率根据您的设置而定。

<b>Q: 支持哪些交易所？</b>
A: 目前支持币安、OKX、Bybit等主流交易所。

🆘 <b>需要帮助？</b>
如果您遇到问题或有建议，请联系管理员。
    `.trim();

    const keyboard = new InlineKeyboardBuilder()
      .addRow([
        { text: '🚀 开始使用', callback_data: 'start_tutorial' },
        { text: '📋 查看订阅', callback_data: 'list_subscriptions' }
      ])
      .addRow([
        { text: '➕ 添加订阅', callback_data: 'add_subscription' },
        { text: '⚙️ 设置', callback_data: 'settings' }
      ])
      .build();

    await bot.sendMessage(chatId, helpMessage, {
      parse_mode: 'HTML',
      reply_markup: keyboard
    });

    logger.logBotMessage(userId, chatId, '/help', true);
  } catch (error) {
    logger.error('Failed to handle help command', { userId, error: (error as Error).message });
    await bot.sendMessage(chatId, '❌ 获取帮助信息失败，请稍后重试');
    logger.logBotMessage(userId, chatId, '/help', false);
  }
}
