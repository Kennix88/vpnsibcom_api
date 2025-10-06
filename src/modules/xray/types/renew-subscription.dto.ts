import { PaymentMethodEnum } from '@shared/enums/payment-method.enum'
import { SubscriptionPeriodEnum } from '@shared/enums/subscription-period.enum'
import { TrafficResetEnum } from '@shared/enums/traffic-reset.enum'
import { IsBoolean, IsEnum, IsNumber } from 'class-validator'

export class RenewSubscriptionDto {
  @IsEnum([...Object.values(PaymentMethodEnum), 'BALANCE'])
  method: PaymentMethodEnum | 'BALANCE'

  @IsBoolean()
  isSavePeriod: boolean

  @IsEnum(SubscriptionPeriodEnum)
  period: SubscriptionPeriodEnum

  @IsNumber()
  periodMultiplier: number

  @IsEnum(TrafficResetEnum)
  trafficReset: TrafficResetEnum
}
