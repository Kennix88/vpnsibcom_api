import { PlansEnum } from '@prisma/client'
import { PaymentMethodEnum } from '@shared/enums/payment-method.enum'
import { SubscriptionPeriodEnum } from '@shared/enums/subscription-period.enum'
import { ServerDataInterface } from './servers-data.interface'

export interface GetSubscriptionConfigResponseInterface {
  subscription: SubscriptionDataInterface
  marzbanSubRes?: MarzbanResponseInterface
}

export interface SubscriptionResponseInterface {
  telegramPremiumRatio: number
  devicesPriceStars: number
  serversPriceStars: number
  premiumServersPriceStars: number
  allBaseServersPriceStars: number
  allPremiumServersPriceStars: number
  trafficGbPriceStars: number
  unlimitTrafficPriceStars: number
  hourRatioPayment: number
  dayRatioPayment: number
  weekRatioPayment: number
  threeMouthesRatioPayment: number
  sixMouthesRatioPayment: number
  oneYearRatioPayment: number
  twoYearRatioPayment: number
  threeYearRatioPayment: number
  indefinitelyRatio: number
  fixedPriceStars: number
  telegramPartnerProgramRatio: number
  subscriptions: SubscriptionDataInterface[]
}

export interface SubscriptionDataInterface {
  id: string
  period: SubscriptionPeriodEnum
  periodMultiplier: number
  planKey: PlansEnum
  isActive: boolean
  isInvoicing: boolean
  isCreated: boolean
  isAutoRenewal: boolean
  nextRenewalStars?: number
  isFixedPrice: boolean
  fixedPriceStars?: number
  devicesCount: number
  isAllBaseServers: boolean
  isAllPremiumServers: boolean
  trafficLimitGb?: number
  isUnlimitTraffic: boolean

  lastUserAgent?: string
  dataLimit?: number
  usedTraffic: number
  lifeTimeUsedTraffic: number
  links: string[]

  servers: ServerDataInterface[]
  baseServersCount: number
  premiumServersCount: number

  createdAt: Date
  updatedAt: Date
  expiredAt?: Date
  onlineAt?: Date

  token: string
  subscriptionUrl: string

  announce?: string
}

export interface MarzbanResponseInterface {
  headers: {
    'content-disposition': string
    'content-type': string
  }
  body: any
}

export interface CreateSubscriptionDataInterface {
  planKey: PlansEnum
  period: SubscriptionPeriodEnum
  periodMultiplier: number
  isAutoRenewal?: boolean
  isFixedPrice: boolean
  devicesCount: number
  isAllBaseServers: boolean
  isAllPremiumServers: boolean
  servers?: string[]
  trafficLimitGb?: number
  isUnlimitTraffic: boolean
}

export interface CreateInvoiceSubscriptionDataInterface
  extends CreateSubscriptionDataInterface {
  method: PaymentMethodEnum
}

export interface ChangeSubscriptionConditionsDataInterface
  extends CreateSubscriptionDataInterface {
  subscriptionId: string
}

export interface CreateSubscriptionDataAddTgIdInterface
  extends CreateSubscriptionDataInterface {
  telegramId: string
}
