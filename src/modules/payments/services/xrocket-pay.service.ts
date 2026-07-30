import { Injectable, InternalServerErrorException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios, { AxiosInstance } from 'axios'
import { createHash, createHmac, timingSafeEqual } from 'crypto'
import { PinoLogger } from 'nestjs-pino'
import {
  CreateInvoiceParams,
  XRocketApiResponse,
  XRocketInvoice,
} from '../types/xrocket-pay.types'

@Injectable()
export class XRocketPayService {
  private readonly client: AxiosInstance
  private readonly webhookSecretKey: Buffer

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    const token = this.configService.getOrThrow<string>('XROCKET_API_KEY')
    // сервер из официальной спеки — не xrocket.tg
    const baseURL = this.configService.get<string>(
      'XROCKET_URL',
      'https://pay.xrocket.exchange/',
    )

    this.client = axios.create({
      baseURL,
      timeout: 10000,
      headers: { 'Rocket-Pay-Key': token },
    })

    // подтверждено в спеке: секрет для HMAC — SHA256 от токена приложения,
    // та же схема, что у CryptoPay
    this.webhookSecretKey = createHash('sha256').update(token).digest()
  }

  async createInvoice(params: CreateInvoiceParams): Promise<XRocketInvoice> {
    try {
      const response = await this.client.post<
        XRocketApiResponse<XRocketInvoice>
      >('tg-invoices', params)

      if (!response.data.success || !response.data.data) {
        this.logger.error({
          msg: 'xRocket createInvoice returned success=false',
          message: response.data.message,
        })
        throw new InternalServerErrorException(
          'Failed to create xRocket invoice',
        )
      }

      return response.data.data
    } catch (e) {
      this.logger.error({
        msg: 'Error creating xRocket invoice',
        err: e instanceof Error ? e.message : String(e),
      })
      throw new InternalServerErrorException('Failed to create xRocket invoice')
    }
  }

  /**
   * rawBody должен быть сырым телом запроса (Buffer/string) — HMAC считается
   * именно по нему, а не по пересериализованному через JSON.stringify объекту.
   */
  verifySignature(rawBody: Buffer | string, signatureHeader?: string): boolean {
    if (!signatureHeader) return false

    const hmac = createHmac('sha256', this.webhookSecretKey)
      .update(rawBody)
      .digest('hex')

    const a = Buffer.from(hmac, 'hex')
    const b = Buffer.from(signatureHeader, 'hex')
    if (a.length !== b.length) return false

    return timingSafeEqual(a, b)
  }
}
