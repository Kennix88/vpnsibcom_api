import { PrismaService } from '@core/prisma/prisma.service'
import { RedisService } from '@core/redis/redis.service'
import { XrayService } from '@modules/xray/services/xray.service'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Cron } from '@nestjs/schedule'

import { BalanceTypeEnum } from '@shared/enums/balance-type.enum'
import { PaymentMethodEnum } from '@shared/enums/payment-method.enum'
import { PaymentStatusEnum } from '@shared/enums/payment-status.enum'
import { TransactionReasonEnum } from '@shared/enums/transaction-reason.enum'
import { TransactionTypeEnum } from '@shared/enums/transaction-type.enum'
import { I18nService } from 'nestjs-i18n'
import { PinoLogger } from 'nestjs-pino'
import { InjectBot } from 'nestjs-telegraf'
import { Telegraf } from 'telegraf'
import { PaymentsService } from './payments.service'
import { TonPaymentsService } from './ton-payments.service'
import { TonUtimeService } from './ton-uptime.service'

// FIX #3: Добавлены константы для distributed lock через Redis.
// Без блокировки при нескольких инстанциях сервиса один и тот же набор
// expired holds / expired payments обрабатывается параллельно несколькими воркерами.
const LOCK_EXPIRED_HOLDS = 'cron:lock:processExpiredHolds'
const LOCK_CANCEL_PAYMENTS = 'cron:lock:cancelExpiredPayments'
const LOCK_TON_PAYMENTS = 'cron:lock:checkTonPayments'
const LOCK_TTL_SECONDS = 55 // чуть меньше минимального интервала крона

@Injectable()
export class PaymentsCronService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly logger: PinoLogger,
    private readonly configService: ConfigService,
    private readonly xrayService: XrayService,
    private readonly i18n: I18nService,
    private readonly tonPaymentsService: TonPaymentsService,
    private readonly paymentsService: PaymentsService,
    private readonly tonUtimeService: TonUtimeService,
    // FIX #3: внедряем RedisService для distributed locking
    private readonly redis: RedisService,
    @InjectBot() private readonly bot: Telegraf,
  ) {
    this.logger.setContext(PaymentsCronService.name)
  }

  /**
   * FIX #3: Пытается взять distributed lock в Redis.
   * Возвращает true, если блокировка успешно получена, false — если уже занята.
   * Использует SET NX EX для атомарной операции «установить, только если не существует».
   */
  private async acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
    // SET key value NX EX ttl — атомарно, возвращает OK или null
    const result = await this.redis.set(key, '1', 'EX', ttlSeconds, 'NX')
    return result !== null
  }

  private async releaseLock(key: string): Promise<void> {
    await this.redis.del(key)
  }

  @Cron('*/15 * * * * *')
  async checkTonPayments() {
    // FIX #3: distributed lock для TON-платежей
    const locked = await this.acquireLock(LOCK_TON_PAYMENTS, LOCK_TTL_SECONDS)
    if (!locked) {
      this.logger.info({ msg: 'checkTonPayments: lock already held, skipping' })
      return
    }

    try {
      const transactions = await this.prismaService.payments.findMany({
        where: {
          OR: [
            { status: PaymentStatusEnum.PENDING },
            {
              status: PaymentStatusEnum.FAILED,
              updatedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            },
          ],
          methodKey: PaymentMethodEnum.TON_TON,
        },
      })

      if (transactions.length === 0) {
        this.logger.info({ msg: 'No TON payments found' })
        return
      }

      this.logger.info({ msg: `Found ${transactions.length} TON payments` })

      const payIds = transactions.map((t) => t.token)

      const { payments: getTonPayments, maxUtime } =
        await this.tonPaymentsService.findPayments(payIds)

      for (const transaction of transactions) {
        this.logger.info({ msg: `Processing TON payment ${transaction.id}` })

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
    } catch (e) {
      this.logger.error({ msg: 'Error checking TON payments', e })
    } finally {
      await this.releaseLock(LOCK_TON_PAYMENTS)
    }
  }

  /**
   * Проверяет и обрабатывает истекшие холды транзакций
   * Запускается каждый день в 00:05
   */
  @Cron('0 5 0 * * *')
  async processExpiredHolds() {
    // FIX #3: distributed lock — при нескольких инстанциях только одна
    // обработает expired holds, остальные пропустят итерацию.
    const locked = await this.acquireLock(LOCK_EXPIRED_HOLDS, 5 * 60) // TTL 5 минут
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
            balance: {
              include: {
                user: { include: { language: true } },
              },
            },
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
          // FIX #3: updateMany с условием holdBalance >= amount гарантирует атомарность
          // и защищает от двойного списания — если count === 0, пропускаем.
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

          await tx.transactions.update({
            where: { id: transaction.id },
            data: { holdExpiredAt: null },
          })

          await tx.transactions.create({
            data: {
              amount: transaction.amount,
              type: TransactionTypeEnum.MINUS,
              reason: TransactionReasonEnum.SYSTEM,
              balanceType: BalanceTypeEnum.HOLD,
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
    // FIX #3: distributed lock для отмены просроченных платежей
    const locked = await this.acquireLock(LOCK_CANCEL_PAYMENTS, 10 * 60) // TTL 10 минут
    if (!locked) {
      this.logger.info({
        msg: 'cancelExpiredPayments: lock already held, skipping',
      })
      return
    }

    try {
      this.logger.info({ msg: 'Starting cancellation of expired payments' })

      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000)

      const expiredPayments = await this.prismaService.payments.findMany({
        where: {
          status: PaymentStatusEnum.PENDING,
          methodKey: { not: PaymentMethodEnum.TON_TON },
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
          // FIX #3: используем updateMany с проверкой статуса для идемпотентности —
          // если другой процесс уже успел обновить статус, пропускаем.
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

          if (payment.subscriptionId) {
            await this.xrayService.deleteSubscription(
              payment.user.telegramId,
              payment.subscriptionId,
            )
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
