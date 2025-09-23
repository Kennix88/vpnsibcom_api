export interface TonPaymentResult {
  from: string | null
  amount: number
  paymentId: string
  hash: string
  utime: number
}

export type FindTonPaymentsResult = Record<string, TonPaymentResult | null>
