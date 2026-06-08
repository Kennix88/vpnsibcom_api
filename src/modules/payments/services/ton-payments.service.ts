import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios from 'axios'
import { PinoLogger } from 'nestjs-pino'
import { FindTonPaymentsResponse } from '../types/ton-payments.type'
import { TonUtimeService } from './ton-uptime.service'

// FIX #4: Максимальное количество страниц пагинации во избежание бесконечного цикла
const MAX_PAGES = 50

@Injectable()
export class TonPaymentsService {
  private readonly apiKey: string
  private readonly wallet: string
  private readonly baseUrl = 'https://tonapi.io/v2'

  constructor(
    private readonly logger: PinoLogger,
    private readonly tonUtimeService: TonUtimeService,
    // FIX #5: ConfigService вместо прямого process.env — переменные
    // валидируются при старте приложения, а не в момент первого вызова.
    private readonly configService: ConfigService,
  ) {
    this.apiKey = this.configService.getOrThrow<string>('TONAPI_KEY')
    this.wallet = this.configService.getOrThrow<string>('TON_WALLET')
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

    // FIX #4: добавлен счётчик страниц — при достижении MAX_PAGES
    // цикл прерывается с предупреждением, чтобы исключить бесконечное выполнение
    // (например, если API постоянно возвращает полные пачки с одними данными).
    let page = 0

    try {
      while (true) {
        if (page >= MAX_PAGES) {
          this.logger.warn({
            msg: `getTransactions: reached MAX_PAGES limit (${MAX_PAGES}), stopping pagination`,
            wallet: this.wallet,
            fromUtime,
            totalLoaded: allTransactions.length,
          })
          break
        }

        page++

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

        // Если получили меньше лимита — это последняя страница
        if (transactions.length < limit) break

        const lastTx = transactions[transactions.length - 1]

        // FIX #4: дополнительная защита — если before_lt не изменился
        // (API вернул те же данные), прерываем цикл во избежание зависания.
        const nextBeforeLt = lastTx.lt
        if (nextBeforeLt === beforeLt) {
          this.logger.warn({
            msg: 'getTransactions: before_lt did not change, breaking to avoid infinite loop',
            beforeLt,
            wallet: this.wallet,
          })
          break
        }

        beforeLt = nextBeforeLt

        if (fromUtime && lastTx.utime <= fromUtime) break
      }
    } catch (e) {
      this.logger.error({
        msg: 'Error fetching transactions from TonAPI',
        error: e instanceof Error ? e.message : String(e),
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
    const lastUtime = await this.tonUtimeService.getLastUtime(this.wallet)

    this.logger.info({
      msg: `Searching for TON payments since utime ${lastUtime}`,
      count: paymentIds.length,
    })

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
