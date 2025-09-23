import { Injectable } from '@nestjs/common'
import axios from 'axios'
import { PinoLogger } from 'nestjs-pino'
import { FindTonPaymentsResult } from '../types/ton-payments.type'
import { TonUtimeService } from './ton-uptime.service'

@Injectable()
export class TonPaymentsService {
  private readonly apiKey = process.env.TONAPI_KEY
  private readonly wallet: string
  private readonly baseUrl = 'https://tonapi.io/v2'

  constructor(
    private readonly logger: PinoLogger,
    private readonly tonUtimeService: TonUtimeService,
  ) {
    this.wallet = process.env.TON_WALLET
  }

  /**
   * Получает транзакции с фильтром по utime
   */
  async getTransactions(fromUtime?: number) {
    const params: Record<string, string | number> = {}
    if (fromUtime) params['from_utime'] = fromUtime

    const url = `${this.baseUrl}/blockchain/accounts/${this.wallet}/transactions`

    const { data } = await axios.get(url, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
      params,
    })

    return data.transactions
  }

  /**
   * Проверка пачки paymentId в новых транзакциях
   */
  async findPayments(paymentIds: string[]): Promise<FindTonPaymentsResult> {
    // получаем lastUtime из Redis
    const lastUtime = await this.tonUtimeService.getLastUtime(this.wallet)

    // получаем транзакции с момента lastUtime
    const txs = await this.getTransactions(lastUtime + 1)

    const results: Record<string, any> = {}
    for (const id of paymentIds) results[id] = null

    for (const tx of txs) {
      const msg = tx.in_msg
      if (!msg) continue

      const comment = msg.decoded_body?.text
      const amount = msg.value

      if (comment && paymentIds.includes(comment)) {
        results[comment] = {
          from: msg.source?.address,
          amount: Number(amount) / 1e9, // nanoTON → TON
          paymentId: comment,
          hash: tx.hash,
          utime: tx.utime,
        }
      }
    }

    return results
  }
}
