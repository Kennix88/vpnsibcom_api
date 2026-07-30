import { PaymentMethodEnum } from '@modules/payments/types/payment-method.enum'
import { CurrencyEnum } from '@shared/enums/currency.enum'

export interface PaymentMethodsDataInterface {
  key: PaymentMethodEnum
  isActive: boolean
  name: string
  description?: string
  bridge?: string
  minStars: number
  maxStars: number
  commission: number
  isPlusCommission: boolean
  currency: CurrencyInterface
  category: PaymentMethodCategoryEnum
  isTonBlockchain: boolean
  tonSmartContractAddress?: string
}

export enum PaymentMethodCategoryEnum {
  MAIN = 'MAIN',
  RUS = 'RUS',
  CRYPTO = 'CRYPTO',
  RESERVE = 'RESERVE',
}

export interface CurrencyInterface {
  key: CurrencyEnum
  symbol: string
}
