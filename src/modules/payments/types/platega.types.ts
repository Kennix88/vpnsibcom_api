// Подтверждено документально только значение 2 (СБП). Остальные коды не
// опубликованы в доступной части доки — уточните у менеджера Platega
// при подключении нового метода и дополните enum.
export enum PlategaPaymentMethodEnum {
  SBP = 2,
  CARD = 11,
}

// Из примеров ответов видел PENDING (создание) и CONFIRMED/CANCELED/CHARGEBACKED
// (колбэк). Полного enum со всеми промежуточными статусами документация
// в доступных фрагментах не показала — при неизвестном значении не
// финализируем платёж молча, см. controller.
export enum PlategaTransactionStatusEnum {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  CANCELED = 'CANCELED',
  CHARGEBACKED = 'CHARGEBACKED',
}

export interface CreateTransactionParams {
  paymentMethod: PlategaPaymentMethodEnum
  paymentDetails: {
    amount: number
    currency: string
  }
  description?: string
  return?: string
  failedUrl?: string
  payload?: string // сюда кладём ваш Payments.token
}

export interface CreateTransactionResponse {
  paymentMethod: string // здесь СТРОКА ("SBPQR"), а не число, как в запросе
  transactionId: string
  redirect: string // ссылка на оплату
  return?: string
  paymentDetails: string // в примере ответа это строка "100 RUB", не объект
  status: PlategaTransactionStatusEnum
  expiresIn: string
  merchantId: string
  usdtRate?: number
}

export interface TransactionStatusResponse {
  id: string
  status: PlategaTransactionStatusEnum
  paymentDetails: { amount: number; currency: string }
  merchantName?: string
  // да, в документации именно "mechantId" (опечатка в самой Platega API,
  // не наша) — если у вас будет падать парсинг из-за строгой типизации,
  // это первое, что стоит проверить
  mechantId?: string
  comission?: number
  paymentMethod?: string
  expiresIn?: string
  return?: string
  comissionUsdt?: number
  amountUsdt?: number
  qr?: string
  payformSuccessUrl?: string
  payload?: string
  comissionType?: number
  externalId?: string
  description?: string
}

// Тело вебхука — минимальный набор полей из примера в доке
export interface PlategaWebhookPayload {
  id: string
  amount: number
  currency: string
  status: PlategaTransactionStatusEnum
  paymentMethod: number
  payload: string
}
