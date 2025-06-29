import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { 
  CoinGeckoSimplePrice, 
  CoinGeckoMarketData, 
  CoinGeckoTrending,
  CryptoInfo,
  TrendingCoin,
  CoinGeckoSimplePriceSchema,
  CoinGeckoMarketDataSchema,
  CoinGeckoTrendingSchema
} from '../types/crypto.js';
import { ApiError, RateLimitError } from '../types/index.js';
import { getLogger } from '../utils/logger.js';
import { retry, sleep } from '../utils/index.js';

export interface CoinGeckoConfig {
  api_key?: string;
  base_url: string;
  rate_limit: number; // requests per minute
}

export class CoinGeckoService {
  private client: AxiosInstance;
  private logger = getLogger();
  private requestCount = 0;
  private requestWindow = 60000; // 1 minute
  private lastReset = Date.now();
  private rateLimit: number;

  constructor(config: CoinGeckoConfig) {
    this.rateLimit = config.rate_limit;
    
    this.client = axios.create({
      baseURL: config.base_url,
      timeout: 30000,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'TelegramBot/1.0',
        ...(config.api_key && { 'x-cg-pro-api-key': config.api_key })
      }
    });

    // 请求拦截器
    this.client.interceptors.request.use(
      async (config) => {
        await this.checkRateLimit();
        this.requestCount++;
        return config;
      },
      (error) => Promise.reject(error)
    );

