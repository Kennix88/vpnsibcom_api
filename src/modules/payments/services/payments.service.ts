import { I18nTranslations } from '@core/i18n/i18n.type'
import { RedisService } from '@core/redis/redis.service'
import { RatesService } from '@modules/rates/rates.service'
import { UsersService } from '@modules/users/users.service'
import { MarzbanService } from '@modules/xray/services/marzban.service'
import { XrayService } from '@modules/xray/services/xray.service'
import { UserCreate } from '@modules/xray/types/marzban.types'
import { periodHours } from '@modules/xray/utils/period-hours.util'
import { forwardRef, Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Prisma } from '@prisma/client'
import { CurrencyTypeEnum } from '@shared/enums/currency-type.enum'
import { CurrencyEnum } from '@shared/enums/currency.enum'
import { PaymentMethodTypeEnum } from '@shared/enums/payment-method-type.enum'
import { PaymentMethodEnum } from '@shared/enums/payment-method.enum'
import { PaymentStatusEnum } from '@shared/enums/payment-status.enum'
import { PaymentSystemEnum } from '@shared/enums/payment-system.enum'
import { SubscriptionPeriodEnum } from '@shared/enums/subscription-period.enum'
import { PaymentMethodsDataInterface } from '@shared/types/payment-methods-data.interface'
import { fxUtil } from '@shared/utils/fx.util'
import { genToken } from '@shared/utils/gen-token.util'
import { BalanceTypeEnum } from '@vpnsibcom/src/shared/enums/balance-type.enum'
import { DefaultEnum } from '@vpnsibcom/src/shared/enums/default.enum'
import { TransactionReasonEnum } from '@vpnsibcom/src/shared/enums/transaction-reason.enum'
import { TransactionTypeEnum } from '@vpnsibcom/src/shared/enums/transaction-type.enum'
import { addDays, addHours } from 'date-fns'
import { I18nService } from 'nestjs-i18n'
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
    private readonly marzbanService: MarzbanService,
    @Inject(forwardRef(() => XrayService))
    private readonly xrayService: XrayService,
    private readonly i18n: I18nService<I18nTranslations>,
    @InjectBot() private readonly bot: Telegraf,
  ) {}

  public async createInvoice(
    amount: number,
    method: PaymentMethodEnum,
    tgId: string,
    subscriptionId: string = null,
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
          include: {
            language: true,
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
          isTmaIvoice = true
        }

        if (!linkPay) {
          throw new Error(`LinkPay not found`)
        }

        const createPayment = await tx.payments.create({
          data: {
            ...paymentObject,
            linkPay,
            subscriptionId,
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

      if (isSubscription) {
        // Подготовка данных для Marzban
        const marbanDataStart: UserCreate = {
          username: payment.subscription.username,
          proxies: {
            vless: {
              flow: 'xtls-rprx-vision',
            },
          },
          inbounds: {
            vless: ['VLESS'],
          },
          status: 'active',
          ...(!payment.subscription.isUnlimitTraffic && {
            data_limit_reset_strategy: 'day',
            data_limit:
              payment.subscription.trafficLimitGb * 1024 * 1024 * 1024,
          }),
          note: `${payment.user.id}/${payment.user.telegramId}/${
            payment.user.telegramData?.username || ''
          }/${payment.user.telegramData?.firstName || ''}/${
            payment.user.telegramData?.lastName || ''
          }`,
        }

        // Добавление пользователя в Marzban
        const marzbanData = await this.marzbanService.addUser(marbanDataStart)
        if (!marzbanData) {
          this.logger.error({
            msg: `Не удалось добавить пользователя в Marzban для Telegram ID: ${payment.user.telegramId}`,
          })
          return
        }

        await this.marzbanService.restartCore()

        const settings = await this.prismaService.settings.findUnique({
          where: {
            key: DefaultEnum.DEFAULT,
          },
        })

        // Расчет времени истечения подписки
        const hours = periodHours(
          payment.subscription.period as SubscriptionPeriodEnum,
          payment.subscription.periodMultiplier,
        )
        if (
          payment.subscription.period !== SubscriptionPeriodEnum.INDEFINITELY &&
          hours <= 0
        ) {
          this.logger.error({
            msg: `Некорректный период подписки: ${payment.subscription.period}`,
          })
          return
        }

        const isIndefinitely =
          payment.subscription.period === SubscriptionPeriodEnum.INDEFINITELY

        const subscription = await this.prismaService.subscriptions.update({
          where: {
            id: payment.subscriptionId,
          },
          data: {
            isActive: true,
            isInvoicing: false,
            isCreated: true,
            links: marzbanData.links,
            dataLimit: marzbanData.data_limit / 1024 / 1024,
            usedTraffic: marzbanData.used_traffic / 1024 / 1024,
            lifeTimeUsedTraffic: marzbanData.used_traffic / 1024 / 1024,
            expiredAt: isIndefinitely ? null : addHours(new Date(), hours),
            marzbanData: JSON.parse(JSON.stringify(marzbanData)),
          },
        })

        if (!subscription) {
          this.logger.error({
            msg: `Не удалось создать подписку в базе данных для пользователя с Telegram ID: ${payment.user.telegramId}`,
          })
          return
        }

        // Обработка реферальной системы
        await this.xrayService.processReferrals(payment.user)

        this.logger.info({
          msg: `Подписка успешно создана для пользователя с Telegram ID: ${payment.user.telegramId}`,
          subscriptionId: subscription.id,
        })
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
    return this.prismaService.$transaction(async (tx: PrismaTransaction) => {
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
  ): Promise<Transaction> {
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
        isHold: false,
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

      // Получаем язык пользователя
      const inviter = await tx.users.findUnique({
        where: { id: referrer.inviter.id },
        include: { language: true },
      })

      const userLang = inviter?.language?.iso6391 || 'ru'

      // Локализованные сообщения
      const messageTitle = await this.i18n.translate(
        'payments.referral.reward_title',
        {
          lang: userLang,
        },
      )

      let message = `${messageTitle}\n\n`

      if (referralCommission > 0) {
        const holdMessage = await this.i18n.translate(
          'payments.referral.hold_reward',
          {
            args: { amount: referralCommission, days: 21 },
            lang: userLang,
          },
        )
        message += `${holdMessage}\n`
      }

      if (plusPaymentsRewarded > 0) {
        const availableMessage = await this.i18n.translate(
          'payments.referral.available_reward',
          {
            args: { amount: plusPaymentsRewarded },
            lang: userLang,
          },
        )
        message += `${availableMessage}\n`
      }

      const referralLabel = await this.i18n.translate(
        'payments.referral.referral_label',
        {
          lang: userLang,
        },
      )

      const levelLabel = await this.i18n.translate(
        'payments.referral.level_label',
        {
          lang: userLang,
        },
      )

      message += `\n${referralLabel}: ${referralName}\n${levelLabel}: ${referrer.level}`

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
