import { Injectable, InternalServerErrorException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios, { AxiosInstance } from 'axios'
import { timingSafeEqual } from 'crypto'
import { PinoLogger } from 'nestjs-pino'
import {
  CreateTransactionParams,
  CreateTransactionResponse,
  TransactionStatusResponse,
} from '../types/platega.types'

@Injectable()
export class PlategaService {
  private readonly client: AxiosInstance
  private readonly merchantId: string
  private readonly secret: string

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.merchantId = this.configService.getOrThrow<string>('PLATEGA_SHOP_ID')
    this.secret = this.configService.getOrThrow<string>('PLATEGA_API_KEY')

    this.client = axios.create({
      baseURL: 'https://app.platega.io/',
      timeout: 10000,
      headers: {
        'X-MerchantId': this.merchantId,
        'X-Secret': this.secret,
        'Content-Type': 'application/json',
      },
    })
  }

  async createTransaction(
    params: CreateTransactionParams,
  ): Promise<CreateTransactionResponse> {
    try {
      // ВАЖНО: поле id намеренно не передаём — по документации оно
      // генерируется на стороне Platega автоматически
      const response = await this.client.post<CreateTransactionResponse>(
        'transaction/process',
        params,
      )
      return response.data
    } catch (e) {
      this.logger.error({
        msg: 'Error creating Platega transaction',
        err: e instanceof Error ? e.message : String(e),
      })
      throw new InternalServerErrorException(
        'Failed to create Platega transaction',
      )
    }
  }

  async getTransactionStatus(id: string): Promise<TransactionStatusResponse> {
    try {
      const response = await this.client.get<TransactionStatusResponse>(
        `transaction/${id}`,
      )
      return response.data
    } catch (e) {
      this.logger.error({
        msg: 'Error fetching Platega transaction status',
        id,
        err: e instanceof Error ? e.message : String(e),
      })
      throw new InternalServerErrorException(
        'Failed to fetch Platega transaction status',
      )
    }
  }

  /**
   * У Platega нет HMAC-подписи тела вебхука — аутентификация построена на
   * сверке тех же заголовков X-MerchantId/X-Secret, что вы используете для
   * исходящих запросов. Сравнение — строго constant-time, чтобы не давать
   * временную атаку по этим двум статичным секретам.
   */
  verifyWebhookHeaders(
    merchantIdHeader?: string,
    secretHeader?: string,
  ): boolean {
    if (!merchantIdHeader || !secretHeader) return false

    const merchantOk = this.timingSafeStringEqual(
      merchantIdHeader,
      this.merchantId,
    )
    const secretOk = this.timingSafeStringEqual(secretHeader, this.secret)

    return merchantOk && secretOk
  }

  private timingSafeStringEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a)
    const bufB = Buffer.from(b)
    if (bufA.length !== bufB.length) return false
    return timingSafeEqual(bufA, bufB)
  }
}
