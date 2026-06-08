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
   */
  @On('pre_checkout_query')
  async handlePreCheckout(@Ctx() ctx: Context) {
    try {
      const query = ctx.preCheckoutQuery
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
    }
  }

  /**
   * Обработка успешной оплаты.
   *
   * FIX #11: заменён @On('message') на @On('successful_payment').
   * В оригинале оба файла — StartUpdate и PaymentsUpdate — слушали @On('message'),
   * что приводило к конфликту: при получении сообщения об успешной оплате
   * StartUpdate тоже реагировал и мог отправить приветственный экран.
   * Telegraf поддерживает фильтр по подтипу сообщения 'successful_payment',
   * поэтому здесь теперь используется точечный обработчик.
   */
  @On('successful_payment')
  async handleSuccessfulPayment(@Ctx() ctx: Context) {
    try {
      const msg = ctx.message
      if (!msg) return
      if (!('successful_payment' in msg)) return

      const payment = msg.successful_payment as SuccessfulPayment
      const userId = ctx.from?.id.toString()

      this.logger.info({
        msg: 'SuccessfulPayment received',
        payment: JSON.stringify(payment),
        userId,
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
