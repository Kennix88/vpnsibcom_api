import { I18nTranslations } from '@core/i18n/i18n.type'
import { LoggerTelegramService } from '@core/logger/logger-telegram.service'
import { PaymentsService } from '@modules/payments/services/payments.service'
import { UsersService } from '@modules/users/users.service'
import { ConfigService } from '@nestjs/config'
import { PaymentStatusEnum } from '@shared/enums/payment-status.enum'
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
   * @param ctx - Контекст Telegram
   */
  @On('pre_checkout_query')
  async handlePreCheckout(@Ctx() ctx: Context) {
    try {
      const query = ctx.preCheckoutQuery
      this.logger.info(`PreCheckoutQuery received: ${JSON.stringify(query)}`)

      // Обязательно отвечаем в течение 10 секунд
      await ctx.answerPreCheckoutQuery(true)
    } catch (err) {
      this.logger.error({ 
        msg: 'Error in pre_checkout_query handler', 
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined 
      })
      
      // Отправляем уведомление об ошибке в Telegram-логгер
      await this.telegramLogger.error(`Error in pre_checkout_query handler: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  /**
   * Обработка успешной оплаты
   * @param ctx - Контекст Telegram
   */
  @On('message')
  async handleSuccessfulPayment(@Ctx() ctx: Context) {
    try {
      const msg = ctx.message
      if (!('successful_payment' in msg)) return

      const payment = msg.successful_payment as SuccessfulPayment
      const userId = ctx.from?.id.toString()
      
      this.logger.info({
        msg: 'SuccessfulPayment received',
        payment: JSON.stringify(payment),
        userId
      })

      // Получаем язык пользователя
      let userLang = 'ru'
      if (userId) {
        const user = await this.usersService.getUserByTgId(userId)
        if (user?.language?.iso6391) {
          userLang = user.language.iso6391
        }
      }

      const updatePayment = await this.paymentsService.updatePayment(
        payment.invoice_payload,
        PaymentStatusEnum.COMPLETED,
        payment,
      )

      if (!updatePayment) {
        const errorMessage = await this.i18n.translate('payments.payment_failed', {
          lang: userLang
        })
        
        await ctx.reply(errorMessage)
        return
      }

      const successMessage = await this.i18n.translate('payments.payment_success', {
        args: { amount: updatePayment.amountStars },
        lang: userLang
      })
      
      await ctx.reply(successMessage)
    } catch (err) {
      this.logger.error({ 
        msg: 'Error in successful_payment handler', 
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined 
      })
      
      // Отправляем уведомление об ошибке в Telegram-логгер
      await this.telegramLogger.error(`Error in successful_payment handler: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}
