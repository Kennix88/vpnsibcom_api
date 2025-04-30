import { RedisService } from '@core/redis/redis.service'
import { RatesService } from '@modules/rates/rates.service'
import { UsersService } from '@modules/users/users.service'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Prisma } from '@prisma/client'
import { CurrencyTypeEnum } from '@shared/enums/currency-type.enum'
import { CurrencyEnum } from '@shared/enums/currency.enum'
import { PaymentMethodTypeEnum } from '@shared/enums/payment-method-type.enum'
import { PaymentMethodEnum } from '@shared/enums/payment-method.enum'
import { PaymentStatusEnum } from '@shared/enums/payment-status.enum'
import { PaymentSystemEnum } from '@shared/enums/payment-system.enum'
import { PaymentMethodsDataInterface } from '@shared/types/payment-methods-data.interface'
import { fxUtil } from '@shared/utils/fx.util'
import { genToken } from '@shared/utils/gen-token.util'
import { BalanceTypeEnum } from '@vpnsibcom/src/shared/enums/balance-type.enum'
import { DefaultEnum } from '@vpnsibcom/src/shared/enums/default.enum'
import { TransactionReasonEnum } from '@vpnsibcom/src/shared/enums/transaction-reason.enum'
import { TransactionTypeEnum } from '@vpnsibcom/src/shared/enums/transaction-type.enum'
import { addDays } from 'date-fns'
import { PinoLogger } from 'nestjs-pino'
import { PrismaService } from 'nestjs-prisma'
import { InjectBot } from 'nestjs-telegraf'
import { Telegraf } from 'telegraf'
import { TelegramPaymentsService } from './telegram-payments.service'

