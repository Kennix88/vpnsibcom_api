import { LoggerTelegramService } from '@core/logger/logger-telegram.service'
import { Context } from '@integrations/telegram/types/telegrafContext.interface'
import { TaddyService } from '@modules/ads/taddy.service'
import { TaddyOriginEnum } from '@modules/ads/types/taddy.interface'
import { TonPaymentsService } from '@modules/payments/services/ton-payments.service'
import { RatesService } from '@modules/rates/rates.service'
import { ReferralsService } from '@modules/referrals/referrals.service'
import { UsersService } from '@modules/users/users.service'
import { ConfigService } from '@nestjs/config'
import { createReadStream } from 'fs'
import { I18nService } from 'nestjs-i18n'
import { PinoLogger } from 'nestjs-pino'
import {
  Command,
  Ctx,
  Help,
  InjectBot,
  On,
  Start,
  Update,
} from 'nestjs-telegraf'
import { Markup, Telegraf } from 'telegraf'

@Update()
export class StartUpdate {
  constructor(
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
    private readonly i18n: I18nService,
    private readonly referralsService: ReferralsService,
    private readonly telegramLogger: LoggerTelegramService,
    private readonly ratesService: RatesService,
    private readonly userService: UsersService,
    private readonly tonPaymentsService: TonPaymentsService,
    private taddyService: TaddyService,
    @InjectBot() private readonly bot: Telegraf,
  ) {
    this.logger.setContext(StartUpdate.name)
  }

  @Help()
  async helpCommand(@Ctx() ctx: Context) {
    await ctx.replyWithHTML(
      `<b>Help</b>
<b>Your Telegram id</b>: <code>${ctx.from.id}</code>

If you have any difficulties with payment, subscription or anything else, write to our chat, we will respond to you!

<b>Commands</b>
/start - start the bot
/help - show this help message
`,
      {
        reply_markup: {
          remove_keyboard: true,
          inline_keyboard: [
            [
              Markup.button.url(
                this.i18n.t('telegraf.telegram.button.chatSupport', {
                  lang: ctx.from.language_code,
                }),
                this.configService.get<string>('CHAT_URL'),
              ),
            ],
            [
              Markup.button.url(
                'Private support',
                this.configService.get<string>('CHANNEL_URL') + '?direct',
              ),
            ],
          ],
        },
      },
    )
  }

  @Start()
  @On('message')
  @Command(['settings', 'profile', 'cancel', 'subscribe', 'policy'])
  async startCommand(@Ctx() ctx: Context) {
    try {
      if (ctx.chat?.type !== 'private' || !ctx.from) return

      const startParam = ctx.startPayload

      const chatInfo = await this.bot.telegram.getChat(ctx.from.id)

      const birth = chatInfo &&
        // @ts-ignore
        chatInfo.birthdate && {
          // @ts-ignore
          year: chatInfo.birthdate.year ?? null,
          // @ts-ignore
          month: chatInfo.birthdate.month ?? null,
          // @ts-ignore
          day: chatInfo.birthdate.day ?? null,
        }

      this.taddyService.startEvent({
        user: {
          id: Number(ctx.from.id),
          firstName: ctx.from.first_name,
          lastName: ctx.from.last_name,
          username: ctx.from.username,
          premium: ctx.from.is_premium,
          language: ctx.from.language_code,
          // @ts-ignore
          ...(chatInfo &&
            // @ts-ignore
            chatInfo.birthdate &&
            // @ts-ignore
            chatInfo.birthdate.year && {
              // @ts-ignore
              birthDate: `${chatInfo.birthdate.year}-${chatInfo.birthdate.month}-${chatInfo.birthdate.day}`,
            }),
        },
        origin: TaddyOriginEnum.SERVER,
        start: startParam,
      })

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
          ...(birth && { birth }),
        })
      }

      if (ctx.from.id == this.configService.get<number>('TELEGRAM_ADMIN_ID')) {
        this.telegramLogger.info(
          `Admin ${ctx.from.first_name} ${ctx.from.last_name} (${ctx.from.username}) started the bot`,
        )
      }

      // await ctx.reply(
      //   'Выбери действие',
      //   Markup.keyboard([['Продолжить']]).resize(),
      // )

      ctx
        .reply('...', Markup.removeKeyboard())
        .then((msg) => ctx.deleteMessage(msg.message_id))
        .catch(console.error)

      await ctx.sendPhoto(
        { source: createReadStream('assets/welcome.jpg') },
        {
          caption: `<b>${this.i18n.t('telegraf.telegram.welcome.greeting', {
            args: { name: ctx.from.first_name },
            lang: ctx.from.language_code,
          })}</b>
${this.i18n.t('telegraf.telegram.welcome.message1', {
  lang: ctx.from.language_code,
})}
${this.i18n.t('telegraf.telegram.welcome.message2', {
  lang: ctx.from.language_code,
})}

${this.i18n.t('telegraf.telegram.welcome.buyStars', {
  lang: ctx.from.language_code,
})}`,
          parse_mode: 'HTML',
          reply_markup: {
            remove_keyboard: true,
            inline_keyboard: [
              [
                {
                  ...Markup.button.webApp(
                    'VPN&GAMES',
                    this.configService.get<string>('WEBAPP_URL'),
                  ),
                  // @ts-ignore
                  style: 'success',
                },
              ],
              [
                Markup.button.url(
                  this.i18n.t('telegraf.telegram.button.channel', {
                    lang: ctx.from.language_code,
                  }),
                  this.configService.get<string>('CHANNEL_URL'),
                ),
                Markup.button.url(
                  this.i18n.t('telegraf.telegram.button.chatSupport', {
                    lang: ctx.from.language_code,
                  }),
                  this.configService.get<string>('CHAT_URL'),
                ),
              ],
              [
                Markup.button.url(
                  'Private support',
                  this.configService.get<string>('CHANNEL_URL') + '?direct',
                ),
              ],
              [
                {
                  ...Markup.button.url(
                    this.i18n.t('telegraf.telegram.button.buyStars', {
                      lang: ctx.from.language_code,
                    }),
                    'https://split.tg/?ref=UQAjDnbTYmkesnuG0DZv-PeMo3lY-B-K6mfArUBEEdAb4xaJ',
                  ),
                  // @ts-ignore
                  style: 'primary',
                },
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
