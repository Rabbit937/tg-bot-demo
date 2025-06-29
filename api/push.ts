// ✅ 每隔一段时间推送币价信息的 Telegram Bot 接口

// 📁 /api/push.ts
import type { VercelRequest, VercelResponse } from 'vercel';
import axios from 'axios';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).send('Method Not Allowed');

  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    return res.status(500).send('Missing Telegram credentials');
  }

  try {
    // 获取币价（CoinGecko）
    const resp = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
      params: {
        ids: 'bitcoin,ethereum,solana',
        vs_currencies: 'usd'
      }
    });

    const data = resp.data;
    const btc = data.bitcoin.usd;
    const eth = data.ethereum.usd;
    const sol = data.solana.usd;

    const message = `\uD83D\uDCB0 实时币价播报：\n\nBTC: $${btc}\nETH: $${eth}\nSOL: $${sol}\n\n更新时间：${new Date().toLocaleTimeString('en-US', { hour12: false })}`;

    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'Markdown'
    });

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('推送失败:', err);
    res.status(500).json({ ok: false });
  }
}
