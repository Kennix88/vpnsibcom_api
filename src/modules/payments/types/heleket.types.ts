export enum HeleketPaymentStatusEnum {
  PAID = 'paid',
  PAID_OVER = 'paid_over',
  WRONG_AMOUNT = 'wrong_amount',
  PROCESS = 'process',
  CONFIRM_CHECK = 'confirm_check',
  WRONG_AMOUNT_WAITING = 'wrong_amount_waiting',
  CHECK = 'check',
  FAIL = 'fail',
  CANCEL = 'cancel',
  SYSTEM_FAIL = 'system_fail',
  REFUND_PROCESS = 'refund_process',
  REFUND_FAIL = 'refund_fail',
  REFUND_PAID = 'refund_paid',
  LOCKED = 'locked',
}

export interface CreateInvoiceParams {
  amount: string // строка, разделитель дробной части — точка, например "125.50"
  currency: string
  // ваш Payments.token — уникален и требуется Heleket-у: повторный запрос с
  // тем же order_id вернёт существующий инвойс вместо создания нового
  order_id: string
  network?: string
  url_return?: string
  url_success?: string
  url_callback?: string
  is_payment_multiple?: boolean
  lifetime?: number // 300..43200 сек, default 3600
  to_currency?: string
  additional_data?: string
}

export interface HeleketInvoice {
  uuid: string
  order_id: string
  amount: string
  payment_amount: string | null
  payer_amount: string | null
  payer_currency: string | null
  currency: string
  merchant_amount: string | null
  network: string | null
  address: string | null
  from: string | null
  txid: string | null
  payment_status: HeleketPaymentStatusEnum
  status: HeleketPaymentStatusEnum
  url: string
  expired_at: number
  is_final: boolean
  additional_data: string | null
  created_at: string
  updated_at: string
  address_qr_code?: string
  payment_amount_usd?: string
  commission?: string
}

export interface HeleketApiSuccessResponse<T> {
  state: 0
  result: T
}

export interface HeleketApiErrorResponse {
  state: 1
  message?: string
  errors?: Record<string, string[]>
}

// тело вебхука — sign лежит на верхнем уровне вместе с данными платежа,
// а не в отдельном поле/заголовке
export interface HeleketWebhookPayload {
  type: 'payment' | 'wallet'
  uuid: string
  order_id: string
  amount: string
  payment_amount: string
  payment_amount_usd: string
  merchant_amount: string
  commission: string
  is_final: boolean
  status: HeleketPaymentStatusEnum
  from: string | null
  wallet_address_uuid: string | null
  network: string
  currency: string
  payer_currency: string
  additional_data: string | null
  txid?: string
  sign: string
  [key: string]: unknown
}
