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
export class PurchaseSubscriptionDto {
  @IsEnum(SubscriptionPeriodEnum)
  period: SubscriptionPeriodEnum

  @IsNumber()
  @IsOptional()
  periodMultiplier?: number = 1

  @IsBoolean()
  @IsOptional()
  isFixedPrice?: boolean = false

  @IsNumber()
  devicesCount: number

  @IsBoolean()
  @IsOptional()
  isAllServers?: boolean = false

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
