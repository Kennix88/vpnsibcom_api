import { PlansEnum } from '@modules/plans/types/plans.enum'
import { PaymentMethodEnum } from '@shared/enums/payment-method.enum'
import { SubscriptionPeriodEnum } from '@shared/enums/subscription-period.enum'
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
} from 'class-validator'

/**
 * DTO для покупки подписки
 */
export class PurchaseInvoiceSubscriptionDto {
  @IsEnum(SubscriptionPeriodEnum)
  period: SubscriptionPeriodEnum

  @IsEnum(PlansEnum)
  planKey: PlansEnum

  @IsEnum(PaymentMethodEnum)
  method: PaymentMethodEnum

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

  @IsArray()
  servers: string[] = []

  @IsBoolean()
  @IsOptional()
  isAutoRenewal?: boolean = true
}
