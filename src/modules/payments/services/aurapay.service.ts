import { RedisService } from '@core/redis/redis.service'
import {
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createHmac, timingSafeEqual } from 'crypto'
import { PinoLogger } from 'nestjs-pino'
import {
  AurapayApiErrorResponse,
  AurapayInvoice,
  AurapayPayout,
  AurapayPayoutCheckAccountResult,
  AurapayPayoutCoursesResponse,
  AurapayPayoutWithStatus,
  AurapayShopBalance,
  CheckPayoutAccountParams,
  CreateInvoiceParams,
  CreatePayoutParams,
  InvoiceLookupParams,
  PayoutLookupParams,
} from '../types/aurapay.types'

/**
 * Ошибка бизнес-логики/валидации, вернувшаяся от Aurapay (HTTP 400/404).
 * Прокидывает исходное сообщение и `data`, чтобы можно было отдать наверх как есть.
 */
export class AurapayApiException extends HttpException {
  constructor(
    message: string,
    status: number,
    public readonly data?: unknown[],
  ) {
    super({ error: message, data }, status)
  }
}

const WEBHOOK_DEDUPE_TTL_SECONDS = 60 * 60 * 24 // 24 часа — с запасом под 5 ретраев Aurapay

@Injectable()
export class AurapayService {
  constructor(
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
    private readonly redis: RedisService,
  ) {
    this.logger.setContext(AurapayService.name)
  }

  // -------------------------------------------------------------------------
  // Инвойсы
  // -------------------------------------------------------------------------

  async createInvoice(params: CreateInvoiceParams): Promise<AurapayInvoice> {
    return this.request<AurapayInvoice>('POST', '/invoice/create', params)
  }

  async getInvoiceStatus(params: InvoiceLookupParams): Promise<AurapayInvoice> {
    return this.request<AurapayInvoice>('POST', '/invoice/status', params)
  }

  // -------------------------------------------------------------------------
  // Магазин
  // -------------------------------------------------------------------------

  async getShopBalance(): Promise<AurapayShopBalance> {
    return this.request<AurapayShopBalance>('GET', '/shop/balance')
  }

  // -------------------------------------------------------------------------
  // Выплаты
  // -------------------------------------------------------------------------

  async createPayout(params: CreatePayoutParams): Promise<AurapayPayout> {
    return this.request<AurapayPayout>('POST', '/payout/create', params)
  }

  async getPayoutStatus(
    params: PayoutLookupParams,
  ): Promise<AurapayPayoutWithStatus> {
    return this.request<AurapayPayoutWithStatus>(
      'POST',
      '/payout/status',
      params,
    )
  }

  async getPayoutCourses(): Promise<AurapayPayoutCoursesResponse> {
    return this.request<AurapayPayoutCoursesResponse>('GET', '/payout/courses')
  }

  async checkPayoutAccount(
    params: CheckPayoutAccountParams,
  ): Promise<AurapayPayoutCheckAccountResult> {
    return this.request<AurapayPayoutCheckAccountResult>(
      'POST',
      '/payout/check-account',
      params,
    )
  }

  // -------------------------------------------------------------------------
  // Подпись вебхуков (общий алгоритм для инвойсов и выплат)
  //
  // Алгоритм из документации: ключи payload сортируются по алфавиту,
  // значения конкатенируются в одну строку в этом порядке,
  // строка хешируется HMAC-SHA256 с секретным ключом #2 (AURAPAY_SECRET_KEY).
  // -------------------------------------------------------------------------

  verifyWebhookSignature(
    payload: Record<string, unknown>,
    signature: string | undefined | null,
  ): boolean {
    if (!signature) {
      return false
    }

    const expected = this.buildSignature(payload)
    const expectedBuf = Buffer.from(expected, 'utf8')
    const actualBuf = Buffer.from(signature, 'utf8')

    if (expectedBuf.length !== actualBuf.length) {
      return false
    }

    return timingSafeEqual(expectedBuf, actualBuf)
  }

