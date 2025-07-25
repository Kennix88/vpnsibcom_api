/* eslint-disable */
import { Path } from 'nestjs-i18n'

export interface I18nTranslations {
  TOO_MANY_REQUESTS: string;
  ERROR_MESSAGES: {
    INTERNAL_SERVER_ERROR: string;
    RECORD_NOT_FOUND: string;
    UNIQUE_CONSTRAINT_FAILED: string;
    FOREIGN_KEY_CONSTRAINT_FAILED: string;
    INPUT_DATA_TOO_LONG: string;
    RECORD_DOES_NOT_EXIST: string;
    DATABASE_ERROR_OCCURRED: string;
    VALIDATION_ERROR: string;
  };
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
    deleted: string
    deleted_auto: string
    expiration_reminder: string
    expiration_reminder_low_balance: string
    purchased: string
    period: {
      trial_with_days: string
    }
    token_reset: string;
    auto_renewal_enabled: string;
    auto_renewal_disabled: string;
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
    hold: {
      released: string
    }
  }
}
/* prettier-ignore */
export type I18nPath = Path<I18nTranslations>;
