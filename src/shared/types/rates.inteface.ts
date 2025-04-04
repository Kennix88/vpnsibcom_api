import { CurrencyEnum } from '@shared/enums/currency.enum'

export interface RatesInterface {
  base: CurrencyEnum
  rates: {
    [K in CurrencyEnum]: number
  }
}
