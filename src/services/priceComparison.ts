import axios, { AxiosInstance } from 'axios';
import { 
  ExchangePrice, 
  FundingRate, 
  PriceComparison, 
  SupportedExchange,
  SupportedSymbol
} from '../types/crypto.js';
import { ApiError, RateLimitError } from '../types/index.js';
import { getLogger } from '../utils/logger.js';
import { retry, sleep } from '../utils/index.js';

export interface ExchangeConfig {
  base_url: string;
  rate_limit: number;
}

export interface PriceComparisonConfig {
  binance: ExchangeConfig;
  okx: ExchangeConfig;
  bybit: ExchangeConfig;
}

export class PriceComparisonService {
  private clients: Map<SupportedExchange, AxiosInstance> = new Map();
  private logger = getLogger();
  private requestCounts: Map<SupportedExchange, number> = new Map();
  private lastResets: Map<SupportedExchange, number> = new Map();
  private rateLimits: Map<SupportedExchange, number> = new Map();
  private requestWindow = 60000; // 1 minute

  constructor(config: PriceComparisonConfig) {
    this.initializeClients(config);
  }

  private initializeClients(config: PriceComparisonConfig): void {
    // 初始化币安客户端
    this.clients.set(SupportedExchange.BINANCE, axios.create({
      baseURL: config.binance.base_url,
      timeout: 10000,
      headers: { 'User-Agent': 'TelegramBot/1.0' }
    }));
    this.rateLimits.set(SupportedExchange.BINANCE, config.binance.rate_limit);
    this.requestCounts.set(SupportedExchange.BINANCE, 0);
    this.lastResets.set(SupportedExchange.BINANCE, Date.now());

    // 初始化OKX客户端
    this.clients.set(SupportedExchange.OKX, axios.create({
      baseURL: config.okx.base_url,
      timeout: 10000,
      headers: { 'User-Agent': 'TelegramBot/1.0' }
    }));
    this.rateLimits.set(SupportedExchange.OKX, config.okx.rate_limit);
    this.requestCounts.set(SupportedExchange.OKX, 0);
    this.lastResets.set(SupportedExchange.OKX, Date.now());

    // 初始化Bybit客户端
    this.clients.set(SupportedExchange.BYBIT, axios.create({
      baseURL: config.bybit.base_url,
      timeout: 10000,
      headers: { 'User-Agent': 'TelegramBot/1.0' }
    }));
    this.rateLimits.set(SupportedExchange.BYBIT, config.bybit.rate_limit);
    this.requestCounts.set(SupportedExchange.BYBIT, 0);
    this.lastResets.set(SupportedExchange.BYBIT, Date.now());

    // 为每个客户端添加拦截器
    this.clients.forEach((client, exchange) => {
      client.interceptors.request.use(
        async (config) => {
          await this.checkRateLimit(exchange);
          this.incrementRequestCount(exchange);
          (config as any).startTime = Date.now();
          return config;
        },
        (error) => Promise.reject(error)
      );

      client.interceptors.response.use(
        (response) => {
          this.logger.logApiCall(
            response.config.method?.toUpperCase() || 'GET',
            `${exchange}:${response.config.url}`,
            response.status,
            Date.now() - (response.config as any).startTime
          );
          return response;
        },
        (error) => {
          const status = error.response?.status || 0;
          this.logger.logApiCall(
            error.config?.method?.toUpperCase() || 'GET',
            `${exchange}:${error.config?.url}`,
            status,
            Date.now() - (error.config as any).startTime
          );

          if (status === 429) {
            this.logger.logRateLimit(exchange);
            return Promise.reject(new RateLimitError(`${exchange} API rate limit exceeded`));
          }

          return Promise.reject(new ApiError(`${exchange} API error: ${error.message}`, status));
        }
      );
    });
  }

  private async checkRateLimit(exchange: SupportedExchange): Promise<void> {
    const now = Date.now();
    const lastReset = this.lastResets.get(exchange) || 0;
    const requestCount = this.requestCounts.get(exchange) || 0;
    const rateLimit = this.rateLimits.get(exchange) || 100;

    // 重置计数器
    if (now - lastReset >= this.requestWindow) {
      this.requestCounts.set(exchange, 0);
      this.lastResets.set(exchange, now);
      return;
    }

    // 检查是否超过限制
    if (requestCount >= rateLimit) {
      const waitTime = this.requestWindow - (now - lastReset);
      this.logger.warn(`${exchange} rate limit reached, waiting ${waitTime}ms`);
      await sleep(waitTime);
      this.requestCounts.set(exchange, 0);
      this.lastResets.set(exchange, Date.now());
    }
  }

  private incrementRequestCount(exchange: SupportedExchange): void {
    const current = this.requestCounts.get(exchange) || 0;
    this.requestCounts.set(exchange, current + 1);
  }

