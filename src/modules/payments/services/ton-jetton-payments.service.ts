import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Cell } from '@ton/core'
import axios from 'axios'
import { PinoLogger } from 'nestjs-pino'
import { JettonWalletService } from './jetton-wallet.service'
import { TonUtimeService } from './ton-uptime.service'

const MAX_PAGES = 50
const TRANSFER_NOTIFICATION_OPCODE = 0x7362d09c

interface ParsedTransferNotification {
  queryId: bigint
  amountUnits: bigint // сырые единицы джеттона (нужно делить на 10**decimals)
  senderOwner: string
  comment?: string
}

export interface FindJettonPaymentsResult {
  payments: Record<
    string,
    {
      from: string
      amountUnits: bigint
      paymentId: string
      hash: string
      utime: number
    } | null
  >
  maxUtime: number
  platformJettonWallet: string
}

@Injectable()
export class TonJettonPaymentsService {
  private readonly apiKey: string
  private readonly baseUrl = 'https://tonapi.io/v2'

  constructor(
    private readonly logger: PinoLogger,
    private readonly tonUtimeService: TonUtimeService,
    private readonly jettonWalletService: JettonWalletService,
    private readonly configService: ConfigService,
  ) {
    this.apiKey = this.configService.getOrThrow<string>('TONAPI_KEY')
    this.logger.setContext(TonJettonPaymentsService.name)
  }

  /**
   * Парсит тело входящего сообщения transfer_notification (TEP-74).
   * Layout: op(32) query_id(64) amount(coins) sender(addr) forward_payload(either cell)
   * Возвращает null если это не transfer_notification или парсинг не удался
   * (например, левое сообщение прилетело на этот же адрес).
   */
  private parseTransferNotification(
    rawBodyBase64: string,
  ): ParsedTransferNotification | null {
    try {
      const cell = Cell.fromBase64(rawBodyBase64)
      const slice = cell.beginParse()

      const op = slice.loadUint(32)
      if (op !== TRANSFER_NOTIFICATION_OPCODE) return null

      const queryId = slice.loadUintBig(64)
      const amountUnits = slice.loadCoins()
      const senderOwner = slice.loadAddress().toString()

      const hasForwardPayload = slice.loadBit()
      const forwardSlice = hasForwardPayload
        ? slice.loadRef().beginParse()
        : slice

      let comment: string | undefined
      if (forwardSlice.remainingBits >= 32) {
        const forwardOp = forwardSlice.loadUint(32)
        // op == 0 означает простой текстовый комментарий (как и в нативном TON)
        if (forwardOp === 0) {
          comment = forwardSlice.loadStringTail()
        }
      }

      return { queryId, amountUnits, senderOwner, comment }
    } catch (e) {
      this.logger.warn({
        msg: 'Failed to parse potential transfer_notification body',
        error: e instanceof Error ? e.message : String(e),
      })
      return null
    }
  }

  private async getTransactions(account: string, fromUtime?: number) {
    const allTransactions = []
    let beforeLt = 0
    const limit = 100
    let page = 0

    while (true) {
      if (page >= MAX_PAGES) {
        this.logger.warn({
          msg: `getTransactions: reached MAX_PAGES limit (${MAX_PAGES}), stopping pagination`,
          account,
          fromUtime,
          totalLoaded: allTransactions.length,
        })
        break
      }
      page++

      const params: Record<string, string | number> = { limit }
      if (fromUtime) params['from_utime'] = fromUtime
      if (beforeLt > 0) params['before_lt'] = beforeLt

      const url = `${this.baseUrl}/blockchain/accounts/${account}/transactions`
      const { data } = await axios.get(url, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        params,
      })

      const transactions = data.transactions
      if (!transactions || transactions.length === 0) break
      allTransactions.push(...transactions)

      if (transactions.length < limit) break

      const lastTx = transactions[transactions.length - 1]
      const nextBeforeLt = lastTx.lt
      if (nextBeforeLt === beforeLt) {
        this.logger.warn({
          msg: 'getTransactions: before_lt did not change, breaking to avoid infinite loop',
          beforeLt,
          account,
        })
        break
      }
      beforeLt = nextBeforeLt

      if (fromUtime && lastTx.utime <= fromUtime) break
    }

    return allTransactions
  }

  /**
   * Ищет оплаты конкретным jetton (любым — адрес мастера передаётся параметром).
   * @param jettonMasterAddress - адрес jetton master (напр. USDT)
   * @param platformOwnerWallet - обычный TON-кошелёк платформы (TON_WALLET)
   * @param paymentIds - список токенов (comment) платежей для поиска
   */
  async findJettonPayments(
    jettonMasterAddress: string,
    platformOwnerWallet: string,
    paymentIds: string[],
  ): Promise<FindJettonPaymentsResult> {
    const platformJettonWallet =
      await this.jettonWalletService.getJettonWalletAddress(
        platformOwnerWallet,
        jettonMasterAddress,
      )

    const lastUtime = await this.tonUtimeService.getLastUtime(
      platformJettonWallet,
    )

    this.logger.info({
      msg: `Searching for jetton payments since utime ${lastUtime}`,
      jettonMasterAddress,
      platformJettonWallet,
      count: paymentIds.length,
    })

    const txs = await this.getTransactions(platformJettonWallet, lastUtime)

    const payments: FindJettonPaymentsResult['payments'] = {}
    for (const id of paymentIds) payments[id] = null

    let maxUtime = lastUtime

    for (const tx of txs) {
      if (tx.utime > maxUtime) maxUtime = tx.utime

      const msg = tx.in_msg
      if (!msg?.raw_body) continue

      const parsed = this.parseTransferNotification(msg.raw_body)
      if (!parsed || !parsed.comment) continue
      if (!paymentIds.includes(parsed.comment)) continue

      // КРИТИЧНО: проверяем, что отправитель этого сообщения — это реально
      // jetton wallet, принадлежащий senderOwner+jettonMasterAddress, а не
      // поддельный контракт с произвольным балансом.
      const expectedSenderJettonWallet =
        await this.jettonWalletService.getJettonWalletAddress(
          parsed.senderOwner,
          jettonMasterAddress,
        )

      if (expectedSenderJettonWallet !== msg.source?.address) {
        this.logger.warn({
          msg: `Jetton payment ${parsed.comment}: sender jetton wallet mismatch, possible spoofed contract — ignoring`,
          expected: expectedSenderJettonWallet,
          got: msg.source?.address,
        })
        continue
      }

      payments[parsed.comment] = {
        from: parsed.senderOwner,
        amountUnits: parsed.amountUnits,
        paymentId: parsed.comment,
        hash: tx.hash,
        utime: tx.utime,
      }

      this.logger.info({
        msg: `Found jetton payment for token ${parsed.comment}`,
        hash: tx.hash,
        jettonMasterAddress,
      })
    }

    return { payments, maxUtime, platformJettonWallet }
  }
}
