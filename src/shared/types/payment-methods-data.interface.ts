import { PaymentMethodTypeEnum } from '@shared/enums/payment-method-type.enum'
import { PaymentMethodEnum } from '@shared/enums/payment-method.enum'
import { PaymentSystemEnum } from '@shared/enums/payment-system.enum'

export interface PaymentMethodsDataInterface {
  key: PaymentMethodEnum
  name: string
  isTonBlockchain: boolean
  tonSmartContractAddress?: string
  minAmount: number
  maxAmount: number
  commission: number
  isPlusCommission: boolean
  type: PaymentMethodTypeEnum
  system: PaymentSystemEnum
  currency: CurrencyInterface
}

export interface CurrencyInterface {
  key: true
  name: true
  symbol: true
  type: true
  rate: true
}