  /**
   * 获取币安价格
   */
  private async getBinancePrice(symbol: string): Promise<ExchangePrice | null> {
    try {
      const client = this.clients.get(SupportedExchange.BINANCE)!;
      const response = await retry(
        () => client.get(`/fapi/v1/ticker/24hr?symbol=${symbol}`),
        2,
        500
      );

      const data = response.data;
      return {
        exchange: SupportedExchange.BINANCE,
        symbol,
        price: parseFloat(data.lastPrice),
        volume_24h: parseFloat(data.volume),
        timestamp: Date.now()
      };
    } catch (error) {
      this.logger.error('Failed to fetch Binance price', { symbol, error: (error as Error).message });
      return null;
    }
  }

  /**
   * 获取OKX价格
   */
  private async getOKXPrice(symbol: string): Promise<ExchangePrice | null> {
    try {
      const client = this.clients.get(SupportedExchange.OKX)!;
      // 转换符号格式：BTCUSDT -> BTC-USDT-SWAP
      const okxSymbol = symbol.replace('USDT', '-USDT-SWAP');
      
      const response = await retry(
        () => client.get(`/api/v5/market/ticker?instId=${okxSymbol}`),
        2,
        500
      );

      const data = response.data.data[0];
      if (!data) return null;

      return {
        exchange: SupportedExchange.OKX,
        symbol,
        price: parseFloat(data.last),
        volume_24h: parseFloat(data.vol24h),
        timestamp: Date.now()
      };
    } catch (error) {
      this.logger.error('Failed to fetch OKX price', { symbol, error: (error as Error).message });
      return null;
    }
  }

  /**
   * 获取Bybit价格
   */
  private async getBybitPrice(symbol: string): Promise<ExchangePrice | null> {
    try {
      const client = this.clients.get(SupportedExchange.BYBIT)!;
      const response = await retry(
        () => client.get(`/v5/market/tickers?category=linear&symbol=${symbol}`),
        2,
        500
      );

      const data = response.data.result.list[0];
      if (!data) return null;

      return {
        exchange: SupportedExchange.BYBIT,
        symbol,
        price: parseFloat(data.lastPrice),
        volume_24h: parseFloat(data.volume24h),
        timestamp: Date.now()
      };
    } catch (error) {
      this.logger.error('Failed to fetch Bybit price', { symbol, error: (error as Error).message });
      return null;
    }
  }

  /**
   * 获取币安资金费率
   */
  private async getBinanceFundingRate(symbol: string): Promise<FundingRate | null> {
    try {
      const client = this.clients.get(SupportedExchange.BINANCE)!;
      const response = await retry(
        () => client.get(`/fapi/v1/premiumIndex?symbol=${symbol}`),
        2,
        500
      );

      const data = response.data;
      return {
        exchange: SupportedExchange.BINANCE,
        symbol,
        funding_rate: parseFloat(data.lastFundingRate),
        next_funding_time: parseInt(data.nextFundingTime),
        timestamp: Date.now()
      };
    } catch (error) {
      this.logger.error('Failed to fetch Binance funding rate', { symbol, error: (error as Error).message });
      return null;
    }
  }

  /**
   * 获取OKX资金费率
   */
  private async getOKXFundingRate(symbol: string): Promise<FundingRate | null> {
    try {
      const client = this.clients.get(SupportedExchange.OKX)!;
      const okxSymbol = symbol.replace('USDT', '-USDT-SWAP');
      
      const response = await retry(
        () => client.get(`/api/v5/public/funding-rate?instId=${okxSymbol}`),
        2,
        500
      );

      const data = response.data.data[0];
      if (!data) return null;

      return {
        exchange: SupportedExchange.OKX,
        symbol,
        funding_rate: parseFloat(data.fundingRate),
        next_funding_time: parseInt(data.nextFundingTime),
        timestamp: Date.now()
      };
    } catch (error) {
      this.logger.error('Failed to fetch OKX funding rate', { symbol, error: (error as Error).message });
      return null;
    }
  }

  /**
   * 获取Bybit资金费率
   */
  private async getBybitFundingRate(symbol: string): Promise<FundingRate | null> {
    try {
      const client = this.clients.get(SupportedExchange.BYBIT)!;
      const response = await retry(
        () => client.get(`/v5/market/funding/history?category=linear&symbol=${symbol}&limit=1`),
        2,
        500
      );

      const data = response.data.result.list[0];
      if (!data) return null;

      return {
        exchange: SupportedExchange.BYBIT,
        symbol,
        funding_rate: parseFloat(data.fundingRate),
        timestamp: Date.now()
      };
    } catch (error) {
      this.logger.error('Failed to fetch Bybit funding rate', { symbol, error: (error as Error).message });
      return null;
    }
  }

