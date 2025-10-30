import { I18nTranslations } from '@core/i18n/i18n.type'
import { RedisService } from '@core/redis/redis.service'
import { RatesService } from '@modules/rates/rates.service'
import { UsersService } from '@modules/users/users.service'
import { MarzbanService } from '@modules/xray/services/marzban.service'
import { XrayService } from '@modules/xray/services/xray.service'

import { PlansEnum } from '@modules/plans/types/plans.enum'
import { roundUp } from '@modules/xray/utils/calculate-subscription-cost.util'
import { forwardRef, Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Prisma, PrismaClient } from '@prisma/client'
import { DefaultArgs } from '@prisma/client/runtime/library'
import { CurrencyTypeEnum } from '@shared/enums/currency-type.enum'
import { CurrencyEnum } from '@shared/enums/currency.enum'
import { PaymentMethodTypeEnum } from '@shared/enums/payment-method-type.enum'
import { PaymentMethodEnum } from '@shared/enums/payment-method.enum'
import { PaymentStatusEnum } from '@shared/enums/payment-status.enum'
import { PaymentSystemEnum } from '@shared/enums/payment-system.enum'
import { SubscriptionPeriodEnum } from '@shared/enums/subscription-period.enum'
import { TrafficResetEnum } from '@shared/enums/traffic-reset.enum'
import { PaymentMethodsDataInterface } from '@shared/types/payment-methods-data.interface'
import { fxUtil } from '@shared/utils/fx.util'
import { genToken } from '@shared/utils/gen-token.util'
import { BalanceTypeEnum } from '@vpnsibcom/src/shared/enums/balance-type.enum'
import { DefaultEnum } from '@vpnsibcom/src/shared/enums/default.enum'
import { TransactionReasonEnum } from '@vpnsibcom/src/shared/enums/transaction-reason.enum'
import { TransactionTypeEnum } from '@vpnsibcom/src/shared/enums/transaction-type.enum'
import { addDays } from 'date-fns'
import { I18nService } from 'nestjs-i18n'
import { PinoLogger } from 'nestjs-pino'
import { PrismaService } from 'nestjs-prisma'
import { InjectBot } from 'nestjs-telegraf'
import { LoggerTelegramService } from 'src/core/logger/logger-telegram.service'
import { Telegraf } from 'telegraf'
import { PaymentTypeEnum } from '../types/payment-type.enum'
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
    private readonly marzbanService: MarzbanService,
    private readonly telegramLogger: LoggerTelegramService,
    @Inject(forwardRef(() => XrayService))
    private readonly xrayService: XrayService,
    private readonly i18n: I18nService<I18nTranslations>,
    @InjectBot() private readonly bot: Telegraf,
  ) {}

  public async createInvoice(
    amount: number,
    method: PaymentMethodEnum,
    tgId: string,
    paymentType: PaymentTypeEnum,
    data: object | null = null,
    subscriptionId: string | null = null,
  ): Promise<{
    linkPay: string
    isTonPayment: boolean
    amountTon: number
    token: string
  }> {
    try {
      return await this.prismaService.$transaction(async (tx) => {
        // Find payment method
        const getMethod = await tx.paymentMethods.findUnique({
          where: {
            key: method,
            isActive: true,
          },
        })
        if (!getMethod) {
          throw new Error(`Payment method not found or not active`)
        }

        // Find user
        const getUser = await tx.users.findUnique({
          where: {
            telegramId: tgId,
          },
          include: {
            language: true,
          },
        })

        if (!getUser) {
          throw new Error(`User not found`)
        }
        // Get settings
        const settings = await tx.settings.findUnique({
          where: {
            key: DefaultEnum.DEFAULT,
          },
        })
        if (!settings) {
          throw new Error(`Default settings not found`)
        }

        // Get rates
        const rates = await this.ratesService.getRates()

        const token = genToken()

        // Convert amount based on currency
        const convertedAmount =
          getMethod.currencyKey === CurrencyEnum.XTR
            ? amount
            : roundUp(
                fxUtil(
                  amount,
                  CurrencyEnum.XTR,
                  getMethod.currencyKey as CurrencyEnum,
                  rates,
                ),
                5,
              )

        const amountStars =
          getMethod.key === PaymentMethodEnum.STARS
            ? Number(amount.toFixed(0))
            : amount

        const paymentObject = {
          status: PaymentStatusEnum.PENDING,
          amount: convertedAmount,
          amountStars,
          currencyKey: getMethod.currencyKey,
          methodKey: getMethod.key,
          exchangeRate: rates.rates[getMethod.currencyKey],
          commission: getMethod.commission,
          isTgPartnerProgram: getUser.isTgProgramPartner,
          amountStarsFeeTgPartner: getUser.isTgProgramPartner
            ? amountStars * settings.commissionRatioTgPartnerProgram
            : 0,
          token,
          userId: getUser.id,
        }

        let linkPay: string | null = null
        if (getMethod.key === PaymentMethodEnum.STARS) {
          const title = subscriptionId
            ? 'Subscription payment'
            : await this.i18n.translate('payments.invoice.title', {
                args: { amount },
                lang: getUser.language.iso6391,
              })
          const description = subscriptionId
            ? 'Subscription payment'
            : await this.i18n.translate('payments.invoice.description', {
                args: { amount },
                lang: getUser.language.iso6391,
              })

          linkPay = await this.telegramPaymentsService.createTelegramInvoice(
            amount,
            token,
            title,
            description,
          )
        }

        if (!linkPay && getMethod.key === PaymentMethodEnum.STARS) {
          throw new Error(`LinkPay not found`)
        }

        const createPayment = await tx.payments.create({
          data: {
            ...paymentObject,
            type: paymentType,
            data,
            linkPay,
            subscriptionId,
          },
        })

        const response = {
          linkPay:
            getMethod.key === PaymentMethodEnum.TON_TON
              ? this.configService.getOrThrow<string>('TON_WALLET')
              : linkPay,
          isTonPayment: getMethod.key === PaymentMethodEnum.TON_TON,
          token: createPayment.token,
          amountTon:
            getMethod.key === PaymentMethodEnum.TON_TON ? convertedAmount : 0,
        }
        return response
      })
    } catch (e: unknown) {
      const error = e as Error
      this.telegramLogger.error(
        `Error while creating invoice for user ${tgId}: ${error.message}`,
      )
      throw error // Re-throw the error after logging
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
        where: {
          token,
          status: {
            not: PaymentStatusEnum.COMPLETED,
          },
        },
        include: {
          subscription: {
            include: {
              plan: true,
            },
          },
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

      const isSubscription = payment.subscriptionId !== null

      if (payment.type === PaymentTypeEnum.PAY_SUBSCRIPTION) {
        const data = payment.data as {
          telegramId: string
          name: string
          planKey: PlansEnum
          period: SubscriptionPeriodEnum
          periodMultiplier: number
          isPremium: boolean
          trafficReset: TrafficResetEnum
          nextRenewalStars?: number
          devicesCount: number
          isAllBaseServers: boolean
          isAllPremiumServers: boolean
          trafficLimitGb?: number
          isUnlimitTraffic: boolean
          servers: string[]
          isAutoRenewal?: boolean
        }

        await this.xrayService.createSubscription({
          isPremium: data.isPremium,
          name: data.name,
          planKey: data.planKey as PlansEnum,
          period: data.period,
          periodMultiplier: data.periodMultiplier,
          nextRenewalStars: data.nextRenewalStars,
          devicesCount: data.devicesCount,
          isAllBaseServers: data.isAllBaseServers,
          isAllPremiumServers: data.isAllPremiumServers,
          trafficReset: data.trafficReset,
          trafficLimitGb: data.trafficLimitGb,
          isUnlimitTraffic: data.isUnlimitTraffic,
          servers: data.servers,
          isAutoRenewal: data.isAutoRenewal,
          telegramId: data.telegramId,
        })
      }

      if (
        isSubscription &&
        payment.type === PaymentTypeEnum.ADD_TRAFFIC_SUBSCRIPTION
      ) {
        const addTraffic = await this.xrayService.addTrafficToSubscription(
          payment.subscriptionId,
          Number((payment.data as { traffic: number })?.traffic),
        )
      }

      if (
        isSubscription &&
        payment.type === PaymentTypeEnum.UPDATE_SUBSCTIPTION
      ) {
        const data = payment.data as {
          isSavePeriod: boolean
          period: SubscriptionPeriodEnum
          periodMultiplier: number
          trafficReset: TrafficResetEnum
        }
        const updateSub = await this.xrayService.renewSubFinaly(
          payment.userId,
          payment.subscriptionId,
          data.isSavePeriod,
          data.period,
          data.periodMultiplier,
          data.trafficReset,
        )
      }

      // Обрабатываем успешный платеж в транзакции
      const result = await this.processCompletedPayment(
        payment,
        status,
        details,
        isSubscription,
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
    isSubscription: boolean = false,
  ) {
    return this.prismaService.$transaction(async (tx) => {
      // 1. Обновляем баланс пользователя
      if (!isSubscription) await this.updateUserBalance(tx, payment)

      // 2. Создаем транзакцию платежа
      const transaction = await this.createPaymentTransaction(
        tx,
        payment,
        isSubscription,
      )

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
    isSubscription: boolean = false,
  ) {
    const transaction = await tx.transactions.create({
      data: {
        amount: payment.amountStars,
        type: isSubscription
          ? TransactionTypeEnum.SUBSCRIPTIONS
          : TransactionTypeEnum.PLUS,
        reason: TransactionReasonEnum.PAYMENT,
        balanceType: isSubscription
          ? BalanceTypeEnum.NOT_BALANCE
          : BalanceTypeEnum.PAYMENT,
        balanceId: isSubscription ? null : payment.user.balanceId,
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
    const updatedPayment = await tx.payments.update({
      where: {
        token,
      },
      data: {
        status,
        transactionId,
        ...(details && { details: details as Prisma.JsonObject }),
      },
    })

    try {
      await this.bot.telegram
        .sendMessage(
          Number(process.env.TELEGRAM_LOG_CHAT_ID),
          `<b>НОВЫЙ УСПЕШНЫЙ ПЛАТЕЖ</b>
<b>Статус:</b> <code>${updatedPayment.status}</code>
<b>Пользователь:</b> <code>${updatedPayment.userId}</code>
<b>Сумма Stars:</b> <code>${updatedPayment.amountStars} ⭐</code>
<b>Сумма в валюте:</b> <code>${updatedPayment.amount}</code>
<b>Метод:</b> <code>${updatedPayment.methodKey}</code>
<b>Валюта:</b> <code>${updatedPayment.currencyKey}</code>
<b>Rate:</b> <code>${updatedPayment.exchangeRate}</code>
<b>Комиссия:</b> <code>${updatedPayment.commission}</code>
<b>Партнер телеграм:</b> <code>${updatedPayment.isTgPartnerProgram}</code>
<b>Потеря на партнерку:</b> <code>${updatedPayment.amountStarsFeeTgPartner} ⭐</code>
<b>Подписка:</b> <code>${updatedPayment.subscriptionId}</code>
`,
          {
            parse_mode: 'HTML',
            message_thread_id: Number(process.env.TELEGRAM_THREAD_ID_PAYMENTS),
          },
        )
        .catch((e) => {
          this.logger.error({
            msg: `Error while sending message to telegram`,
            e,
          })
        })
        .then(() => {
          this.logger.info({
            msg: `Message sent to telegram`,
          })
        })
    } catch (e) {
      this.logger.error({
        msg: `Error while sending message to telegram`,
        e,
      })
    }

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

    const getSettings = await tx.settings.findUnique({
      where: {
        key: DefaultEnum.DEFAULT,
      },
    })

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
    settings,
    payment: PaymentWithRelations,
  ) {
    const commissionLvl = this.getReferralCommissionPercent(
      referrer.level,
      settings,
    )
    const tgPartnerCommission =
      payment.isTgPartnerProgram && payment.methodKey == PaymentMethodEnum.STARS
        ? payment.amountStarsFeeTgPartner
        : 0
    const referralCommission = Number(
      ((payment.amountStars - tgPartnerCommission) * commissionLvl).toFixed(3),
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

    let plusTrafficRewarded = 0

    if (!referrer.isActivated) {
      plusTrafficRewarded =
        referrer.level > 1
          ? 0
          : payment.user.telegramData.isPremium
          ? settings.referralInvitePremiumRewardGb
          : settings.referralInviteRewardGb

      await tx.referrals.update({
        where: {
          id: referrer.id,
        },
        data: {
          totalTrafficRewarded:
            referrer.totalTrafficRewarded + plusTrafficRewarded,
          isActivated: true,
        },
      })
    }

    // Обновляем баланс реферера
    await tx.userBalance.update({
      where: {
        id: referrer.inviter.balanceId,
      },
      data: {
        paymentBalance:
          referrer.inviter.balance.paymentBalance + referralCommission,
        ...(plusTrafficRewarded > 0 && {
          traffic: referrer.inviter.balance.traffic + plusTrafficRewarded,
        }),
        ...(payment.methodKey == PaymentMethodEnum.STARS && {
          holdBalance:
            referrer.inviter.balance.holdBalance + referralCommission,
        }),
      },
    })

    this.logger.info({
      msg: `Updated referrer balance`,
      referrerId: referrer.inviter.id,
      balanceId: referrer.inviter.balanceId,
      amount: referralCommission,
    })

    // Создаем транзакцию для реферальной комиссии

    const transactions = [
      referralCommission > 0 && {
        amount: referralCommission,
        type: TransactionTypeEnum.PLUS,
        reason: TransactionReasonEnum.REFERRAL,
        balanceType: BalanceTypeEnum.PAYMENT,
        balanceId: referrer.inviter.balanceId,
      },
      payment.methodKey == PaymentMethodEnum.STARS &&
        referralCommission > 0 && {
          amount: referralCommission,
          type: TransactionTypeEnum.PLUS,
          reason: TransactionReasonEnum.REFERRAL,
          balanceType: BalanceTypeEnum.HOLD,
          balanceId: referrer.inviter.balanceId,
          holdExpiredAt: addDays(new Date(), 21),
        },
      plusTrafficRewarded > 0 && {
        amount: plusTrafficRewarded,
        type: TransactionTypeEnum.PLUS,
        reason: TransactionReasonEnum.REFERRAL,
        balanceType: BalanceTypeEnum.TRAFFIC,
        balanceId: referrer.inviter.balanceId,
      },
    ].filter(Boolean)

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
  private getReferralCommissionPercent(level: number, settings): number {
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
  PrismaClient<Prisma.PrismaClientOptions, never, DefaultArgs>,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
>

// Тип для платежа с включенными связями
type PaymentWithRelations = Prisma.PaymentsGetPayload<{
  include: {
    subscription: {
      include: {
        plan: true
      }
    }
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
