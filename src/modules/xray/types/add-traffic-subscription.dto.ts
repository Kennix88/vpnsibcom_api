import { PaymentMethodEnum } from '@shared/enums/payment-method.enum'
import { IsEnum, IsNumber } from 'class-validator'

export class AddTrafficSubscriptionDto {
  @IsNumber()
  traffic: number

  @IsEnum([...Object.values(PaymentMethodEnum), 'BALANCE', 'TRAFFIC', 'AD'])
  method: PaymentMethodEnum | 'BALANCE' | 'TRAFFIC' | 'AD'
}
