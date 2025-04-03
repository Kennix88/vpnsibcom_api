export interface CoinmarketcapResponceDataInterface {
  status: CoinmarketcapResponceStatusInterface
  data?: CoinmarketcapDataInterface
}

export interface CoinmarketcapDataInterface {
  [key: string]: CoinmarketcapCurrencyInterface
}

export interface CoinmarketcapCurrencyInterface {
  id: number
  name: string
  symbol: string
  slug: string
  infinite_supply: boolean
  cmc_rank: number
  self_reported_circulating_supply?: number
  self_reported_market_cap?: number
  tvl_ratio?: number
  last_updated: Date
  quote: {
    [key: string]: RateInterface
  }
}

interface RateInterface {
  price: number
  volume_24h: number
  volume_change_24h: number
  percent_change_1h: number
  percent_change_24h: number
  percent_change_7d: number
  percent_change_30d: number
  percent_change_60d: number
  percent_change_90d: number
  market_cap: number
  market_cap_dominance: number
  fully_diluted_market_cap: number
  tvl?: number
  last_updated: Date
}

interface CoinmarketcapResponceStatusInterface {
  timestamp: string
  error_code: number
  error_message?: string
  elapsed: number
  credit_count: number
  notice?: number
  total_count: number
}
