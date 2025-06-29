import TelegramBot from 'node-telegram-bot-api'
import dotenv from 'dotenv'

dotenv.config();

// Bot token
const token = process.env.TELEGRAM_BOT_TOKEN!;

// 频道ID
const channelId = process.env.TELEGRAM_CHAT_ID!;

console.log(token, channelId);

// 创建 Bot 对象
const bot = new TelegramBot(token);

async function main() {
    try {
        const res = await bot.sendMessage(channelId, '这是自动发送的频道消息 📢');
        console.log('消息发送成功:', res);
    } catch (error: any) {
        console.error('发送失败:', error.response ? error.response.body : error);
    }

}

main();
