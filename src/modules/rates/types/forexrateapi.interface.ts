export interface ForexRateInterface {
  success: boolean
  timestamp: number
  base: string
  rates: {
    [key: string]: number
  }
}