    // 响应拦截器
    this.client.interceptors.response.use(
      (response) => {
        this.logger.logApiCall(
          response.config.method?.toUpperCase() || 'GET',
          response.config.url || '',
          response.status,
          Date.now() - (response.config as any).startTime
        );
        return response;
      },
      (error) => {
        const status = error.response?.status || 0;
        const url = error.config?.url || '';
        
        this.logger.logApiCall(
          error.config?.method?.toUpperCase() || 'GET',
          url,
          status,
          Date.now() - (error.config as any).startTime
        );

        if (status === 429) {
          this.logger.logRateLimit('CoinGecko');
          return Promise.reject(new RateLimitError('CoinGecko API rate limit exceeded'));
        }

        return Promise.reject(new ApiError(`CoinGecko API error: ${error.message}`, status));
      }
    );
  }

  private async checkRateLimit(): Promise<void> {
    const now = Date.now();
    
    // 重置计数器
    if (now - this.lastReset >= this.requestWindow) {
      this.requestCount = 0;
      this.lastReset = now;
    }

    // 检查是否超过限制
    if (this.requestCount >= this.rateLimit) {
      const waitTime = this.requestWindow - (now - this.lastReset);
      this.logger.warn(`Rate limit reached, waiting ${waitTime}ms`);
      await sleep(waitTime);
      this.requestCount = 0;
      this.lastReset = Date.now();
    }
  }

  /**
   * 获取简单价格信息
   */
  async getSimplePrices(
    ids: string[], 
    vsCurrencies: string[] = ['usd'],
    includeMarketCap: boolean = false,
    include24hrVol: boolean = false,
    include24hrChange: boolean = true
  ): Promise<CoinGeckoSimplePrice> {
    try {
      const params = new URLSearchParams({
        ids: ids.join(','),
        vs_currencies: vsCurrencies.join(','),
        include_market_cap: includeMarketCap.toString(),
        include_24hr_vol: include24hrVol.toString(),
        include_24hr_change: include24hrChange.toString()
      });

      const response = await retry(
        () => this.client.get(`/simple/price?${params}`),
        3,
        1000
      );

      const result = CoinGeckoSimplePriceSchema.parse(response.data);
      this.logger.debug('Fetched simple prices', { ids, count: Object.keys(result).length });
      
      return result;
    } catch (error) {
      this.logger.error('Failed to fetch simple prices', { ids, error: (error as Error).message });
      throw error;
    }
  }

  /**
   * 获取市场数据
   */
  async getMarketData(
    vsCurrency: string = 'usd',
    ids?: string[],
    category?: string,
    order: string = 'market_cap_desc',
    perPage: number = 100,
    page: number = 1,
    sparkline: boolean = false,
    priceChangePercentage?: string
  ): Promise<CoinGeckoMarketData[]> {
    try {
      const params = new URLSearchParams({
        vs_currency: vsCurrency,
        order,
        per_page: perPage.toString(),
        page: page.toString(),
        sparkline: sparkline.toString()
      });

      if (ids && ids.length > 0) {
        params.append('ids', ids.join(','));
      }
      if (category) {
        params.append('category', category);
      }
      if (priceChangePercentage) {
        params.append('price_change_percentage', priceChangePercentage);
      }

      const response = await retry(
        () => this.client.get(`/coins/markets?${params}`),
        3,
        1000
      );

      const result = response.data.map((item: any) => CoinGeckoMarketDataSchema.parse(item));
      this.logger.debug('Fetched market data', { count: result.length, page });
      
      return result;
    } catch (error) {
      this.logger.error('Failed to fetch market data', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * 获取热门币种
   */
  async getTrendingCoins(): Promise<TrendingCoin[]> {
    try {
      const response = await retry(
        () => this.client.get('/search/trending'),
        3,
        1000
      );

      const result = CoinGeckoTrendingSchema.parse(response.data);
      const trendingCoins = result.coins.map(coin => ({
        id: coin.item.id,
        name: coin.item.name,
        symbol: coin.item.symbol,
        market_cap_rank: coin.item.market_cap_rank,
        price_btc: coin.item.price_btc,
        score: coin.item.score,
        thumb: coin.item.thumb
      }));

      this.logger.debug('Fetched trending coins', { count: trendingCoins.length });
      return trendingCoins;
    } catch (error) {
      this.logger.error('Failed to fetch trending coins', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * 获取特定币种的详细信息
   */
  async getCoinInfo(coinId: string): Promise<CryptoInfo | null> {
    try {
      const response = await retry(
        () => this.client.get(`/coins/${coinId}`),
        3,
        1000
      );

      const data = response.data;
      const cryptoInfo: CryptoInfo = {
        id: data.id,
        symbol: data.symbol,
        name: data.name,
        current_price: data.market_data?.current_price?.usd || 0,
        price_change_24h: data.market_data?.price_change_24h || 0,
        price_change_percentage_24h: data.market_data?.price_change_percentage_24h || 0,
        market_cap: data.market_data?.market_cap?.usd || 0,
        market_cap_rank: data.market_cap_rank,
        volume_24h: data.market_data?.total_volume?.usd || 0,
        high_24h: data.market_data?.high_24h?.usd || 0,
        low_24h: data.market_data?.low_24h?.usd || 0,
        last_updated: data.last_updated
      };

      this.logger.debug('Fetched coin info', { coinId, symbol: cryptoInfo.symbol });
      return cryptoInfo;
    } catch (error) {
      if ((error as any).response?.status === 404) {
        this.logger.warn('Coin not found', { coinId });
        return null;
      }
      this.logger.error('Failed to fetch coin info', { coinId, error: (error as Error).message });
      throw error;
    }
  }

  /**
   * 搜索币种
   */
  async searchCoins(query: string): Promise<any[]> {
    try {
      const response = await retry(
        () => this.client.get(`/search?query=${encodeURIComponent(query)}`),
        3,
        1000
      );

      const coins = response.data.coins || [];
      this.logger.debug('Searched coins', { query, count: coins.length });
      
      return coins;
    } catch (error) {
      this.logger.error('Failed to search coins', { query, error: (error as Error).message });
      throw error;
    }
  }

  /**
   * 获取全局市场数据
   */
  async getGlobalData(): Promise<any> {
    try {
      const response = await retry(
        () => this.client.get('/global'),
        3,
        1000
      );

      this.logger.debug('Fetched global data');
      return response.data.data;
    } catch (error) {
      this.logger.error('Failed to fetch global data', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * 获取支持的VS货币列表
   */
  async getSupportedVsCurrencies(): Promise<string[]> {
    try {
      const response = await retry(
        () => this.client.get('/simple/supported_vs_currencies'),
        3,
        1000
      );

      this.logger.debug('Fetched supported currencies', { count: response.data.length });
      return response.data;
    } catch (error) {
      this.logger.error('Failed to fetch supported currencies', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * 获取币种列表
   */
  async getCoinsList(includePlatform: boolean = false): Promise<any[]> {
    try {
      const params = new URLSearchParams({
        include_platform: includePlatform.toString()
      });

      const response = await retry(
        () => this.client.get(`/coins/list?${params}`),
        3,
        1000
      );

      this.logger.debug('Fetched coins list', { count: response.data.length });
      return response.data;
    } catch (error) {
      this.logger.error('Failed to fetch coins list', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * 批量获取币种信息
   */
  async getBatchCoinInfo(coinIds: string[]): Promise<CryptoInfo[]> {
    const batchSize = 10; // 避免请求过大
    const results: CryptoInfo[] = [];

    for (let i = 0; i < coinIds.length; i += batchSize) {
      const batch = coinIds.slice(i, i + batchSize);
      const batchPromises = batch.map(id => this.getCoinInfo(id));
      
      try {
        const batchResults = await Promise.allSettled(batchPromises);
        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled' && result.value) {
            results.push(result.value);
          } else {
            this.logger.warn('Failed to fetch coin in batch', { 
              coinId: batch[index], 
              error: result.status === 'rejected' ? result.reason : 'No data' 
            });
          }
        });
      } catch (error) {
        this.logger.error('Batch request failed', { batch, error: (error as Error).message });
      }

      // 批次间延迟
      if (i + batchSize < coinIds.length) {
        await sleep(200);
      }
    }

    return results;
  }

  /**
   * 获取API状态
   */
  async getApiStatus(): Promise<{ success: boolean; response_time: number }> {
    const startTime = Date.now();
    try {
      await this.client.get('/ping');
      const responseTime = Date.now() - startTime;
      
      this.logger.debug('API status check successful', { response_time: responseTime });
      return { success: true, response_time: responseTime };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.logger.error('API status check failed', { error: (error as Error).message, response_time: responseTime });
      return { success: false, response_time: responseTime };
    }
  }

  /**
   * 获取请求统计
   */
  getRequestStats(): { count: number; limit: number; window_ms: number; reset_in_ms: number } {
    const now = Date.now();
    const resetInMs = this.requestWindow - (now - this.lastReset);
    
    return {
      count: this.requestCount,
      limit: this.rateLimit,
      window_ms: this.requestWindow,
      reset_in_ms: Math.max(0, resetInMs)
    };
  }
}
