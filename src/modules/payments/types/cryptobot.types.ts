export enum CryptoPayAssetEnum {
  USDT = 'USDT',
  TON = 'TON',
  BTC = 'BTC',
  ETH = 'ETH',
  LTC = 'LTC',
  BNB = 'BNB',
  TRX = 'TRX',
  USDC = 'USDC',
}

export enum CryptoPayInvoiceStatusEnum {
  ACTIVE = 'active',
  PAID = 'paid',
  EXPIRED = 'expired',
}

export interface CreateInvoiceParams {
  asset: CryptoPayAssetEnum
  amount: string // строка с float, например "125.50"
  description?: string
  // сюда кладём ваш Payments.token — вебхук вернёт его в payload и по нему
  // вызывается PaymentsService.updatePayment
  payload?: string
  allow_comments?: boolean
  allow_anonymous?: boolean
  expires_in?: number // 1..2678400 сек
}

export interface CryptoPayInvoice {
  invoice_id: number
  hash: string
  currency_type: 'crypto' | 'fiat'
  asset?: CryptoPayAssetEnum
  amount: string
  bot_invoice_url: string
  mini_app_invoice_url: string
  web_app_invoice_url: string
  status: CryptoPayInvoiceStatusEnum
  payload?: string
  paid_usd_rate?: string
  fee_amount?: number
  fee_asset?: string
  created_at: string
  paid_at?: string
  expiration_date?: string
}

export interface CryptoPayApiResponse<T> {
  ok: boolean
  result?: T
  error?: {
    code: number
    name: string
  }
}

export interface CryptoPayWebhookUpdate {
  update_id: number
  update_type: 'invoice_paid'
  request_date: string
  payload: CryptoPayInvoice
}
