import { IsBoolean, IsEnum, IsOptional } from 'class-validator'
import { SubscriptionPeriodEnum } from '@shared/enums/subscription-period.enum'

/**
 * DTO для покупки подписки
 */
export class PurchaseSubscriptionDto {
  /**
   * Период подписки
   */
  @IsEnum(SubscriptionPeriodEnum)
  period: SubscriptionPeriodEnum

  /**
   * Флаг автоматического продления подписки
   */
  @IsBoolean()
  @IsOptional()
  isAutoRenewal?: boolean = false
}