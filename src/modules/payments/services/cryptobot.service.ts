// crypto-pay.service.ts
import { Injectable, InternalServerErrorException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios, { AxiosInstance } from 'axios'
import { createHash, createHmac, timingSafeEqual } from 'crypto'
import { PinoLogger } from 'nestjs-pino'
import {
  CreateInvoiceParams,
  CryptoPayApiResponse,
  CryptoPayInvoice,
} from '../types/cryptobot.types'

@Injectable()
export class CryptobotService {
  private readonly client: AxiosInstance
  private readonly webhookSecretKey: Buffer

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    const token = this.configService.getOrThrow<string>('CRYPTOBOT_API_KEY')
    const baseURL = this.configService.getOrThrow<string>('CRYPTOBOT_URL')

    this.client = axios.create({
      baseURL,
      timeout: 10000,
      headers: { 'Crypto-Pay-API-Token': token },
    })

    // секрет для HMAC — SHA256 от токена приложения, см. "Verifying webhook updates"
    this.webhookSecretKey = createHash('sha256').update(token).digest()
  }

  async createInvoice(params: CreateInvoiceParams): Promise<CryptoPayInvoice> {
    try {
      const response = await this.client.post<
        CryptoPayApiResponse<CryptoPayInvoice>
      >('createInvoice', params)

      if (!response.data.ok || !response.data.result) {
        console.error({
          msg: 'CryptoPay createInvoice returned ok=false',
          error: response.data.error,
        })
        this.logger.error({
          msg: 'CryptoPay createInvoice returned ok=false',
          error: response.data.error,
        })
        throw new InternalServerErrorException(
          'Failed to create CryptoPay invoice',
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
        msg: 'Error creating CryptoPay invoice',
        err: e instanceof Error ? e.message : String(e),
      })
      throw new InternalServerErrorException(
        'Failed to create CryptoPay invoice',
      )
    }
  }

  /**
   * rawBody должен быть сырым телом запроса (Buffer/string), а не
   * пересериализованным через JSON.stringify объектом — иначе HMAC не сойдётся.
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
