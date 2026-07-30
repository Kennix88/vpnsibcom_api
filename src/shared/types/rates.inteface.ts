import { CurrencyTypeEnum } from '@shared/enums/currency-type.enum'
import { CurrencyEnum } from '@shared/enums/currency.enum'

export interface RatesInterface {
  base: CurrencyEnum
  rates: Record<CurrencyEnum, number>
  types: Record<CurrencyEnum, CurrencyTypeEnum>
}
