import { PaymentMethodEnum } from '@shared/enums/payment-method.enum'
import { IsEnum, IsNotEmpty, IsNumber, IsString } from 'class-validator'

export class AddTrafficSubscriptionDto {
  @IsNotEmpty()
  @IsString()
  subscriptionId: string

  @IsNumber()
  traffic: number

  @IsEnum([PaymentMethodEnum, 'BALANCE', 'TRAFFIC'])
  method: PaymentMethodEnum | 'BALANCE' | 'TRAFFIC'
}
