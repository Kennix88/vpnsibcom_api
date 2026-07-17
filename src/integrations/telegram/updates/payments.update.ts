import { I18nTranslations } from '@core/i18n/i18n.type'
import { LoggerTelegramService } from '@core/logger/logger-telegram.service'
import { PaymentsService } from '@modules/payments/services/payments.service'
import { UsersService } from '@modules/users/services/users.service'
import { ConfigService } from '@nestjs/config'
import { SuccessfulPayment } from '@telegraf/types'
import { I18nService } from 'nestjs-i18n'
import { PinoLogger } from 'nestjs-pino'
import { Ctx, On, Update } from 'nestjs-telegraf'
import { Context } from 'telegraf'

/**
 * Обработчик платежных событий Telegram
 */
@Update()
export class PaymentsUpdate {
  constructor(
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
    private readonly i18n: I18nService<I18nTranslations>,
    private readonly telegramLogger: LoggerTelegramService,
    private readonly paymentsService: PaymentsService,
    private readonly usersService: UsersService,
  ) {
    this.logger.setContext(PaymentsUpdate.name)
  }

  /**
   * Обработка pre_checkout_query
   *
   * ВАЖНО: у апдейта pre_checkout_query нет поля `chat` (это не сообщение
   * в чате, а отдельный тип апдейта), поэтому ctx.chat здесь всегда
   * undefined. Проверка `ctx.chat?.type !== 'private'` была всегда true,
   * из-за чего answerPreCheckoutQuery никогда не вызывался и любой
   * платеж зависал на экране "Обработка..." до таймаута Telegram (~10с),
   * после чего оплата отменялась. Проверка по chat удалена.
   */
  @On('pre_checkout_query')
  async handlePreCheckout(@Ctx() ctx: Context) {
    try {
      if (!ctx.from) {
        return
      }

      if (ctx.from.is_bot) {
        this.logger.warn({
          msg: 'Bot update received',
          update: ctx.update,
        })

        return
      }

      const query = ctx.preCheckoutQuery
      if (!query) {
        return
      }

      this.logger.info(`PreCheckoutQuery received: ${JSON.stringify(query)}`)

      await ctx.answerPreCheckoutQuery(true)
    } catch (err) {
      this.logger.error({
        msg: 'Error in pre_checkout_query handler',
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      })
      await this.telegramLogger.error(
        `Error in pre_checkout_query handler: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )

      // Если answerPreCheckoutQuery не был вызван из-за ошибки выше,
      // пытаемся явно отклонить платеж, чтобы Telegram не ждал таймаута
      // и пользователь сразу увидел ошибку вместо зависшего спиннера.
      try {
        await ctx.answerPreCheckoutQuery(
          false,
          'Произошла ошибка. Попробуйте еще раз.',
        )
      } catch {
        // answerPreCheckoutQuery уже мог быть вызван выше — игнорируем
      }
    }
  }

  @On('successful_payment')
  async handleSuccessfulPayment(@Ctx() ctx: Context) {
    try {
      if (!ctx.from) {
        return
      }

      if (ctx.from.is_bot) {
        this.logger.warn({
          msg: 'Bot update received',
          update: ctx.update,
        })

        return
      }

      const msg = ctx.message
      if (!msg) return
      if (!('successful_payment' in msg)) return

      const payment = msg.successful_payment as SuccessfulPayment
      if (payment.currency !== 'XTR') {
        this.logger.warn({
          msg: 'Unexpected payment currency',
          currency: payment.currency,
        })

        return
      }
      const userId = ctx.from?.id.toString()

      this.logger.info({
        msg: 'Successful payment',

        telegramUserId: ctx.from.id,

        amount: payment.total_amount,

        currency: payment.currency,

        invoicePayload: payment.invoice_payload,

        telegramPaymentChargeId: payment.telegram_payment_charge_id,
      })

      let userLang = 'ru'
      if (userId) {
        const user = await this.usersService.getUserByTgId(userId)
        if (user?.language?.iso6391) {
          userLang = user.language.iso6391
        }
      }

      const updatePayment =
        userId &&
        (await this.paymentsService.processTelegramStarsIncomingPayment({
          telegramUserId: userId,
          invoicePayload: payment.invoice_payload,
          totalAmount: payment.total_amount,
          telegramPaymentChargeId: payment.telegram_payment_charge_id,
          providerPaymentChargeId: payment.provider_payment_charge_id,
          rawDetails: payment,
        }))

      if (!updatePayment) {
        const errorMessage = await this.i18n.translate(
          'payments.payment_failed',
          {
            lang: userLang,
          },
        )
        await ctx.reply(errorMessage)
        return
      }
    } catch (err) {
      this.logger.error({
        msg: 'Error in successful_payment handler',
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      })
      await this.telegramLogger.error(
        `Error in successful_payment handler: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    }
  }
}