@Injectable()
export class PaymentsService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly userService: UsersService,
    private readonly logger: PinoLogger,
    private readonly redis: RedisService,
    private readonly ratesService: RatesService,
    private readonly telegramPaymentsService: TelegramPaymentsService,
    @InjectBot() private readonly bot: Telegraf,
  ) {}

  public async createInvoice(
    amount: number,
    method: PaymentMethodEnum,
    tgId: string,
  ): Promise<{
    linkPay: string
    isTmaIvoice: boolean
  }> {
    try {
      return await this.prismaService.$transaction(async (tx) => {
        const getMethod = await tx.paymentMethods.findUnique({
          where: {
            key: method,
            isActive: true,
          },
        })
        if (!getMethod) {
          throw new Error(`Payment method not found or not active`)
        }

        const getUser = await tx.users.findUnique({
          where: {
            telegramId: tgId,
          },
        })

        if (!getUser) {
          throw new Error(`User not found`)
        }

        const rates = await this.ratesService.getRates()

        const token = genToken()

        const convertedAmount =
          getMethod.currencyKey === CurrencyEnum.XTR
            ? amount
            : fxUtil(
                amount,
                CurrencyEnum.XTR,
                getMethod.currencyKey as CurrencyEnum,
                rates,
              )

        const paymentObject = {
          status: PaymentStatusEnum.PENDING,
          amount: convertedAmount,
          amountStars:
            getMethod.key === PaymentMethodEnum.STARS
              ? Number(amount.toFixed(0))
              : amount,
          currencyKey: getMethod.currencyKey,
          methodKey: getMethod.key,
          exchangeRate: rates.rates[getMethod.currencyKey],
          commission: getMethod.commission,
          token,
          userId: getUser.id,
        }

        let linkPay: string | null = null
        let isTmaIvoice = false
        if (getMethod.key === PaymentMethodEnum.STARS) {
          linkPay = await this.telegramPaymentsService.createTelegramInvoice(
            amount,
            token,
            `Adding ${amount} STARS to your balance`,
            `Adding ${amount} STARS to your balance`,
          )
          isTmaIvoice = true
        }

        if (!linkPay) {
          throw new Error(`LinkPay not found`)
        }

        const createPayment = await tx.payments.create({
          data: {
            ...paymentObject,
            linkPay,
          },
        })

        return {
          linkPay,
          isTmaIvoice,
        }
      })
    } catch (e) {
      this.logger.error({
        msg: `Error while creating invoice`,
        e,
      })
    }
  }

  public async updatePayment(
    token: string,
    status: PaymentStatusEnum,
    details?: object,
  ): Promise<{ amountStars: number } | undefined> {
    try {
      this.logger.info({
        msg: `Updating payment`,
        token,
        status,
      })

      const payment = (await this.prismaService.payments.findUnique({
        where: { token },
        include: {
          user: {
            include: {
              inviters: {
                include: {
                  inviter: {
                    include: {
                      balance: true,
                    },
                  },
                },
              },
              balance: true,
              telegramData: true,
            },
          },
        },
      })) as PaymentWithRelations | null

      if (!payment) {
        throw new Error(`Payment not found`)
      }

      // Возвращаем ранний ответ, если статус не COMPLETED
      if (status !== PaymentStatusEnum.COMPLETED) {
        await this.prismaService.payments.update({
          where: { token },
          data: {
            status,
            ...(details && { details: details as Prisma.JsonObject }),
          },
        })

        return { amountStars: payment.amountStars }
      }

      this.logger.info({
        msg: `Payment completed`,
        token,
        status,
      })

      // Обрабатываем успешный платеж в транзакции
      const result = await this.processCompletedPayment(
        payment,
        status,
        details,
      )

      return { amountStars: payment.amountStars }
    } catch (e) {
      this.logger.error({
        msg: `Error while updating payment`,
        error: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined,
        token,
        status,
      })

      // Пробрасываем ошибку дальше для обработки на уровне контроллера
      throw e
    }
  }

  /**
   * Обрабатывает успешно завершенный платеж
   */
  private async processCompletedPayment(
    payment: PaymentWithRelations,
    status: PaymentStatusEnum,
    details?: object,
  ) {
    return this.prismaService.$transaction(async (tx: PrismaTransaction) => {
      // 1. Обновляем баланс пользователя
      await this.updateUserBalance(tx, payment)

      // 2. Создаем транзакцию платежа
      const transaction = await this.createPaymentTransaction(tx, payment)

      // 3. Обновляем статус платежа
      await this.updatePaymentStatus(
        tx,
        payment.token,
        status,
        transaction.id,
        details,
      )

      // 4. Обрабатываем реферальные комиссии
      await this.processReferralCommissions(tx, payment)
    })
  }

  /**
   * Обновляет баланс пользователя
   */
  private async updateUserBalance(
    tx: PrismaTransaction,
    payment: PaymentWithRelations,
  ) {
    await tx.userBalance.update({
      where: {
        id: payment.user.balanceId,
      },
      data: {
        paymentBalance:
          payment.user.balance.paymentBalance + payment.amountStars,
      },
    })

    this.logger.info({
      msg: `Updated user balance`,
      userId: payment.user.id,
      balanceId: payment.user.balanceId,
      amount: payment.amountStars,
    })
  }

  /**
   * Создает транзакцию для платежа
   */
  private async createPaymentTransaction(
    tx: PrismaTransaction,
    payment: PaymentWithRelations,
  ): Promise<Transaction> {
    const transaction = await tx.transactions.create({
      data: {
        amount: payment.amountStars,
        type: TransactionTypeEnum.PLUS,
        reason: TransactionReasonEnum.PAYMENT,
        balanceType: BalanceTypeEnum.PAYMENT,
        isHold: false,
        balanceId: payment.user.balanceId,
      },
    })

    this.logger.info({
      msg: `Created payment transaction`,
      transactionId: transaction.id,
      userId: payment.user.id,
      amount: payment.amountStars,
    })

    return transaction
  }

  /**
   * Обновляет статус платежа
   */
  private async updatePaymentStatus(
    tx: PrismaTransaction,
    token: string,
    status: PaymentStatusEnum,
    transactionId: string,
    details?: object,
  ) {
    await tx.payments.update({
      where: {
        token,
      },
      data: {
        status,
        transactionId,
        ...(details && { details: details as Prisma.JsonObject }),
      },
    })

    this.logger.info({
      msg: `Payment status updated`,
      token,
      status,
      transactionId,
    })
  }

  /**
   * Обрабатывает начисление реферальных комиссий
   */
  private async processReferralCommissions(
    tx: PrismaTransaction,
    payment: PaymentWithRelations,
  ) {
    const referrers = payment.user.inviters

    if (referrers.length === 0) {
      return
    }

    this.logger.info({
      msg: `Processing referral commissions`,
      referrersCount: referrers.length,
      userId: payment.user.id,
    })

    const getSettings = (await tx.settings.findUnique({
      where: {
        key: DefaultEnum.DEFAULT,
      },
    })) as Settings | null

    if (!getSettings) {
      this.logger.warn({
        msg: `Default settings not found, skipping referral commissions`,
      })
      return
    }

    for (const referrer of referrers) {
      await this.processReferralCommission(tx, referrer, getSettings, payment)
    }
  }

  /**
   * Обрабатывает начисление комиссии для конкретного реферера
   */
  private async processReferralCommission(
    tx: PrismaTransaction,
    referrer: PaymentWithRelations['user']['inviters'][0],
    settings: Settings,
    payment: PaymentWithRelations,
  ) {
    const commissionLvl = this.getReferralCommissionPercent(
      referrer.level,
      settings,
    )
    const referralCommission = Number(
      (payment.amountStars * commissionLvl).toFixed(3),
    )

    this.logger.info({
      msg: `Calculated referral commission`,
      referralCommission,
      commissionLvl,
      referrerLevel: referrer.level,
      referrerId: referrer.inviter.id,
    })

    if (referralCommission <= 0) {
      return
    }

    let plusPaymentsRewarded = 0

    if (!referrer.isActivated) {
      plusPaymentsRewarded = payment.user.telegramData.isPremium
        ? settings.referralInvitePremiumRewardStars
        : settings.referralInviteRewardStars
    }

    await tx.referrals.update({
      where: {
        id: referrer.id,
      },
      data: {
        totalPaymentsRewarded:
          referrer.totalPaymentsRewarded + plusPaymentsRewarded,
        totalWithdrawalsRewarded:
          referrer.totalWithdrawalsRewarded + referralCommission,
        isActivated: true,
      },
    })

    // Обновляем баланс реферера
    await tx.userBalance.update({
      where: {
        id: referrer.inviter.balanceId,
      },
      data: {
        paymentBalance:
          referrer.inviter.balance.paymentBalance + plusPaymentsRewarded,
        totalEarnedWithdrawalBalance:
          referrer.inviter.balance.totalEarnedWithdrawalBalance +
          referralCommission,
        holdBalance: referrer.inviter.balance.holdBalance + referralCommission,
      },
    })

    this.logger.info({
      msg: `Updated referrer balance`,
      referrerId: referrer.inviter.id,
      balanceId: referrer.inviter.balanceId,
      amount: referralCommission,
    })

    // Отправляем уведомление инвайтеру о полученном вознаграждении
    try {
      const inviterTelegramId = referrer.inviter.telegramId
      const referralName = payment.user.telegramData.firstName || 'Пользователь'
      let message = `💰 Вы получили реферальное вознаграждение!\n\n`

      if (referralCommission > 0) {
        message += `🔄 ${referralCommission} STARS будут доступны через 21 день\n`
      }

      if (plusPaymentsRewarded > 0) {
        message += `⭐ ${plusPaymentsRewarded} STARS уже доступны на вашем балансе\n`
      }

      message += `\nРеферал: ${referralName}\nУровень: ${referrer.level}`

      await this.bot.telegram.sendMessage(inviterTelegramId, message)
    } catch (err) {
      this.logger.error({
        msg: `Error sending notification to inviter`,
        error: err instanceof Error ? err.message : String(err),
        inviterId: referrer.inviter.id,
      })
    }

    // Создаем транзакцию для реферальной комиссии

    const transactions = [
      {
        amount: referralCommission,
        type: TransactionTypeEnum.PLUS,
        reason: TransactionReasonEnum.REFERRAL,
        balanceType: BalanceTypeEnum.WITHDRAWAL,
        isHold: true,
        balanceId: referrer.inviter.balanceId,
        holdExpiredAt: addDays(new Date(), 21),
      },
      {
        amount: plusPaymentsRewarded,
        type: TransactionTypeEnum.PLUS,
        reason: TransactionReasonEnum.REFERRAL,
        balanceType: BalanceTypeEnum.PAYMENT,
        isHold: false,
        balanceId: referrer.inviter.balanceId,
      },
    ]

    const referralTransactions = await tx.transactions.createMany({
      data: transactions,
    })

    this.logger.info({
      msg: `Created referral commission transaction`,
      transactions: referralTransactions,
      referrerId: referrer.inviter.id,
      amount: referralCommission,
    })
  }

  /**
   * Возвращает процент комиссии в зависимости от уровня реферера
   */
  private getReferralCommissionPercent(
    level: number,
    settings: Settings,
  ): number {
    switch (level) {
      case 1:
        return settings.referralOneLevelPercent
      case 2:
        return settings.referralTwoLevelPercent
      case 3:
        return settings.referralThreeLevelPercent
      default:
        return 0
    }
  }

  public async getPaymentMethods(
    isTma: boolean,
  ): Promise<PaymentMethodsDataInterface[]> {
    try {
      const getPaymentMethods =
        await this.prismaService.paymentMethods.findMany({
          where: {
            ...(isTma && {
              key: {
                in: [PaymentMethodEnum.STARS],
              },
            }),
            isActive: true,
          },
          include: {
            currency: {
              select: {
                key: true,
                name: true,
                symbol: true,
                type: true,
                rate: true,
              },
            },
          },
        })

      const methods: PaymentMethodsDataInterface[] = getPaymentMethods.map(
        (method) => {
          return {
            key: method.key as PaymentMethodEnum,
            name: method.name,
            isTonBlockchain: method.isTonBlockchain,
            tonSmartContractAddress: method.tonSmartContractAddress,
            minAmount: method.minAmount,
            maxAmount: method.maxAmount,
            commission: method.commission,
            isPlusCommission: method.isPlusCommission,
            type: method.type as PaymentMethodTypeEnum,
            system: method.system as PaymentSystemEnum,
            currency: {
              key: method.currency.key as CurrencyEnum,
              name: method.currency.name,
              symbol: method.currency.symbol,
              type: method.currency.type as CurrencyTypeEnum,
              rate: method.currency.rate,
            },
          }
        },
      )

      return methods
    } catch (e) {
      this.logger.error({
        msg: `Error while getting payment methods`,
        e,
      })
    }
  }
}

// Тип для транзакции Prisma
type PrismaTransaction = Omit<
  PrismaService,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>

// Тип для платежа с включенными связями
type PaymentWithRelations = Prisma.PaymentsGetPayload<{
  include: {
    user: {
      include: {
        inviters: {
          include: {
            inviter: {
              include: {
                balance: true
              }
            }
          }
        }
        balance: true
        telegramData: true
      }
    }
  }
}>

// Тип для настроек
type Settings = Prisma.SettingsGetPayload<{
  select: {
    key: true
    referralOneLevelPercent: true
    referralTwoLevelPercent: true
    referralThreeLevelPercent: true
    referralInviteRewardStars: true
    referralInvitePremiumRewardStars: true
  }
}>

// Тип для транзакции
type Transaction = Prisma.TransactionsGetPayload<{
  select: {
    id: true
    amount: true
    type: true
    reason: true
    balanceType: true
    isHold: true
    balanceId: true
  }
}>
