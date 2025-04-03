export interface ApilayerCurrencyResponceDataInterface {
  success: boolean
  terms: string
  privacy: string
  timestamp: number
  source: string
  quotes: {
    [key: string]: number
  }
}
