import { SubscriptionPeriodEnum } from '@shared/enums/subscription-period.enum'

/**
 * Рассчитывает количество часов для периода подписки
 * @param period - Период подписки
 * @param periodMultiplier - Множитель периода
 * @param trialDays - Количество дней для пробного периода (опционально)
 * @returns Количество часов
 * @private
 */
export function periodHours(
  period: SubscriptionPeriodEnum,
  periodMultiplier: number,
): number | null {
  switch (period) {
    case SubscriptionPeriodEnum.HOUR:
      return 1 * periodMultiplier
    case SubscriptionPeriodEnum.DAY:
      return 24 * periodMultiplier
    case SubscriptionPeriodEnum.WEEK:
      return 7 * 24 * periodMultiplier
    case SubscriptionPeriodEnum.MONTH:
      return 30 * 24 * periodMultiplier
    case SubscriptionPeriodEnum.THREE_MONTH:
      return 90 * 24 * periodMultiplier
    case SubscriptionPeriodEnum.SIX_MONTH:
      return 180 * 24 * periodMultiplier
    case SubscriptionPeriodEnum.YEAR:
      return 365 * 24 * periodMultiplier
    case SubscriptionPeriodEnum.TWO_YEAR:
      return 365 * 2 * 24 * periodMultiplier
    case SubscriptionPeriodEnum.THREE_YEAR:
      return 365 * 3 * 24 * periodMultiplier
    case SubscriptionPeriodEnum.INDEFINITELY:
      return null
    case SubscriptionPeriodEnum.TRIAL:
      return 0
    default:
      return 0
  }
}
