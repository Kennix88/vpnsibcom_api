import { Settings } from '@core/prisma/generated/client'
import { PayPremiumPeriodEnum } from '../types/pay-premium.dto'

export function periodHoursCalculateUtil(period: PayPremiumPeriodEnum): number {
  switch (period) {
    case PayPremiumPeriodEnum.MONTH: {
      return 30 * 24
    }
    case PayPremiumPeriodEnum.THREE_MONTH: {
      return 3 * 30 * 24
    }
    case PayPremiumPeriodEnum.SIX_MONTH: {
      return 6 * 30 * 24
    }
    case PayPremiumPeriodEnum.YEAR: {
      return 365 * 24
    }
    case PayPremiumPeriodEnum.TWO_YEAR: {
      return 2 * 365 * 24
    }
    case PayPremiumPeriodEnum.THREE_YEAR: {
      return 3 * 365 * 24
    }
    case PayPremiumPeriodEnum.INDEFINITELY: {
      return 100 * 365 * 24
    }
    default: {
      return 30 * 24
    }
  }
}

export function periodMonthsCalculateUtil(
  period: PayPremiumPeriodEnum,
): number {
  switch (period) {
    case PayPremiumPeriodEnum.MONTH: {
      return 1
    }
    case PayPremiumPeriodEnum.THREE_MONTH: {
      return 3
    }
    case PayPremiumPeriodEnum.SIX_MONTH: {
      return 6
    }
    case PayPremiumPeriodEnum.YEAR: {
      return 12
    }
    case PayPremiumPeriodEnum.TWO_YEAR: {
      return 24
    }
    case PayPremiumPeriodEnum.THREE_YEAR: {
      return 36
    }
    case PayPremiumPeriodEnum.INDEFINITELY: {
      return 120
    }
    default: {
      return 1
    }
  }
}

export function periodRatioCalculateUtil(
  period: PayPremiumPeriodEnum,
  settings: Settings,
): number {
  switch (period) {
    case PayPremiumPeriodEnum.MONTH: {
      return 1
    }
    case PayPremiumPeriodEnum.THREE_MONTH: {
      return settings.threeMouthesRatioPayment
    }
    case PayPremiumPeriodEnum.SIX_MONTH: {
      return settings.sixMouthesRatioPayment
    }
    case PayPremiumPeriodEnum.YEAR: {
      return settings.oneYearRatioPayment
    }
    case PayPremiumPeriodEnum.TWO_YEAR: {
      return settings.twoYearRatioPayment
    }
    case PayPremiumPeriodEnum.THREE_YEAR: {
      return settings.threeYearRatioPayment
    }
    case PayPremiumPeriodEnum.INDEFINITELY: {
      return settings.indefinitelyRatio
    }
    default: {
      return 1
    }
  }
}
