import { PrismaService } from '@core/prisma/prisma.service'
import { RedisService } from '@core/redis/redis.service'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Cron } from '@nestjs/schedule'

import { TransactionTypeEnum } from '@core/prisma/generated/enums'
import { PaymentStatusEnum } from '@modules/payments/types/payment-status.enum'
import { BalanceTypeEnum } from '@shared/enums/balance-type.enum'
import { TransactionReasonEnum } from '@shared/enums/transaction-reason.enum'
import { PinoLogger } from 'nestjs-pino'
import { InjectBot } from 'nestjs-telegraf'
import { Telegraf } from 'telegraf'
import { PaymentsService } from './payments.service'
import { TonJettonPaymentsService } from './ton-jetton-payments.service'
import { TonPaymentsService } from './ton-payments.service'
import { TonUtimeService } from './ton-uptime.service'

const LOCK_EXPIRED_HOLDS = 'cron:lock:processExpiredHolds'
const LOCK_CANCEL_PAYMENTS = 'cron:lock:cancelExpiredPayments'
const LOCK_TON_PAYMENTS = 'cron:lock:checkTonPayments'
const LOCK_TTL_SECONDS = 55

@Injectable()
export class PaymentsCronService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly logger: PinoLogger,
    private readonly configService: ConfigService,
    private readonly tonPaymentsService: TonPaymentsService,
    private readonly tonJettonPaymentsService: TonJettonPaymentsService,
    private readonly paymentsService: PaymentsService,
    private readonly tonUtimeService: TonUtimeService,
    private readonly redis: RedisService,
    @InjectBot() private readonly bot: Telegraf,
  ) {
    this.logger.setContext(PaymentsCronService.name)
  }

  private async acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.redis.set(key, '1', 'EX', ttlSeconds, 'NX')
    return result !== null
  }

  private async releaseLock(key: string): Promise<void> {
    await this.redis.del(key)
  }

  @Cron('*/15 * * * * *')
  async checkTonPayments() {
    const locked = await this.acquireLock(LOCK_TON_PAYMENTS, LOCK_TTL_SECONDS)
    if (!locked) {
      this.logger.info({ msg: 'checkTonPayments: lock already held, skipping' })
      return
    }

    try {
      // Все активные TON-based методы — без хардкода конкретного enum-значения
      const tonMethods = await this.prismaService.paymentMethods.findMany({
        where: { isTonBlockchain: true, isActive: true },
      })

      if (tonMethods.length === 0) {
        this.logger.info({ msg: 'No active TON-based payment methods' })
        return
      }

      const nativeMethodKeys = tonMethods
        .filter((m) => !m.tonSmartContractAddress)
        .map((m) => m.key)

      const jettonMethods = tonMethods.filter((m) => m.tonSmartContractAddress)

      const allTonMethodKeys = tonMethods.map((m) => m.key)

      const transactions = await this.prismaService.payments.findMany({
        where: {
          OR: [
            { status: PaymentStatusEnum.PENDING },
            {
              status: PaymentStatusEnum.FAILED,
              updatedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            },
          ],
          methodKey: { in: allTonMethodKeys },
        },
      })

      if (transactions.length === 0) {
        this.logger.info({ msg: 'No pending TON-based payments found' })
        return
      }

      this.logger.info({
        msg: `Found ${transactions.length} pending TON-based payments`,
      })

      // ── 1. Нативные TON/GRAM платежи ──────────────────────────────
      if (nativeMethodKeys.length > 0) {
        const nativeTransactions = transactions.filter((t) =>
          nativeMethodKeys.includes(t.methodKey),
        )

        if (nativeTransactions.length > 0) {
          await this.processNativeTonPayments(nativeTransactions)
        }
      }

      // ── 2. Jetton платежи, сгруппированные по master-контракту ────
      // Группируем по адресу мастер-контракта: несколько methodKey теоретически
      // могут указывать на один и тот же jetton (разные UI-пресеты), поэтому
      // группировка идёт по адресу, а не по methodKey.
      const masterGroups = new Map<
        string,
        { decimals: number; methodKeys: string[] }
      >()

      for (const method of jettonMethods) {
        const master = method.tonSmartContractAddress!
        const existing = masterGroups.get(master)
        if (existing) {
          existing.methodKeys.push(method.key)
        } else {
          masterGroups.set(master, {
            decimals: method.tonJettonDecimals ?? 6,
            methodKeys: [method.key],
          })
        }
      }

      for (const [master, { decimals, methodKeys }] of masterGroups) {
        const jettonTransactions = transactions.filter((t) =>
          methodKeys.includes(t.methodKey),
        )
        if (jettonTransactions.length === 0) continue

        await this.processJettonPayments(master, decimals, jettonTransactions)
      }
    } catch (e) {
      this.logger.error({ msg: 'Error checking TON payments', e })
    } finally {
      await this.releaseLock(LOCK_TON_PAYMENTS)
    }
  }

  private async processNativeTonPayments(
    transactions: { id: string; token: string; amount: number }[],
  ) {
    const payIds = transactions.map((t) => t.token)

    const { payments: getTonPayments, maxUtime } =
      await this.tonPaymentsService.findPayments(payIds)

    for (const transaction of transactions) {
      const payment = getTonPayments[transaction.token]
      if (!payment) {
        this.logger.warn({
          msg: `TON payment ${transaction.token} not found`,
        })
        continue
      }

      const amountDelta = Number(
        Math.abs(transaction.amount - payment.amount).toFixed(9),
      )
      const amountTolerance = 0.000001

      if (amountDelta > amountTolerance) {
        this.logger.warn({
          msg: `TON payment ${transaction.token} amount mismatch. Expected: ${transaction.amount}, Got: ${payment.amount}, Delta: ${amountDelta}`,
        })
        continue
      }

      await this.paymentsService.updatePayment(
        transaction.token,
        PaymentStatusEnum.COMPLETED,
        payment,
      )
    }

    if (maxUtime > 0) {
      await this.tonUtimeService.setLastUtime(
        this.configService.getOrThrow<string>('TON_WALLET'),
        maxUtime,
      )
    }
  }

  private async processJettonPayments(
    jettonMasterAddress: string,
    decimals: number,
    transactions: { id: string; token: string; amount: number }[],
  ) {
    const platformOwnerWallet =
      this.configService.getOrThrow<string>('TON_WALLET')
    const payIds = transactions.map((t) => t.token)

    const {
      payments: getJettonPayments,
      maxUtime,
      platformJettonWallet,
    } = await this.tonJettonPaymentsService.findJettonPayments(
      jettonMasterAddress,
      platformOwnerWallet,
      payIds,
    )

    for (const transaction of transactions) {
      const payment = getJettonPayments[transaction.token]
      if (!payment) {
        this.logger.warn({
          msg: `Jetton payment ${transaction.token} not found`,
          jettonMasterAddress,
        })
        continue
      }

      const receivedAmount = Number(payment.amountUnits) / 10 ** decimals

      const amountDelta = Number(
        Math.abs(transaction.amount - receivedAmount).toFixed(decimals),
      )
      // Допуск: минимум 1 наименьшая единица джеттона, либо небольшая
      // относительная погрешность на случай округления при конвертации курса
      const amountTolerance = Math.max(
        10 ** -decimals,
        transaction.amount * 0.0005,
      )

      if (amountDelta > amountTolerance) {
        this.logger.warn({
          msg: `Jetton payment ${transaction.token} amount mismatch. Expected: ${transaction.amount}, Got: ${receivedAmount}, Delta: ${amountDelta}`,
          jettonMasterAddress,
        })
        continue
      }

      await this.paymentsService.updatePayment(
        transaction.token,
        PaymentStatusEnum.COMPLETED,
        {
          from: payment.from,
          amount: receivedAmount,
          hash: payment.hash,
          jettonMasterAddress,
        },
      )
    }

    if (maxUtime > 0) {
      await this.tonUtimeService.setLastUtime(platformJettonWallet, maxUtime)
    }
  }

  /**
   * Проверяет и обрабатывает истекшие холды транзакций
   * Запускается каждый день в 00:05
   */
  @Cron('0 5 0 * * *')
  async processExpiredHolds() {
    const locked = await this.acquireLock(LOCK_EXPIRED_HOLDS, 5 * 60)
    if (!locked) {
      this.logger.info({
        msg: 'processExpiredHolds: lock already held, skipping',
      })
      return
    }

    try {
      this.logger.info({ msg: 'Starting processing expired transaction holds' })

      const expiredHoldTransactions =
        await this.prismaService.transactions.findMany({
          where: {
            balanceType: BalanceTypeEnum.HOLD,
            holdExpiredAt: { lte: new Date() },
          },
          include: {
            balance: { include: { user: true } },
          },
        })

      if (expiredHoldTransactions.length === 0) {
        this.logger.info({ msg: 'No expired hold transactions found' })
        return
      }

      this.logger.info({
        msg: `Found ${expiredHoldTransactions.length} expired hold transactions`,
      })

      for (const transaction of expiredHoldTransactions) {
        await this.prismaService.$transaction(async (tx) => {
          // Атомарно снимаем ограничение: decrement holdBalance с условием gte —
          // если count === 0, значит хold уже был снят раньше (защита от повторной обработки).
          const balanceUpdate = await tx.userBalance.updateMany({
            where: {
              id: transaction.balanceId,
              holdBalance: { gte: transaction.amount },
            },
            data: { holdBalance: { decrement: transaction.amount } },
          })

          if (balanceUpdate.count === 0) {
            this.logger.warn({
              msg: `Skipped expired hold transaction ${transaction.id}, insufficient holdBalance or already processed`,
              userId: transaction.balance.user.id,
            })
            return
          }

          // Снимаем holdExpiredAt с исходной транзакции — чтобы она не попадала
          // повторно в выборку expired holds на следующих прогонах крона.
          await tx.transactions.update({
            where: { id: transaction.id },
            data: { holdExpiredAt: null },
          })

          // FIX: добавлен balanceId — раньше запись создавалась без привязки
          // к балансу и выпадала из истории транзакций пользователя.
          await tx.transactions.create({
            data: {
              amount: transaction.amount,
              type: TransactionTypeEnum.MINUS,
              reason: TransactionReasonEnum.SYSTEM,
              balanceType: BalanceTypeEnum.HOLD,
              balanceId: transaction.balanceId,
            },
          })

          this.logger.info({
            msg: `Released hold for transaction ${transaction.id}`,
            amount: transaction.amount,
            userId: transaction.balance.user.id,
          })
        })
      }

      this.logger.info({
        msg: `Successfully processed ${expiredHoldTransactions.length} expired hold transactions`,
      })
    } catch (error) {
      this.logger.error({
        msg: 'Error processing expired holds',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
    } finally {
      await this.releaseLock(LOCK_EXPIRED_HOLDS)
    }
  }

  /**
   * Отменяет просроченные платежи
   * Запускается каждый час в 15 минут
   */
  @Cron('0 15 * * * *')
  async cancelExpiredPayments() {
    const locked = await this.acquireLock(LOCK_CANCEL_PAYMENTS, 10 * 60)
    if (!locked) {
      this.logger.info({
        msg: 'cancelExpiredPayments: lock already held, skipping',
      })
      return
    }

    try {
      this.logger.info({ msg: 'Starting cancellation of expired payments' })

      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000)

      // Раньше был захардкожен единственный TON_TON — теперь исключаем ВСЕ
      // активные TON-based методы (нативные и jetton), т.к. подтверждение
      // ончейн-платежа может занять больше времени, чем обычный инвойс.
      const tonMethodKeys = (
        await this.prismaService.paymentMethods.findMany({
          where: { isTonBlockchain: true },
          select: { key: true },
        })
      ).map((m) => m.key)

      const expiredPayments = await this.prismaService.payments.findMany({
        where: {
          status: PaymentStatusEnum.PENDING,
          methodKey: { notIn: tonMethodKeys },
          createdAt: { lt: thirtyMinutesAgo },
        },
        include: {
          user: { include: { language: true } },
        },
      })

      if (expiredPayments.length === 0) {
        this.logger.info({ msg: 'No expired payments found' })
        return
      }

      this.logger.info({
        msg: `Found ${expiredPayments.length} expired payments`,
      })

      for (const payment of expiredPayments) {
        await this.prismaService.$transaction(async (tx) => {
          const updated = await tx.payments.updateMany({
            where: { id: payment.id, status: PaymentStatusEnum.PENDING },
            data: { status: PaymentStatusEnum.FAILED },
          })

          if (updated.count === 0) {
            this.logger.info({
              msg: `Payment ${payment.id} already updated by another process, skipping`,
            })
            return
          }
        })

        this.logger.info({
          msg: `Payment ${payment.id} marked as expired`,
          token: payment.token,
          userId: payment.userId,
        })
      }

      this.logger.info({
        msg: `Successfully processed ${expiredPayments.length} expired payments`,
      })
    } catch (error) {
      this.logger.error({
        msg: 'Error cancelling expired payments',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
    } finally {
      await this.releaseLock(LOCK_CANCEL_PAYMENTS)
    }
  }
}