  private buildSignature(payload: Record<string, unknown>): string {
    const secretKey =
      this.configService.getOrThrow<string>('AURAPAY_SECRET_KEY')

    const concatenated = Object.keys(payload)
      .sort()
      .map((key) => this.stringifyValue(payload[key]))
      .join('')

    return createHmac('sha256', secretKey).update(concatenated).digest('hex')
  }

  private stringifyValue(value: unknown): string {
    if (value === null || value === undefined) {
      return ''
    }
    return String(value)
  }

  // -------------------------------------------------------------------------
  // Идемпотентность вебхуков (Aurapay ретраит до 5 раз, пока не получит
  // HTTP 200; кроме того, тот же вебхук могут доставить чуть позже повторно
  // и без ретрая — так что дедуп нужен постоянный, не только на время
  // обработки).
  //
  // Схема:
  //  1) permanent "processed"-флаг проверяется до начала работы — если стоит,
  //     значит бизнес-логика уже отработала успешно, просто отвечаем 200;
  //  2) сама обработка идёт под distributed lock (withLock) — на случай двух
  //     параллельных ретраев одного и того же вебхука;
  //  3) "processed"-флаг ставится ТОЛЬКО после успешного завершения fn —
  //     если хендлер в контроллере бросит исключение, флаг не появится,
  //     и следующий ретрай Aurapay отработает бизнес-логику заново, а не
  //     будет молча проигнорирован.
  // -------------------------------------------------------------------------

  async isWebhookProcessed(dedupeKey: string): Promise<boolean> {
    const exists = await this.redis.exists(this.buildProcessedKey(dedupeKey))
    return exists === 1
  }

  /**
   * Выполняет fn под локом и помечает вебхук обработанным только при успехе.
   * Возвращает null, если лок занят (параллельный ретрай уже работает над этим же вебхуком) —
   * в таком случае просто отвечаем Aurapay 200 и ничего не делаем.
   */
  async runWebhookHandlerOnce<T>(
    dedupeKey: string,
    fn: () => Promise<T>,
  ): Promise<T | null> {
    return this.redis.withLock(this.buildLockKey(dedupeKey), 30, async () => {
      const result = await fn()
      await this.redis.setWithExpiryNx(
        this.buildProcessedKey(dedupeKey),
        '1',
        WEBHOOK_DEDUPE_TTL_SECONDS,
      )
      return result
    })
  }

  private buildProcessedKey(dedupeKey: string): string {
    return `aurapay:webhook:processed:${dedupeKey}`
  }

  private buildLockKey(dedupeKey: string): string {
    return `aurapay:webhook:lock:${dedupeKey}`
  }

  // -------------------------------------------------------------------------
  // Низкоуровневый HTTP-клиент
  // -------------------------------------------------------------------------

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const baseUrl = this.configService.getOrThrow<string>('AURAPAY_URL')
    const apiKey = this.configService.getOrThrow<string>('AURAPAY_API_KEY')
    const shopId = this.configService.getOrThrow<string>('AURAPAY_SHOP_ID')

    const url = `${baseUrl.replace(/\/+$/, '')}${path}`

    let response: Response
    try {
      response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-ApiKey': apiKey,
          'X-ShopId': shopId,
        },
        body: body ? JSON.stringify(body) : undefined,
      })
    } catch (error) {
      this.logger.error({ err: error, url, method }, 'Aurapay: сеть недоступна')
      throw new ServiceUnavailableException('Aurapay недоступен')
    }

    const raw = await response.text()
    let parsed: unknown

    if (raw) {
      try {
        parsed = JSON.parse(raw)
      } catch (error) {
        this.logger.error(
          { err: error, url, method, status: response.status },
          'Aurapay: невалидный JSON в ответе',
        )
        throw new ServiceUnavailableException('Aurapay вернул невалидный ответ')
      }
    }

    if (!response.ok) {
      const errorBody = parsed as AurapayApiErrorResponse | undefined
      this.logger.warn(
        { url, method, status: response.status, body: errorBody },
        'Aurapay: ошибка API',
      )
      throw new AurapayApiException(
        errorBody?.error ?? 'Unknown Aurapay error',
        response.status,
        errorBody?.data,
      )
    }

    return parsed as T
  }
}
