import { I18nTranslations } from '@core/i18n/i18n.type'
import { RedisService } from '@core/redis/redis.service'
import { RatesService } from '@modules/rates/rates.service'
import { UsersService } from '@modules/users/services/users.service'

import { Prisma, Settings } from '@core/prisma/generated/client'
import { PrismaService } from '@core/prisma/prisma.service'
import { ReferralsService } from '@modules/referrals/referrals.service'
import { EventsService } from '@modules/users/services/events.service'
import { EventType } from '@modules/users/types/event-type.enum'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { CurrencyTypeEnum } from '@shared/enums/currency-type.enum'
import { CurrencyEnum } from '@shared/enums/currency.enum'
import { PaymentMethodTypeEnum } from '@shared/enums/payment-method-type.enum'
import { PaymentMethodEnum } from '@shared/enums/payment-method.enum'
import { PaymentStatusEnum } from '@shared/enums/payment-status.enum'
import { PaymentSystemEnum } from '@shared/enums/payment-system.enum'
import { PaymentMethodsDataInterface } from '@shared/types/payment-methods-data.interface'
import { roundUp } from '@shared/utils/calculate.util'
import { fxUtil } from '@shared/utils/fx.util'
import { genToken } from '@shared/utils/gen-token.util'
import { SuccessfulPayment } from '@telegraf/types'
import { BalanceTypeEnum } from '@vpnsibcom/src/shared/enums/balance-type.enum'
import { DefaultEnum } from '@vpnsibcom/src/shared/enums/default.enum'
import { TransactionReasonEnum } from '@vpnsibcom/src/shared/enums/transaction-reason.enum'
import { I18nService } from 'nestjs-i18n'
import { PinoLogger } from 'nestjs-pino'
import { InjectBot } from 'nestjs-telegraf'
import { Telegraf } from 'telegraf'
import { BonusesInterface } from '../types/bonuses.interface'
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
    private readonly i18n: I18nService<I18nTranslations>,
    @InjectBot() private readonly bot: Telegraf,
    private readonly eventsService: EventsService,
    private readonly referralsService: ReferralsService,
  ) {}

  // FIX #10: Выделен общий приватный метод для расчёта бонусных звёзд,
  // чтобы избежать дублирования идентичной логики в createInvoice и
  // processTelegramStarsIncomingPayment.
  private calculateBonusStars(amountStars: number, settings: Settings): number {
    if (amountStars < 250) return 0
    if (amountStars < 500) return amountStars * settings.bonusPayment250
    if (amountStars < 1000) return amountStars * settings.bonusPayment500
    if (amountStars < 2500) return amountStars * settings.bonusPayment1000
    if (amountStars < 5000) return amountStars * settings.bonusPayment2500
    if (amountStars < 10000) return amountStars * settings.bonusPayment5000
    if (amountStars < 20000) return amountStars * settings.bonusPayment10000
    if (amountStars < 50000) return amountStars * settings.bonusPayment20000
    return amountStars * settings.bonusPayment50000
  }

  public async createInvoice(
    amount: number,
    method: PaymentMethodEnum,
    tgId: string,
    paymentType: PaymentTypeEnum,
    data: object | null = null,
  ): Promise<{
    linkPay: string
    isTonPayment: boolean
    amountTon: number
    token: string
  }> {
    try {
      return await this.prismaService.$transaction(async (tx) => {
        const getMethod = await tx.paymentMethods.findUnique({
          where: { key: method, isActive: true },
        })
        if (!getMethod)
          throw new Error(`Payment method not found or not active`)

        const getUser = await tx.users.findUnique({
          where: { telegramId: tgId },
          include: { language: true },
        })
        if (!getUser) throw new Error(`User not found`)

        const settings = await tx.settings.findUnique({
          where: { key: DefaultEnum.DEFAULT },
        })
        if (!settings) throw new Error(`Default settings not found`)

        const rates = await this.ratesService.getRates()
        const token = genToken()

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

        // FIX #10: используем общий метод вместо дублированного тернарного блока
        const bonusStars = this.calculateBonusStars(amountStars, settings)

        const paymentObject = {
          status: PaymentStatusEnum.PENDING,
          amount: convertedAmount,
          amountStars,
          ...(paymentType === PaymentTypeEnum.ADD_PAYMENT_BALANCE && {
            bonusStars,
          }),
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
          const title = await this.i18n.translate('payments.invoice.title', {
            args: { amount },
            lang: getUser.language.iso6391,
          })
          const description = await this.i18n.translate(
            'payments.invoice.description',
            {
              args: { amount },
              lang: getUser.language.iso6391,
            },
          )

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
          },
        })

        return {
          linkPay:
            getMethod.key === PaymentMethodEnum.TON_TON
              ? this.configService.getOrThrow<string>('TON_WALLET')
              : linkPay,
          isTonPayment: getMethod.key === PaymentMethodEnum.TON_TON,
          token: createPayment.token,
          amountTon:
            getMethod.key === PaymentMethodEnum.TON_TON ? convertedAmount : 0,
        }
      })
    } catch (e: unknown) {
      const error = e as Error
      this.logger.error(
        `Error while creating invoice for user ${tgId}: ${error.message}`,
      )
      throw error
    }
  }

  public async updatePayment(
    token: string,
    status: PaymentStatusEnum,
    details?: object,
  ): Promise<{ amountStars: number } | undefined> {
    try {
      this.logger.info({ msg: `Updating payment`, token, status })

      // FIX #2: Атомарная проверка-и-обновление статуса через updateMany,
      // чтобы исключить race condition между findUnique и последующим update.
      // Если count === 0, платёж уже обрабатывается другим процессом или завершён.
      if (status === PaymentStatusEnum.COMPLETED) {
        const claimed = await this.prismaService.payments.updateMany({
          where: {
            token,
            status: { not: PaymentStatusEnum.COMPLETED },
          },
          data: { status: PaymentStatusEnum.PENDING },
        })

        if (claimed.count === 0) {
          this.logger.warn({
            msg: `Payment already completed or being processed, skipping`,
            token,
          })
          // Возвращаем данные платежа без повторной обработки
          const existing = await this.prismaService.payments.findUnique({
            where: { token },
            select: { amountStars: true },
          })
          return existing ? { amountStars: existing.amountStars } : undefined
        }
      }

      const payment = await this.prismaService.payments.findUnique({
        where: { token },
        include: {
          user: {
            include: {
              inviters: {
                include: {
                  inviter: { include: { balance: true } },
                },
              },
              balance: true,
              telegramData: true,
            },
          },
        },
      })

      if (!payment) {
        throw new Error(`Payment not found`)
      }

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

      this.logger.info({ msg: `Payment completed`, token, status })

      // FIX #1: начисление бонуса перенесено внутрь processCompletedPayment,
      // чтобы оно выполнялось атомарно в одной транзакции вместе с основным балансом.
      await this.processCompletedPayment(payment, status, details)

      return { amountStars: payment.amountStars }
    } catch (e) {
      this.logger.error({
        msg: `Error while updating payment`,
        error: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined,
        token,
        status,
      })

      // При ошибке сбрасываем статус PROCESSING обратно в PENDING,
      // чтобы платёж мог быть повторно обработан
      if (status === PaymentStatusEnum.COMPLETED) {
        await this.prismaService.payments
          .updateMany({
            where: { token, status: PaymentStatusEnum.PENDING },
            data: { status: PaymentStatusEnum.PENDING },
          })
          .catch((rollbackErr) => {
            this.logger.error({
              msg: `Failed to rollback PROCESSING status`,
              token,
              error:
                rollbackErr instanceof Error
                  ? rollbackErr.message
                  : String(rollbackErr),
            })
          })
      }

      throw e
    }
  }

  public async processTelegramStarsIncomingPayment(params: {
    telegramUserId: string
    invoicePayload?: string
    totalAmount: number
    telegramPaymentChargeId?: string
    providerPaymentChargeId?: string
    rawDetails?: object
  }): Promise<{ processed: boolean; token?: string }> {
    const {
      telegramUserId,
      invoicePayload,
      totalAmount,
      telegramPaymentChargeId,
      providerPaymentChargeId,
      rawDetails,
    } = params

    const incomingToken = invoicePayload?.trim()

    if (incomingToken) {
      try {
        await this.updatePayment(
          incomingToken,
          PaymentStatusEnum.COMPLETED,
          rawDetails,
        )
        return { processed: true, token: incomingToken }
      } catch (error) {
        this.logger.warn({
          msg: 'Failed to complete payment by invoice payload token, fallback to recovery flow',
          token: incomingToken,
          telegramUserId,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    const chargeId = telegramPaymentChargeId || providerPaymentChargeId
    if (!chargeId) {
      throw new Error(
        'Telegram charge id is missing for incoming Stars payment',
      )
    }

    const recoveryToken = `tg-stars-recovery-${chargeId}`

    const existingRecovery = await this.prismaService.payments.findUnique({
      where: { token: recoveryToken },
      select: { id: true, status: true, token: true },
    })

    if (existingRecovery?.status === PaymentStatusEnum.COMPLETED) {
      return { processed: true, token: existingRecovery.token }
    }

    const user = await this.prismaService.users.findUnique({
      where: { telegramId: telegramUserId },
      select: { id: true, isTgProgramPartner: true },
    })
    if (!user)
      throw new Error(`User not found by telegramId: ${telegramUserId}`)

    const settings = await this.prismaService.settings.findUnique({
      where: { key: DefaultEnum.DEFAULT },
    })
    if (!settings) throw new Error('Default settings not found')

    const amountStars = Number(totalAmount.toFixed(0))
    // FIX #10: используем общий метод вместо дублированного тернарного блока
    const bonusStars = this.calculateBonusStars(amountStars, settings)

    try {
      if (!existingRecovery) {
        await this.prismaService.payments.create({
          data: {
            status: PaymentStatusEnum.PENDING,
            type: PaymentTypeEnum.ADD_PAYMENT_BALANCE,
            amount: amountStars,
            amountStars,
            bonusStars,
            exchangeRate: 1,
            commission: 0,
            isTgPartnerProgram: user.isTgProgramPartner,
            amountStarsFeeTgPartner: user.isTgProgramPartner
              ? amountStars * settings.commissionRatioTgPartnerProgram
              : 0,
            token: recoveryToken,
            userId: user.id,
            currencyKey: CurrencyEnum.XTR,
            methodKey: PaymentMethodEnum.STARS,
            details: (rawDetails ||
              ({
                telegram_payment_charge_id: telegramPaymentChargeId,
                provider_payment_charge_id: providerPaymentChargeId,
              } as SuccessfulPayment)) as Prisma.JsonObject,
          },
        })
      }
    } catch (error) {
      this.logger.warn({
        msg: 'Failed to create recovery payment, maybe already exists',
        recoveryToken,
        error: error instanceof Error ? error.message : String(error),
      })
    }

    try {
      await this.updatePayment(
        recoveryToken,
        PaymentStatusEnum.COMPLETED,
        rawDetails || { recoveryToken },
      )
      return { processed: true, token: recoveryToken }
    } catch (error) {
      const completed = await this.prismaService.payments.findUnique({
        where: { token: recoveryToken },
        select: { status: true, token: true },
      })
      if (completed?.status === PaymentStatusEnum.COMPLETED) {
        return { processed: true, token: completed.token }
      }
      throw error
    }
  }

  /**
   * Обрабатывает успешно завершенный платеж
   */
  private async processCompletedPayment(
    payment,
    status: PaymentStatusEnum,
    details?: object,
  ) {
    return this.prismaService.$transaction(async (tx) => {
      // 1. Основное начисление баланса + создание транзакции — одним вызовом
      const balanceResult = await this.userService.addUserBalance(
        payment.userId,
        payment.amountStars,
        TransactionReasonEnum.PAYMENT,
        BalanceTypeEnum.PAYMENT,
        tx,
      )

      if (!balanceResult.success || !balanceResult.transactionId) {
        throw new Error(
          `Failed to credit payment balance for user ${payment.userId}`,
        )
      }

      this.logger.info({
        msg: `Updated user balance`,
        userId: payment.user.id,
        balanceId: payment.user.balanceId,
        amount: payment.amountStars,
      })

      // 2. Бонус — теперь ВНУТРИ той же транзакции (раньше вызывался без tx,
      // из-за чего мог начислиться отдельно от основного платежа при сбое
      // дальнейших шагов).
      if (
        payment.type === PaymentTypeEnum.ADD_PAYMENT_BALANCE &&
        payment.bonusStars > 0
      ) {
        const bonusResult = await this.userService.addUserBalance(
          payment.userId,
          payment.bonusStars,
          TransactionReasonEnum.BONUS,
          BalanceTypeEnum.PAYMENT,
          tx,
        )

        if (!bonusResult.success) {
          this.logger.error({
            msg: `Failed to credit payment bonus`,
            userId: payment.userId,
            bonusStars: payment.bonusStars,
          })
        }
      }

      // 3. Обновляем статус платежа, используя id транзакции, вернувшийся
      // из addUserBalance — отдельный createPaymentTransaction больше не нужен.
      await this.updatePaymentStatus(
        tx,
        payment.token,
        status,
        balanceResult.transactionId,
        details,
      )

      // 4. Реферальные комиссии
      await this.referralsService.processReferralCommissions(tx, payment)
    })
  }

  /**
   * Обновляет статус платежа
   */
  private async updatePaymentStatus(
    tx,
    token: string,
    status: PaymentStatusEnum,
    transactionId: string,
    details?: object,
  ) {
    const updatedPayment = await tx.payments.update({
      where: { token },
      data: {
        status,
        transactionId,
        ...(details && { details: details as Prisma.JsonObject }),
      },
      include: {
        user: {
          include: {
            telegramData: true,
            acquisition: true,
          },
        },
      },
    })

    // FIX #7: Запрос выполняется после обновления статуса платежа, поэтому
    // текущий платёж уже включён в результат. Исключаем его по id,
    // чтобы корректно определить «первый платёж».
    const previousPayments = await tx.payments.findMany({
      where: {
        userId: updatedPayment.userId,
        status: PaymentStatusEnum.COMPLETED,
        id: { not: updatedPayment.id },
      },
    })
    const isFirstPayment = previousPayments.length === 0
    const paymentOrderText = isFirstPayment ? 'Первый' : 'Повторный'

    const startParams =
      updatedPayment.user.acquisition?.firstStartParams ||
      updatedPayment.user.acquisition?.lastStartParams
    const referralId =
      updatedPayment.user.acquisition?.firstReferralId ||
      updatedPayment.user.acquisition?.lastReferralId

    const escapeHtml = (value?: string | null) =>
      String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')

    try {
      await this.bot.telegram
        .sendMessage(
          Number(process.env.TELEGRAM_LOG_CHAT_ID),
          `<b>💳 НОВЫЙ УСПЕШНЫЙ ПЛАТЕЖ</b>
<b>Статус:</b> <code>${updatedPayment.status}</code>
<b>Платеж по счету:</b> <code>${paymentOrderText}</code>
<b>👤 Пользователь:</b> ${
            updatedPayment.user.telegramData?.username
              ? `@${updatedPayment.user.telegramData?.username}`
              : ''
          } <code>${updatedPayment.user.telegramData?.firstName || ''} ${
            updatedPayment.user.telegramData?.lastName || ''
          }</code>
<b>🪪 User ID:</b> <code>${updatedPayment.user.id}</code>
<b>🆔 Telegram ID:</b> <code>${updatedPayment.user.telegramId}</code>
<b>⭐ Премиум:</b> <code>${
            updatedPayment.user.telegramData?.isPremium ? '✅' : '🚫'
          }</code>
<b>Сумма Stars:</b> <code>${updatedPayment.amountStars} ⭐</code>
<b>Сумма бонуса Stars:</b> <code>${updatedPayment.bonusStars} ⭐</code>
<b>Сумма в валюте:</b> <code>${updatedPayment.amount}</code> <code>${
            updatedPayment.currencyKey
          }</code>
<b>Метод:</b> <code>${updatedPayment.methodKey}</code>
<b>Валюта:</b> <code>${updatedPayment.currencyKey}</code>
<b>Rate:</b> <code>${updatedPayment.exchangeRate}</code>
<b>Комиссия:</b> <code>${updatedPayment.commission}</code>
<b>Партнер телеграм:</b> <code>${
            updatedPayment.isTgPartnerProgram ? '✅' : '🚫'
          }</code>
<b>Потеря на партнерку:</b> <code>${
            updatedPayment.amountStarsFeeTgPartner
          } ⭐</code>
<b>Тип платежа:</b> <code>${updatedPayment.type}</code>
<b>Подписка:</b> <code>${updatedPayment.subscriptionId}</code>${
            referralId
              ? `\n<b>Referral ID:</b> <code>${escapeHtml(referralId)}</code>`
              : ''
          }${
            startParams
              ? `\n<b>StartParams:</b> <code>${escapeHtml(startParams)}</code>`
              : ''
          }
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
          this.logger.info({ msg: `Message sent to telegram` })
        })
    } catch (e) {
      this.logger.error({ msg: `Error while sending message to telegram`, e })
    }

    await this.eventsService.createEvent({
      userId: updatedPayment.userId,
      eventType: isFirstPayment
        ? EventType.FIRST_PAYMENT
        : EventType.RELOAD_PAYMENT,
      amountStars: updatedPayment.amountStars,
    })

    this.logger.info({
      msg: `Payment status updated`,
      token,
      status,
      transactionId,
    })
  }

  public async getPaymentMethods(
    isTma: boolean,
  ): Promise<PaymentMethodsDataInterface[]> {
    // FIX #12: пробрасываем ошибку вместо молчаливого возврата undefined
    const getPaymentMethods = await this.prismaService.paymentMethods.findMany({
      where: {
        ...(isTma && { key: { in: [PaymentMethodEnum.STARS] } }),
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

    return getPaymentMethods.map((method) => ({
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
    }))
  }

  public async getBonuses(): Promise<BonusesInterface> {
    // FIX #12: пробрасываем ошибку вместо молчаливого возврата undefined
    const settings = await this.prismaService.settings.findUnique({
      where: { key: DefaultEnum.DEFAULT },
    })

    if (!settings) {
      throw new Error('Default settings not found')
    }

    return {
      bonusPayment250: settings.bonusPayment250,
      bonusPayment500: settings.bonusPayment500,
      bonusPayment1000: settings.bonusPayment1000,
      bonusPayment2500: settings.bonusPayment2500,
      bonusPayment5000: settings.bonusPayment5000,
      bonusPayment10000: settings.bonusPayment10000,
      bonusPayment20000: settings.bonusPayment20000,
      bonusPayment50000: settings.bonusPayment50000,
    }
  }
}
