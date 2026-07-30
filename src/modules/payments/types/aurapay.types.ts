import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator'

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export enum AurapayInvoiceStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  EXPIRED = 'EXPIRED',
}

export enum AurapayPaymentService {
  CARD = 'card',
  SBP = 'sbp',
}

export enum AurapayPayoutService {
  SBP = 'sbp',
  CARD_RU = 'card_ru',
  USDT_TRC20 = 'usdt-trc20',
  STEAM = 'steam',
}

export enum AurapayPayoutStatus {
  PROCESSING = 'PROCESSING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}

export enum AurapayPayoutCheckAccountType {
  STEAM = 'steam',
}

// ---------------------------------------------------------------------------
// Общие модели ответов
// ---------------------------------------------------------------------------

export interface AurapayApiErrorResponse {
  error: string
  data: unknown[]
}

export interface AurapayPaymentData {
  url: string
}

export interface AurapayInvoice {
  id: string
  order_id: string
  shop_id: string
  amount: number
  comment?: string
  service: AurapayPaymentService | null
  expires_at: string
  created_at: string
  status: AurapayInvoiceStatus
  payment_data: AurapayPaymentData
}

export interface AurapayShopBalance {
  balance: number
  balance_hold: number
}

export interface AurapayPayout {
  id: string
  order_id: string
  shop_id: string
  amount: number
  amount_to_payout: number
  commission: number
  service: AurapayPayoutService
  debited: number
  wallet_to: string
}

export interface AurapayPayoutWithStatus extends AurapayPayout {
  status: AurapayPayoutStatus
}

export interface AurapayPayoutCourse {
  name: string
  course: number
}

export interface AurapayPayoutCoursesResponse {
  courses: AurapayPayoutCourse[]
}

export interface AurapayPayoutCheckAccountResult {
  result: boolean
}

// ---------------------------------------------------------------------------
// Параметры запросов к API (используются сервисом напрямую)
// ---------------------------------------------------------------------------

export interface CreateInvoiceParams {
  amount: number
  order_id: string
  success_url?: string
  fail_url?: string
  callback_url?: string
  custom_fields?: string
  comment?: string
  /** Минуты, 1-43200 (30 дней). По умолчанию на стороне Aurapay — 60 минут. */
  lifetime?: number
  service?: AurapayPaymentService
}

/** Указывается ровно одно поле: id ИЛИ order_id */
export type InvoiceLookupParams =
  | { id: string; order_id?: never }
  | { order_id: string; id?: never }

export interface CreatePayoutParams {
  amount: number
  order_id: string
  service: AurapayPayoutService
  wallet_to: string
  callback_url?: string
  /** Обязателен при service = sbp. См. таблицу банков в описании тега "Список банков для СБП" в спеке. */
  sbp_bank_id?: string
  /** 0 — комиssия с суммы выплаты (по умолчанию), 1 — с баланса магазина */
  subtract?: 0 | 1
}

/** Указывается ровно одно поле: id ИЛИ order_id */
export type PayoutLookupParams =
  | { id: string; order_id?: never }
  | { order_id: string; id?: never }

export interface CheckPayoutAccountParams {
  type: AurapayPayoutCheckAccountType
  account: string
}

// ---------------------------------------------------------------------------
// Вебхуки
// ---------------------------------------------------------------------------

export interface AurapayInvoiceWebhookPayload {
  id: string
  amount: string
  status: AurapayInvoiceStatus
  comment: string | null
  created_at: string
  expires_at: string
  service: AurapayPaymentService
  payer_details: string | null
  payer_ip: string | null
  shop_id: string
  order_id: string
  custom_fields: string | null
}

export interface AurapayPayoutWebhookPayload {
  id: string
  order_id: string
  shop_id: string
  service: AurapayPayoutService
  amount: string
  amount_to_payout: string
  commission: string
  debited: string
  wallet_to: string
  created_at: string
  status: AurapayPayoutStatus
}

// ---------------------------------------------------------------------------
// DTO для контроллера (входящие запросы от нашего фронта/бэкенда)
// ---------------------------------------------------------------------------

export class CreateInvoiceDto {
  @IsNumber()
  @IsPositive()
  amount!: number

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  order_id!: string

  @IsOptional()
  @IsUrl()
  success_url?: string

  @IsOptional()
  @IsUrl()
  fail_url?: string

  @IsOptional()
  @IsUrl()
  callback_url?: string

  @IsOptional()
  @IsString()
  custom_fields?: string

  @IsOptional()
  @IsString()
  comment?: string

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(43200)
  lifetime?: number

  @IsOptional()
  @IsIn(Object.values(AurapayPaymentService))
  service?: AurapayPaymentService
}

export class InvoiceStatusDto {
  @ValidateIf((dto: InvoiceStatusDto) => !dto.order_id)
  @IsString()
  @IsNotEmpty()
  id?: string

  @ValidateIf((dto: InvoiceStatusDto) => !dto.id)
  @IsString()
  @IsNotEmpty()
  order_id?: string
}

export class CreatePayoutDto {
  @IsNumber()
  @IsPositive()
  amount!: number

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  order_id!: string

  @IsIn(Object.values(AurapayPayoutService))
  service!: AurapayPayoutService

  @IsString()
  @MinLength(3)
  @MaxLength(255)
  wallet_to!: string

  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  callback_url?: string

  @IsOptional()
  @IsString()
  sbp_bank_id?: string

  @IsOptional()
  @IsIn([0, 1])
  subtract?: 0 | 1
}

export class PayoutStatusDto {
  @ValidateIf((dto: PayoutStatusDto) => !dto.order_id)
  @IsString()
  @IsNotEmpty()
  id?: string

  @ValidateIf((dto: PayoutStatusDto) => !dto.id)
  @IsString()
  @IsNotEmpty()
  order_id?: string
}

export class CheckPayoutAccountDto {
  @IsIn(Object.values(AurapayPayoutCheckAccountType))
  type!: AurapayPayoutCheckAccountType

  @IsString()
  @IsNotEmpty()
  account!: string
}
