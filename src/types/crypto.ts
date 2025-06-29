import { z } from 'zod';

// CoinGecko API 响应类型
export const CoinGeckoSimplePriceSchema = z.record(
  z.string(),
  z.record(z.string(), z.number())
);

export const CoinGeckoMarketDataSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  name: z.string(),
  image: z.string(),
  current_price: z.number(),
  market_cap: z.number(),
  market_cap_rank: z.number().nullable(),
  fully_diluted_valuation: z.number().nullable(),
  total_volume: z.number(),
  high_24h: z.number(),
  low_24h: z.number(),
  price_change_24h: z.number(),
  price_change_percentage_24h: z.number(),
  market_cap_change_24h: z.number(),
  market_cap_change_percentage_24h: z.number(),
  circulating_supply: z.number(),
  total_supply: z.number().nullable(),
  max_supply: z.number().nullable(),
  ath: z.number(),
  ath_change_percentage: z.number(),
  ath_date: z.string(),
  atl: z.number(),
  atl_change_percentage: z.number(),
  atl_date: z.string(),
  roi: z.object({
    times: z.number(),
    currency: z.string(),
    percentage: z.number()
  }).nullable(),
  last_updated: z.string()
});

export const CoinGeckoTrendingSchema = z.object({
  coins: z.array(z.object({
    item: z.object({
      id: z.string(),
      coin_id: z.number(),
      name: z.string(),
      symbol: z.string(),
      market_cap_rank: z.number(),
      thumb: z.string(),
      small: z.string(),
      large: z.string(),
      slug: z.string(),
      price_btc: z.number(),
      score: z.number()
    })
  }))
});

// 交易所价格类型
export const ExchangePriceSchema = z.object({
  exchange: z.string(),
  symbol: z.string(),
  price: z.number(),
  volume_24h: z.number().optional(),
  timestamp: z.number()
});

export const FundingRateSchema = z.object({
  exchange: z.string(),
  symbol: z.string(),
  funding_rate: z.number(),
  next_funding_time: z.number().optional(),
  timestamp: z.number()
});

// 价格比较结果类型
export const PriceComparisonSchema = z.object({
  symbol: z.string(),
  prices: z.array(ExchangePriceSchema),
  best_price: ExchangePriceSchema,
  worst_price: ExchangePriceSchema,
  price_difference: z.number(),
  price_difference_percentage: z.number(),
  funding_rates: z.array(FundingRateSchema).optional(),
  timestamp: z.number()
});

// 加密货币信息类型
export const CryptoInfoSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  name: z.string(),
  current_price: z.number(),
  price_change_24h: z.number(),
  price_change_percentage_24h: z.number(),
  market_cap: z.number(),
  market_cap_rank: z.number().nullable(),
  volume_24h: z.number(),
  high_24h: z.number(),
  low_24h: z.number(),
  last_updated: z.string()
});

// 热门币种数据类型
export const TrendingCoinSchema = z.object({
  id: z.string(),
  name: z.string(),
  symbol: z.string(),
  market_cap_rank: z.number(),
  price_btc: z.number(),
  score: z.number(),
  thumb: z.string()
});

// 导出类型
export type CoinGeckoSimplePrice = z.infer<typeof CoinGeckoSimplePriceSchema>;
export type CoinGeckoMarketData = z.infer<typeof CoinGeckoMarketDataSchema>;
export type CoinGeckoTrending = z.infer<typeof CoinGeckoTrendingSchema>;
export type ExchangePrice = z.infer<typeof ExchangePriceSchema>;
export type FundingRate = z.infer<typeof FundingRateSchema>;
export type PriceComparison = z.infer<typeof PriceComparisonSchema>;
export type CryptoInfo = z.infer<typeof CryptoInfoSchema>;
export type TrendingCoin = z.infer<typeof TrendingCoinSchema>;

// 支持的交易所枚举
export enum SupportedExchange {
  BINANCE = 'binance',
  OKX = 'okx',
  BYBIT = 'bybit',
  COINBASE = 'coinbase',
  KRAKEN = 'kraken'
}

// 支持的货币对
export const SUPPORTED_SYMBOLS = [
  'BTCUSDT',
  'ETHUSDT',
  'SUIUSDT',
  'SOLUSDT',
  'ADAUSDT',
  'DOTUSDT',
  'LINKUSDT',
  'MATICUSDT',
  'AVAXUSDT',
  'ATOMUSDT'
] as const;

export type SupportedSymbol = typeof SUPPORTED_SYMBOLS[number];
