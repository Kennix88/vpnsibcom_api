export enum XRocketInvoiceStatusEnum {
  ACTIVE = 'active',
  PAID = 'paid',
  EXPIRED = 'expired',
}

export enum XRocketWebhookTypeEnum {
  INVOICE_PAY = 'invoicePay',
  SUBSCRIPTION_PAY = 'subscriptionPay',
  SUBSCRIPTION_END = 'subscriptionEnd',
  EXCHANGE_ORDER_COMPLETE = 'exchangeOrderComplete',
}

export interface CreateInvoiceParams {
  amount?: number // не указывать вместе с minPayment — это разные режимы (фикс. сумма / мульти-инвойс)
  minPayment?: number
  numPayments?: number // default 1
  currency: string // см. GET /currencies/available
  description?: string
  hiddenMessage?: string
  commentsEnabled?: boolean
  callbackUrl?: string
  payload?: string // сюда кладём ваш Payments.token
  expiredIn?: number // 0..86400 сек, 0 = без срока
  platformId?: string
}

export interface XRocketInvoice {
  id: number
  amount: number
  minPayment: number
  totalActivations?: number
  activationsLeft?: number
  description?: string
  hiddenMessage?: string
  payload?: string
  callbackUrl?: string
  commentsEnabled?: boolean
  currency: string
  created: string
  paid?: string
  status: XRocketInvoiceStatusEnum
  expiredIn?: number
  link: string
}

export interface XRocketPaymentStat {
  id: string
  userId?: number
  paymentNum: number
  paymentAmount: number
  paymentAmountReceived: number
  comment?: string
  paid: string
}

export interface XRocketApiResponse<T> {
  success: boolean
  data?: T
  message?: string
}

// data в WebhookDto для типа invoicePay — это PayInvoiceDto: инвойс + конкретный платёж
export interface XRocketWebhookInvoicePayData extends XRocketInvoice {
  payment: XRocketPaymentStat
}

export interface XRocketWebhookUpdate {
  type: XRocketWebhookTypeEnum
  timestamp: string
  data: XRocketWebhookInvoicePayData
}
