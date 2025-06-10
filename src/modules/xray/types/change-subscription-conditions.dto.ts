import { SubscriptionPeriodEnum } from '@shared/enums/subscription-period.enum'
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator'

export class ChangeSubscriptionConditionsDto {
  @IsString()
  subscriptionId: string

  @IsEnum(SubscriptionPeriodEnum)
  period: SubscriptionPeriodEnum

  @IsNumber()
  periodMultiplier: number

  @IsBoolean()
  isFixedPrice: boolean

  @IsNumber()
  devicesCount: number

  @IsBoolean()
  isAllBaseServers: boolean

  @IsBoolean()
  isAllPremiumServers: boolean

  @IsNumber()
  @IsOptional()
  trafficLimitGb?: number

  @IsBoolean()
  isUnlimitTraffic: boolean

  @IsArray()
  @IsOptional()
  servers?: string[]

  @IsBoolean()
  @IsOptional()
  isAutoRenewal?: boolean
}
