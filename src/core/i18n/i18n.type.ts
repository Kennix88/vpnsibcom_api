/* eslint-disable */
import { Path } from 'nestjs-i18n'

export interface I18nTranslations {
  telegraf: {
    start: {
      welcome: string
    }
  }
  subscription: {
    created: string
    renewed: string
    renewal_failed_balance: string
    deactivated: string
    expiration_reminder: string
    expiration_reminder_low_balance: string
    purchased: string
    period: {
      trial_with_days: string
    }
  }
  subscriptions: {
    purchase: {
      success: string
      failed: string
      insufficient_balance: string
      subscription_limit_exceeded: string
      user_not_found: string
    }
    free_plan: {
      activated: string
      failed: string
      not_available: string
    }
    auto_renewal: {
      enabled: string
      disabled: string
      success: string
      failed: string
      insufficient_balance: string
    }
    expiration: {
      notification: string
      expired: string
    }
  }
  referral: {
    defaultName: string
    rewardReceived: string
  }
  time: {
    days: {
      '1': string
      '2': string
      '3': string
      '4': string
      '5': string
      other: string
    }
  }
  payments: {
    payment_failed: string
    payment_success: string
    invoice: {
      title: string
      description: string
    }
    referral: {
      reward_title: string
      hold_reward: string
      available_reward: string
      referral_label: string
      level_label: string
    }
  }
  'subscription.renewed': string
  'subscription.renewal_failed_balance': string
  'subscription.deactivated': string
  'subscription.expiration_reminder': string
  'subscription.expiration_reminder_low_balance': string
  'time.days.0': string
  'time.days.1': string
  'time.days.2': string
}
/* prettier-ignore */
export type I18nPath = Path<I18nTranslations>;
