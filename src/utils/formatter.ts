import { MessageFormatter } from '../types/bot.js';
import { CryptoInfo, PriceComparison, TrendingCoin, FundingRate } from '../types/crypto.js';

export class TelegramFormatter implements MessageFormatter {
  formatPrice(price: number, currency: string = 'USD'): string {
    if (price >= 1) {
      return `$${price.toLocaleString('en-US', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 6 
      })}`;
    } else {
      return `$${price.toFixed(8)}`;
    }
  }

  formatPercentage(percentage: number): string {
    const sign = percentage >= 0 ? '+' : '';
    const emoji = percentage >= 0 ? '🟢' : '🔴';
    return `${emoji} ${sign}${percentage.toFixed(2)}%`;
  }

  formatVolume(volume: number): string {
    if (volume >= 1e9) {
      return `$${(volume / 1e9).toFixed(2)}B`;
    } else if (volume >= 1e6) {
      return `$${(volume / 1e6).toFixed(2)}M`;
    } else if (volume >= 1e3) {
      return `$${(volume / 1e3).toFixed(2)}K`;
    } else {
      return `$${volume.toFixed(2)}`;
    }
  }

  formatMarketCap(marketCap: number): string {
    if (marketCap >= 1e12) {
      return `$${(marketCap / 1e12).toFixed(2)}T`;
    } else if (marketCap >= 1e9) {
      return `$${(marketCap / 1e9).toFixed(2)}B`;
    } else if (marketCap >= 1e6) {
      return `$${(marketCap / 1e6).toFixed(2)}M`;
    } else {
      return `$${marketCap.toFixed(2)}`;
    }
  }

