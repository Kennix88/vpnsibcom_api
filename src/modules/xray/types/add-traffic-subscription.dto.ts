import { PaymentMethodEnum } from '@shared/enums/payment-method.enum'
import { IsEnum, IsNumber } from 'class-validator'

export class AddTrafficSubscriptionDto {
  @IsNumber()
  traffic: number

  @IsEnum([...Object.values(PaymentMethodEnum), 'BALANCE', 'USDT'])
  method: PaymentMethodEnum | 'BALANCE' | 'USDT'
}
