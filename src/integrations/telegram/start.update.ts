import { I18nTranslations } from '@core/i18n/i18n.type'
import { LoggerTelegramService } from '@core/logger/logger-telegram.service'
import { Context } from '@integrations/telegram/types/telegrafContext.interface'
import { TonPaymentsService } from '@modules/payments/services/ton-payments.service'
import { RatesService } from '@modules/rates/rates.service'
import { ReferralsService } from '@modules/referrals/referrals.service'
import { UsersService } from '@modules/users/users.service'
import { ConfigService } from '@nestjs/config'
import { createReadStream } from 'fs'
import { I18nService } from 'nestjs-i18n'
import { PinoLogger } from 'nestjs-pino'
import { Ctx, InjectBot, Start, Update } from 'nestjs-telegraf'
import { Markup, Telegraf } from 'telegraf'

@Update()
export class StartUpdate {
  constructor(
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
    private readonly i18n: I18nService<I18nTranslations>,
    private readonly referralsService: ReferralsService,
    private readonly telegramLogger: LoggerTelegramService,
    private readonly ratesService: RatesService,
    private readonly userService: UsersService,
    private readonly tonPaymentsService: TonPaymentsService,
    @InjectBot() private readonly bot: Telegraf,
  ) {
    this.logger.setContext(StartUpdate.name)
  }

  @Start()
  async startCommand(@Ctx() ctx: Context) {
    try {
      if (ctx.chat?.type !== 'private' || !ctx.from) return

      const startParam = ctx.startPayload

      // можно выделить реф. ID и партнёрский флаг
      const isTelegramPartner = /^_tgr_[\w-]+$/.test(startParam ?? '')
      const referralKey = startParam?.match(/r-([a-zA-Z0-9]+)/)?.[1] ?? null

      this.logger.info({
        msg: `Start command`,
        telegramId: ctx.from.id,
        startParam,
        isTelegramPartner,
        referralKey,
        // ctx,
      })

      const user = await this.userService.getUserByTgId(ctx.from.id.toString())

      if (!user) {
        await this.userService.createUser({
          telegramId: ctx.from.id.toString(),
          referralKey: referralKey,
          userInBotData: ctx.from,
          isTelegramPartner,
        })
      }

      if (ctx.from.id == this.configService.get<number>('TELEGRAM_ADMIN_ID')) {
        // const transactions = await this.tonPaymentsService.getTransactions(10)
        // const transactions = await this.tonPaymentsService.findPayments([
        //   'order-sadasfewgw',
        //   'sada',
        // ])
        // console.log(JSON.stringify(transactions, null, 2))
        // await this.ratesService.updateApilayerRates()
        // await this.ratesService.updateStarsRate()
        //
        // const rates = await this.ratesService.getRates()
        //
        // console.log(JSON.stringify(rates, null, 2))
      }

      // await ctx.replyWithHTML(
      //   this.i18n.t('telegraf.start.welcome', {
      //     ...(ctx.from.language_code && { lang: ctx.from.language_code }),
      //   }),

      await ctx.sendPhoto(
        { source: createReadStream('assets/welcome.jpg') },
        {
          caption: `<b>Привет, ${ctx.from.first_name}!</b>
Добро пожаловать в VPNsib!
Приложение где можно использовать VPN и играть в игры.

Разработано @KennixDev
При поддежке @solycmty`,
          parse_mode: 'HTML',
          reply_markup: {
            remove_keyboard: true,
            inline_keyboard: [
              [
                Markup.button.webApp(
                  'VPN&GAMES',
                  this.configService.get<string>('WEBAPP_URL'),
                ),
              ],
              [
                Markup.button.url(
                  'Канал',
                  this.configService.get<string>('CHANNEL_URL'),
                ),
                Markup.button.url(
                  'Чат&Поддержка',
                  this.configService.get<string>('CHAT_URL'),
                ),
              ],
              [
                Markup.button.url(
                  'Solyanka Community',
                  'https://t.me/solycmty',
                ),
                Markup.button.url(
                  'KennixDev',
                  this.configService.get<string>('KENNIXDEV_URL'),
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