  /**
   * 获取所有交易所的价格
   */
  async getAllPrices(symbol: SupportedSymbol): Promise<ExchangePrice[]> {
    const pricePromises = [
      this.getBinancePrice(symbol),
      this.getOKXPrice(symbol),
      this.getBybitPrice(symbol)
    ];

    const results = await Promise.allSettled(pricePromises);
    const prices: ExchangePrice[] = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        prices.push(result.value);
      } else {
        const exchanges = [SupportedExchange.BINANCE, SupportedExchange.OKX, SupportedExchange.BYBIT];
        this.logger.warn('Failed to fetch price from exchange', { 
          exchange: exchanges[index], 
          symbol,
          error: result.status === 'rejected' ? result.reason : 'No data'
        });
      }
    });

    return prices;
  }

  /**
   * 获取所有交易所的资金费率
   */
  async getAllFundingRates(symbol: SupportedSymbol): Promise<FundingRate[]> {
    const ratePromises = [
      this.getBinanceFundingRate(symbol),
      this.getOKXFundingRate(symbol),
      this.getBybitFundingRate(symbol)
    ];

    const results = await Promise.allSettled(ratePromises);
    const rates: FundingRate[] = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        rates.push(result.value);
      } else {
        const exchanges = [SupportedExchange.BINANCE, SupportedExchange.OKX, SupportedExchange.BYBIT];
        this.logger.warn('Failed to fetch funding rate from exchange', { 
          exchange: exchanges[index], 
          symbol,
          error: result.status === 'rejected' ? result.reason : 'No data'
        });
      }
    });

    return rates;
  }

  /**
   * 比较价格
   */
  async comparePrices(symbol: SupportedSymbol, includeFundingRates: boolean = true): Promise<PriceComparison | null> {
    try {
      const [prices, fundingRates] = await Promise.all([
        this.getAllPrices(symbol),
        includeFundingRates ? this.getAllFundingRates(symbol) : Promise.resolve([])
      ]);

      if (prices.length === 0) {
        this.logger.warn('No prices available for comparison', { symbol });
        return null;
      }

      // 找到最高价和最低价
      const sortedPrices = [...prices].sort((a, b) => a.price - b.price);
      const bestPrice = sortedPrices[0]; // 最低价
      const worstPrice = sortedPrices[sortedPrices.length - 1]; // 最高价

      const priceDifference = worstPrice.price - bestPrice.price;
      const priceDifferencePercentage = (priceDifference / bestPrice.price) * 100;

      const comparison: PriceComparison = {
        symbol,
        prices,
        best_price: bestPrice,
        worst_price: worstPrice,
        price_difference: priceDifference,
        price_difference_percentage: priceDifferencePercentage,
        funding_rates: fundingRates.length > 0 ? fundingRates : undefined,
        timestamp: Date.now()
      };

      this.logger.debug('Price comparison completed', { 
        symbol, 
        exchanges: prices.length, 
        price_diff: priceDifferencePercentage.toFixed(2) + '%'
      });

      return comparison;
    } catch (error) {
      this.logger.error('Failed to compare prices', { symbol, error: (error as Error).message });
      throw error;
    }
  }

  /**
   * 批量比较价格
   */
  async batchComparePrices(symbols: SupportedSymbol[], includeFundingRates: boolean = true): Promise<PriceComparison[]> {
    const results: PriceComparison[] = [];
    
    for (const symbol of symbols) {
      try {
        const comparison = await this.comparePrices(symbol, includeFundingRates);
        if (comparison) {
          results.push(comparison);
        }
        
        // 批次间延迟，避免过于频繁的请求
        await sleep(100);
      } catch (error) {
        this.logger.error('Failed to compare price in batch', { symbol, error: (error as Error).message });
      }
    }

    return results;
  }

  /**
   * 获取特定交易所的价格
   */
  async getExchangePrice(exchange: SupportedExchange, symbol: SupportedSymbol): Promise<ExchangePrice | null> {
    switch (exchange) {
      case SupportedExchange.BINANCE:
        return this.getBinancePrice(symbol);
      case SupportedExchange.OKX:
        return this.getOKXPrice(symbol);
      case SupportedExchange.BYBIT:
        return this.getBybitPrice(symbol);
      default:
        throw new Error(`Unsupported exchange: ${exchange}`);
    }
  }

  /**
   * 获取特定交易所的资金费率
   */
  async getExchangeFundingRate(exchange: SupportedExchange, symbol: SupportedSymbol): Promise<FundingRate | null> {
    switch (exchange) {
      case SupportedExchange.BINANCE:
        return this.getBinanceFundingRate(symbol);
      case SupportedExchange.OKX:
        return this.getOKXFundingRate(symbol);
      case SupportedExchange.BYBIT:
        return this.getBybitFundingRate(symbol);
      default:
        throw new Error(`Unsupported exchange: ${exchange}`);
    }
  }

  /**
   * 获取请求统计
   */
  getRequestStats(): Record<SupportedExchange, { count: number; limit: number; reset_in_ms: number }> {
    const stats: any = {};
    const now = Date.now();

    this.clients.forEach((_, exchange) => {
      const count = this.requestCounts.get(exchange) || 0;
      const limit = this.rateLimits.get(exchange) || 0;
      const lastReset = this.lastResets.get(exchange) || 0;
      const resetInMs = Math.max(0, this.requestWindow - (now - lastReset));

      stats[exchange] = { count, limit, reset_in_ms: resetInMs };
    });

    return stats;
  }
}
