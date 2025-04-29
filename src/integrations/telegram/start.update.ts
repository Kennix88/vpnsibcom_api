import { I18nTranslations } from '@core/i18n/i18n.type'
import { LoggerTelegramService } from '@core/logger/logger-telegram.service'
import { Context } from '@integrations/telegram/types/telegrafContext.interface'
import { ReferralsService } from '@modules/referrals/referrals.service'
import { ConfigService } from '@nestjs/config'
import { I18nService } from 'nestjs-i18n'
import { PinoLogger } from 'nestjs-pino'
import { Ctx, Start, Update } from 'nestjs-telegraf'
import { Markup } from 'telegraf'

@Update()
export class StartUpdate {
  constructor(
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
    private readonly i18n: I18nService<I18nTranslations>,
    private readonly referralsService: ReferralsService,
    private readonly telegramLogger: LoggerTelegramService,
  ) {
    this.logger.setContext(StartUpdate.name)
  }

  @Start()
  async startCommand(@Ctx() ctx: Context) {
    try {
      if (ctx.chat?.type !== 'private' || !ctx.from) return

      console.log(JSON.stringify(ctx.from, null, 2))

      if (ctx.from.id == this.configService.get<number>('TELEGRAM_ADMIN_ID')) {
        const referrals = await this.referralsService.getReferrals(
          ctx.from.id.toString(),
        )
        console.log(JSON.stringify(referrals, null, 2))

        // await this.ratesService.updateCoinmarketcapRates()
        // await this.ratesService.updateApilayerRates()
        // await this.ratesService.updateStarsRate()
        //
        // const rates = await this.ratesService.getRates()
        //
        // console.log(JSON.stringify(rates, null, 2))
      }

      await ctx.replyWithHTML(
        this.i18n.t('telegraf.start.welcome', {
          ...(ctx.from.language_code && { lang: ctx.from.language_code }),
        }),
        {
          reply_markup: {
            inline_keyboard: [
              [
                Markup.button.url(
                  'App',
                  'https://t.me/dev_vpnsibcom_bot/testapp',
                ),
              ],
            ],
          },
        },
      )

      return
    } catch (e) {
      this.logger.error({
        tgUserId: ctx.from?.id,
        msg: `An error occurred when starting the bot`,
        err: e,
      })
    }
  }
}
