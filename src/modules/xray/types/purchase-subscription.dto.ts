import { PlansEnum } from '@modules/plans/types/plans.enum'
import { PaymentMethodEnum } from '@shared/enums/payment-method.enum'
import { SubscriptionPeriodEnum } from '@shared/enums/subscription-period.enum'
import { TrafficResetEnum } from '@shared/enums/traffic-reset.enum'
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator'

/**
 * DTO для покупки подписки
 */
export class PurchaseSubscriptionDto {
  @IsEnum(SubscriptionPeriodEnum)
  period: SubscriptionPeriodEnum

  @IsEnum(PlansEnum)
  planKey: PlansEnum

  @IsEnum([PaymentMethodEnum, 'BALANCE', 'TRAFFIC'])
  method: PaymentMethodEnum | 'BALANCE' | 'TRAFFIC'

  @IsString()
  name: string

  @IsNumber()
  @IsOptional()
  periodMultiplier?: number = 1

  @IsNumber()
  devicesCount: number

  @IsBoolean()
  @IsOptional()
  isAllBaseServers?: boolean = false

  @IsBoolean()
  @IsOptional()
  isAllPremiumServers?: boolean = false

  @IsNumber()
  @IsOptional()
  trafficLimitGb?: number

  @IsBoolean()
  @IsOptional()
  isUnlimitTraffic?: boolean = false

  @IsEnum(TrafficResetEnum)
  trafficReset: TrafficResetEnum

  @IsArray()
  servers: string[] = []

  @IsBoolean()
  @IsOptional()
  isAutoRenewal?: boolean = true
}
