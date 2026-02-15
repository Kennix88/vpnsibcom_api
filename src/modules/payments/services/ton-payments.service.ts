import { Injectable } from '@nestjs/common'
import axios from 'axios'
import { PinoLogger } from 'nestjs-pino'
import { FindTonPaymentsResponse } from '../types/ton-payments.type'
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
   * Получает транзакции с фильтром по utime и пагинацией
   * @param fromUtime - timestamp в секундах, начиная с которого получать транзакции
   * @returns Массив транзакций
   */
  async getTransactions(fromUtime?: number) {
    const allTransactions = []
    let beforeLt = 0
    const limit = 100

    try {
      while (true) {
        const params: Record<string, string | number> = { limit }
        if (fromUtime) params['from_utime'] = fromUtime
        if (beforeLt > 0) params['before_lt'] = beforeLt

        const url = `${this.baseUrl}/blockchain/accounts/${this.wallet}/transactions`

        const { data } = await axios.get(url, {
          headers: { Authorization: `Bearer ${this.apiKey}` },
          params,
        })

        const transactions = data.transactions
        if (!transactions || transactions.length === 0) break

        allTransactions.push(...transactions)

        // Если получили меньше лимита, значит это последняя страница
        if (transactions.length < limit) break

        // Устанавливаем before_lt для следующей страницы
        const lastTx = transactions[transactions.length - 1]
        beforeLt = lastTx.lt

        // Если последняя транзакция в пачке уже старее или равна fromUtime,
        // то дальше искать нет смысла (хотя TonAPI фильтрует по from_utime, это страховка)
        if (fromUtime && lastTx.utime <= fromUtime) break
      }
    } catch (e) {
      this.logger.error({
        msg: 'Error fetching transactions from TonAPI',
        error: e.message,
        wallet: this.wallet,
      })
      throw e
    }

    return allTransactions
  }

  /**
   * Проверка пачки paymentId в новых транзакциях
   * @param paymentIds - Список токенов (комментариев) платежей
   * @returns Объект с найденными платежами и максимальным utime
   */
  async findPayments(paymentIds: string[]): Promise<FindTonPaymentsResponse> {
    // получаем lastUtime из Redis
    const lastUtime = await this.tonUtimeService.getLastUtime(this.wallet)

    this.logger.info({
      msg: `Searching for TON payments since utime ${lastUtime}`,
      count: paymentIds.length,
    })

    // получаем транзакции с момента lastUtime
    const txs = await this.getTransactions(lastUtime)

    const payments: Record<string, any> = {}
    for (const id of paymentIds) payments[id] = null

    let maxUtime = lastUtime

    for (const tx of txs) {
      if (tx.utime > maxUtime) {
        maxUtime = tx.utime
      }

      const msg = tx.in_msg
      if (!msg) continue

      const comment = msg.decoded_body?.text
      const amount = msg.value

      if (comment && paymentIds.includes(comment)) {
        payments[comment] = {
          from: msg.source?.address,
          amount: Number(amount) / 1e9, // nanoTON → TON
          paymentId: comment,
          hash: tx.hash,
          utime: tx.utime,
        }

        this.logger.info({
          msg: `Found TON payment for token ${comment}`,
          hash: tx.hash,
        })
      }
    }

    return { payments, maxUtime }
  }
}
