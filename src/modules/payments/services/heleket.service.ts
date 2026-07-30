import { Injectable, InternalServerErrorException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios, { AxiosInstance } from 'axios'
import { createHash, timingSafeEqual } from 'crypto'
import { PinoLogger } from 'nestjs-pino'
import {
  CreateInvoiceParams,
  HeleketApiErrorResponse,
  HeleketApiSuccessResponse,
  HeleketInvoice,
} from '../types/heleket.types'

@Injectable()
export class HeleketService {
  private readonly client: AxiosInstance
  private readonly paymentApiKey: string

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    const merchantUuid =
      this.configService.getOrThrow<string>('HELEKET_SHOP_ID')
    // Именно платёжный API-ключ (Payment API key) — у Heleket отдельные ключи
    // для payments и payouts, перепутать легко и подпись просто не сойдётся
    this.paymentApiKey =
      this.configService.getOrThrow<string>('HELEKET_API_KEY')

    this.client = axios.create({
      baseURL: 'https://api.heleket.com/',
      timeout: 10000,
      headers: {
        merchant: merchantUuid,
        'Content-Type': 'application/json',
      },
    })
  }

  /**
   * Heleket требует escaping "/" -> "\/" в JSON-строке перед хешированием —
   * это поведение PHP json_encode по умолчанию, и подпись считается именно
   * от такой строки. Без этого шага sign не совпадёт на любых данных,
   * где встречается "/" (например URL или txid).
   */
  private stringifyForSign(data: object): string {
    return JSON.stringify(data).replace(/\//g, '\\/')
  }

  private buildSignature(data: object): string {
    const jsonString = this.stringifyForSign(data)
    const base64 = Buffer.from(jsonString, 'utf-8').toString('base64')
    return createHash('md5')
      .update(base64 + this.paymentApiKey)
      .digest('hex')
  }

  async createInvoice(params: CreateInvoiceParams): Promise<HeleketInvoice> {
    const jsonBody = this.stringifyForSign(params)
    const base64 = Buffer.from(jsonBody, 'utf-8').toString('base64')
    const sign = createHash('md5')
      .update(base64 + this.paymentApiKey)
      .digest('hex')

    try {
      const response = await this.client.post<
        HeleketApiSuccessResponse<HeleketInvoice> | HeleketApiErrorResponse
      >('v1/payment', jsonBody, {
        headers: { sign, 'Content-Type': 'application/json' },
      })

      if (response.data.state !== 0) {
        const err = response.data as HeleketApiErrorResponse
        this.logger.error({
          msg: 'Heleket createInvoice returned state=1',
          message: err.message,
          errors: err.errors,
        })
        throw new InternalServerErrorException(
          'Failed to create Heleket invoice',
        )
      }

      return response.data.result
    } catch (e) {
      console.error({
        msg: 'Error creating CryptoPay invoice',
        err: e instanceof Error ? e.message : String(e),
        url: axios.isAxiosError(e) ? e.config?.url : undefined,
        status: axios.isAxiosError(e) ? e.response?.status : undefined,
        data: axios.isAxiosError(e) ? e.response?.data : undefined,
      })
      this.logger.error({
        msg: 'Error creating Heleket invoice',
        err: e instanceof Error ? e.message : String(e),
      })
      throw new InternalServerErrorException('Failed to create Heleket invoice')
    }
  }

  /**
   * Подпись лежит внутри тела вебхука (payload.sign), а не в HTTP-заголовке.
   * Проверка: убрать sign из объекта, пересобрать JSON тем же способом,
   * что и при исходящих запросах, и сравнить хеши.
   */
  verifyWebhookSignature(payload: Record<string, unknown>): boolean {
    const { sign, ...dataWithoutSign } = payload

    if (!sign || typeof sign !== 'string') return false

    const expectedSign = this.buildSignature(dataWithoutSign)

    const a = Buffer.from(expectedSign, 'hex')
    const b = Buffer.from(sign, 'hex')
    if (a.length !== b.length) return false

    return timingSafeEqual(a, b)
  }
}