  formatTimestamp(timestamp: number | string): string {
    const date = new Date(typeof timestamp === 'string' ? timestamp : timestamp * 1000);
    return date.toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  escapeMarkdown(text: string): string {
    return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
  }

  escapeHTML(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // 专用格式化方法
  formatCryptoInfo(crypto: CryptoInfo): string {
    const priceChange = this.formatPercentage(crypto.price_change_percentage_24h);
    const price = this.formatPrice(crypto.current_price);
    const volume = this.formatVolume(crypto.volume_24h);
    const marketCap = this.formatMarketCap(crypto.market_cap);
    const rank = crypto.market_cap_rank ? `#${crypto.market_cap_rank}` : 'N/A';

    return `
🪙 <b>${crypto.name} (${crypto.symbol.toUpperCase()})</b>
💰 价格: <code>${price}</code>
📊 24h变化: ${priceChange}
📈 市值: <code>${marketCap}</code> (排名: ${rank})
💹 24h交易量: <code>${volume}</code>
🔺 24h最高: <code>${this.formatPrice(crypto.high_24h)}</code>
🔻 24h最低: <code>${this.formatPrice(crypto.low_24h)}</code>
⏰ 更新时间: ${this.formatTimestamp(crypto.last_updated)}
    `.trim();
  }

  formatTrendingCoins(coins: TrendingCoin[]): string {
    let message = '🔥 <b>热门币种排行榜</b>\n\n';
    
    coins.forEach((coin, index) => {
      const rank = index + 1;
      const emoji = this.getRankEmoji(rank);
      message += `${emoji} <b>${coin.name} (${coin.symbol.toUpperCase()})</b>\n`;
      message += `   市值排名: #${coin.market_cap_rank}\n`;
      message += `   热度评分: ${coin.score.toFixed(1)}\n\n`;
    });

    message += `⏰ 更新时间: ${this.formatTimestamp(Date.now())}`;
    return message;
  }

  formatPriceComparison(comparison: PriceComparison): string {
    const symbol = comparison.symbol.toUpperCase();
    let message = `💱 <b>${symbol} 价格比较</b>\n\n`;

    // 最优价格
    message += `🏆 <b>最优价格</b>\n`;
    message += `${comparison.best_price.exchange}: <code>${this.formatPrice(comparison.best_price.price)}</code>\n\n`;

    // 所有交易所价格
    message += `📊 <b>各交易所价格</b>\n`;
    comparison.prices.forEach(price => {
      const isBest = price.exchange === comparison.best_price.exchange;
      const isWorst = price.exchange === comparison.worst_price.exchange;
      const emoji = isBest ? '🥇' : isWorst ? '🥉' : '🥈';
      
      message += `${emoji} ${price.exchange}: <code>${this.formatPrice(price.price)}</code>\n`;
    });

    // 价格差异
    const diffPercentage = this.formatPercentage(comparison.price_difference_percentage);
    message += `\n📈 <b>价格差异</b>\n`;
    message += `最大差价: <code>${this.formatPrice(comparison.price_difference)}</code>\n`;
    message += `差异百分比: ${diffPercentage}\n`;

    // 资金费率（如果有）
    if (comparison.funding_rates && comparison.funding_rates.length > 0) {
      message += `\n💰 <b>资金费率</b>\n`;
      comparison.funding_rates.forEach(rate => {
        const ratePercentage = (rate.funding_rate * 100).toFixed(4);
        message += `${rate.exchange}: <code>${ratePercentage}%</code>\n`;
      });
    }

    message += `\n⏰ 更新时间: ${this.formatTimestamp(comparison.timestamp)}`;
    return message;
  }

  formatFundingRates(rates: FundingRate[]): string {
    let message = '💰 <b>资金费率</b>\n\n';

    rates.forEach(rate => {
      const ratePercentage = (rate.funding_rate * 100).toFixed(4);
      const emoji = rate.funding_rate >= 0 ? '🟢' : '🔴';
      
      message += `${emoji} <b>${rate.exchange}</b>\n`;
      message += `${rate.symbol}: <code>${ratePercentage}%</code>\n`;
      
      if (rate.next_funding_time) {
        message += `下次结算: ${this.formatTimestamp(rate.next_funding_time)}\n`;
      }
      message += '\n';
    });

    message += `⏰ 更新时间: ${this.formatTimestamp(Date.now())}`;
    return message;
  }

  formatSubscriptionList(subscriptions: any[]): string {
    if (subscriptions.length === 0) {
      return '📭 您还没有任何订阅。使用 /subscribe 命令开始订阅。';
    }

    let message = '📋 <b>您的订阅列表</b>\n\n';
    
    subscriptions.forEach((sub, index) => {
      const status = sub.is_active ? '✅' : '❌';
      const frequency = this.formatFrequency(sub.frequency);
      
      message += `${index + 1}. ${status} <b>${this.formatSubscriptionType(sub.subscription_type)}</b>\n`;
      message += `   频率: ${frequency}\n`;
      
      if (sub.symbols && sub.symbols.length > 0) {
        message += `   币种: ${sub.symbols.join(', ')}\n`;
      }
      
      if (sub.exchanges && sub.exchanges.length > 0) {
        message += `   交易所: ${sub.exchanges.join(', ')}\n`;
      }
      
      message += '\n';
    });

    return message;
  }

  private getRankEmoji(rank: number): string {
    const emojis = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
    return emojis[rank - 1] || `${rank}️⃣`;
  }

  private formatFrequency(frequency: string): string {
    const frequencyMap: { [key: string]: string } = {
      '*/5 * * * *': '每5分钟',
      '*/15 * * * *': '每15分钟',
      '*/30 * * * *': '每30分钟',
      '0 * * * *': '每小时',
      '0 */2 * * *': '每2小时',
      '0 */4 * * *': '每4小时',
      '0 */6 * * *': '每6小时',
      '0 */12 * * *': '每12小时',
      '0 0 * * *': '每天',
      '0 0,12 * * *': '每天两次'
    };
    return frequencyMap[frequency] || frequency;
  }

  private formatSubscriptionType(type: string): string {
    const typeMap: { [key: string]: string } = {
      'crypto_prices': '加密货币价格',
      'trending_coins': '热门币种',
      'price_comparison': '价格比较',
      'funding_rates': '资金费率',
      'price_alerts': '价格警报'
    };
    return typeMap[type] || type;
  }
}

// 创建默认格式化器实例
export const formatter = new TelegramFormatter();
