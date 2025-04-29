import { I18nTranslations } from '@core/i18n/i18n.type'
import { LoggerTelegramService } from '@core/logger/logger-telegram.service'
import { PaymentsService } from '@modules/payments/services/payments.service'
import { ConfigService } from '@nestjs/config'
import { PaymentStatusEnum } from '@shared/enums/payment-status.enum'
import { SuccessfulPayment } from '@telegraf/types'
import { I18nService } from 'nestjs-i18n'
import { PinoLogger } from 'nestjs-pino'
import { Ctx, On, Update } from 'nestjs-telegraf'
import { Context } from 'telegraf'

@Update()
export class PaymentsUpdate {
  constructor(
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
    private readonly i18n: I18nService<I18nTranslations>,
    private readonly telegramLogger: LoggerTelegramService,
    private readonly paymentsService: PaymentsService,
  ) {
    this.logger.setContext(PaymentsUpdate.name)
  }

  // 1) Обработка pre_checkout_query
  @On('pre_checkout_query')
  async handlePreCheckout(@Ctx() ctx: Context) {
    try {
      const query = ctx.preCheckoutQuery
      this.logger.info(`PreCheckoutQuery received: ${JSON.stringify(query)}`)

      // Обязательно отвечаем в течение 10 секунд
      await ctx.answerPreCheckoutQuery(true)
    } catch (err) {
      this.logger.error({ msg: 'Error in pre_checkout_query handler', err })
    }
  }

  // 2) Обработка успешной оплаты
  @On('message')
  async handleSuccessfulPayment(@Ctx() ctx: Context) {
    try {
      const msg = ctx.message
      if (!('successful_payment' in msg)) return

      const payment = msg.successful_payment as SuccessfulPayment
      this.logger.info(`SuccessfulPayment: ${JSON.stringify(payment)}`)

      const updatePayment = await this.paymentsService.updatePayment(
        payment.provider_payment_charge_id,
        PaymentStatusEnum.COMPLETED,
        payment,
      )

      await ctx.reply('✅ Спасибо за оплату! Ваш заказ принят.')
    } catch (err) {
      this.logger.error({ msg: 'Error in successful_payment handler', err })
    }
  }
}
