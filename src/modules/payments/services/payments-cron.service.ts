import { PrismaService } from '@core/prisma/prisma.service'
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

/**
 * Сервис для выполнения периодических задач, связанных с платежами
 */
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
    @InjectBot() private readonly bot: Telegraf,
  ) {
    this.logger.setContext(PaymentsCronService.name)
  }

  @Cron('*/15 * * * * *')
  async checkTonPayments() {
    try {
      const transactions = await this.prismaService.payments.findMany({
        where: {
          status: PaymentStatusEnum.PENDING,
          methodKey: PaymentMethodEnum.TON_TON,
        },
      })

      if (transactions.length === 0) {
        this.logger.info({ msg: 'No TON payments found' })
        return
      }

      this.logger.info({
        msg: `Found ${transactions.length} TON payments`,
      })

      const payIds = []

      for (const transaction of transactions) {
        payIds.push(transaction.token)
      }

      const { payments: getTonPayments, maxUtime } =
        await this.tonPaymentsService.findPayments(payIds)

      for (const transaction of transactions) {
        this.logger.info({
          msg: `Processing TON payment ${transaction.id}`,
        })

        const payment = getTonPayments[transaction.token]

        if (!payment || payment == null) {
          this.logger.warn({
            msg: `TON payment ${transaction.token} not found`,
          })
          continue
        }

        if (transaction.amount !== payment.amount) {
          this.logger.warn({
            msg: `TON payment ${transaction.token} amount mismatch. Expected: ${transaction.amount}, Got: ${payment.amount}`,
          })
          continue
        }

        await this.paymentsService.updatePayment(
          transaction.token,
          PaymentStatusEnum.COMPLETED,
          payment,
        )
      }

      // Обновляем lastUtime в Redis, чтобы в следующий раз начать с этого момента
      if (maxUtime > 0) {
        await this.tonUtimeService.setLastUtime(
          this.configService.getOrThrow<string>('TON_WALLET'),
          maxUtime,
        )
      }
    } catch (e) {
      this.logger.error({ msg: 'Error checking TON payments', e })
    }
  }

  /**
   * Проверяет и обрабатывает истекшие холды транзакций
   * Запускается каждый день в 00:05
   */
  @Cron('0 5 0 * * *')
  async processExpiredHolds() {
    try {
      this.logger.info({ msg: 'Starting processing expired transaction holds' })

      // Забираем все холды, у которых срок истёк
      const expiredHoldTransactions =
        await this.prismaService.transactions.findMany({
          where: {
            balanceType: BalanceTypeEnum.HOLD,
            holdExpiredAt: {
              lte: new Date(),
            },
          },
          include: {
            balance: {
              include: {
                user: {
                  include: {
                    language: true,
                  },
                },
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
          // Попытка обновить баланс атомарно
          const balanceUpdate = await tx.userBalance.updateMany({
            where: {
              id: transaction.balanceId,
              holdBalance: { gte: transaction.amount }, // защита от ухода в минус
            },
            data: {
              holdBalance: { decrement: transaction.amount },
            },
          })

          if (balanceUpdate.count === 0) {
            // либо уже обработано, либо holdBalance < amount
            this.logger.warn({
              msg: `Skipped expired hold transaction ${transaction.id}, insufficient holdBalance or already processed`,
              userId: transaction.balance.user.id,
            })
            return
          }

          await tx.transactions.update({
            where: {
              id: transaction.id,
            },
            data: {
              holdExpiredAt: null,
            },
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
    }
  }

  /**
   * Отменяет просроченные платежи
   * Запускается каждый час в 15 минут
   */
  @Cron('0 15 * * * *')
  async cancelExpiredPayments() {
    try {
      this.logger.info({
        msg: 'Starting cancellation of expired payments',
      })

      // Находим все платежи в статусе PENDING, созданные более 30 минут назад
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000)

      const expiredPayments = await this.prismaService.payments.findMany({
        where: {
          status: PaymentStatusEnum.PENDING,
          createdAt: {
            lt: thirtyMinutesAgo,
          },
        },
        include: {
          user: {
            include: {
              language: true,
            },
          },
        },
      })

      if (expiredPayments.length === 0) {
        this.logger.info({
          msg: 'No expired payments found',
        })
        return
      }

      this.logger.info({
        msg: `Found ${expiredPayments.length} expired payments`,
      })

      // Обновляем статус каждого платежа
      for (const payment of expiredPayments) {
        await this.prismaService.$transaction(async (tx) => {
          await tx.payments.update({
            where: {
              id: payment.id,
            },
            data: {
              status: PaymentStatusEnum.FAILED,
            },
          })

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

        // // Отправляем уведомление пользователю
        // try {
        //   const userLang = payment.user.language?.iso6391 || 'ru'

        //   const message = await this.i18n.translate(
        //     'payments.payment_expired',
        //     {
        //       args: { amount: payment.amount },
        //       lang: userLang,
        //     },
        //   )

        //   await this.bot.telegram.sendMessage(payment.user.telegramId, message)
        // } catch (err) {
        //   this.logger.error({
        //     msg: 'Error sending notification about expired payment',
        //     error: err instanceof Error ? err.message : String(err),
        //     userId: payment.userId,
        //   })
        // }
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
    }
  }
}
