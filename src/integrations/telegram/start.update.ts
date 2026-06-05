import { LoggerTelegramService } from '@core/logger/logger-telegram.service'
import { DefaultEnum, TelegramPlatformEnum } from '@core/prisma/generated/enums'
import { PrismaService } from '@core/prisma/prisma.service'
import { Context } from '@integrations/telegram/types/telegrafContext.interface'
import { AdsService } from '@modules/ads/ads.service'
import { RichAdsService } from '@modules/ads/richads.service'
import { YandexAdsService } from '@modules/ads/services/yandex-ads.service'
import { TaddyService } from '@modules/ads/taddy.service'
import { TaddyOriginEnum } from '@modules/ads/types/taddy.interface'
import { TonPaymentsService } from '@modules/payments/services/ton-payments.service'
import { RatesService } from '@modules/rates/rates.service'
import { ReferralsService } from '@modules/referrals/referrals.service'
import { AcquisitionsService } from '@modules/users/services/acquisitions.service'
import { SessionsService } from '@modules/users/services/sessions.service'
import { UsersService } from '@modules/users/services/users.service'
import { SessionPlaceEnum } from '@modules/users/types/session-place.enum'
import { ConfigService } from '@nestjs/config'
import { extractReferralKey } from '@shared/utils/parse-start-param.util'
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
    private readonly taddyService: TaddyService,
    private readonly sessionsService: SessionsService,
    private readonly acquisitionsService: AcquisitionsService,
    private readonly richAdsService: RichAdsService,
    private readonly prisma: PrismaService,
    private readonly yandex: YandexAdsService,
    private readonly adsService: AdsService,
    @InjectBot() private readonly bot: Telegraf,
  ) {
    this.logger.setContext(StartUpdate.name)
  }

  @Help()
  async helpCommand(@Ctx() ctx: Context) {
    await ctx.replyWithHTML(
      `<b>Help</b>
<b>Ваш Telegram id</b>: <code>${ctx.from.id}</code>

Если у вас возникнут какие-либо трудности с оплатой, подпиской или чем-либо еще, напишите нам!

<b>Команды</b>
/start - Перезапустить бота
/help - Помощь
`,
      {
        reply_markup: {
          remove_keyboard: true,
          inline_keyboard: [
            [
              Markup.button.url(
                '🤝 Сотрудничество и Реклама',
                this.configService.get<string>('CHANNEL_URL') + '?direct',
              ),
            ],
            [
              Markup.button.url(
                '📢 Канал',
                this.configService.get<string>('CHANNEL_URL'),
              ),
              Markup.button.url(
                '💬 Чат и Поддержка',
                this.configService.get<string>('CHAT_URL'),
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

      const loaderMsgId = await ctx
        .replyWithSticker(
          'CAACAgIAAxkBAAEWPfRppTYBRM_NLOTANCMU-jcXRl5IwAACW1wBAAFji0YMrLK2QXamXBs6BA',
          Markup.removeKeyboard(),
        )
        .then((msg) => msg.message_id)
        .catch(console.error)

      let startParam = ctx.startPayload

      // Fallback: если startPayload не установлен (из-за @On('message')),
      // извлекаем параметр из текста сообщения
      // @ts-ignore
      const messageText = ctx.message?.text
      if (!startParam && messageText) {
        const match = messageText.match(/^\/start\s+(.+)$/i)
        if (match) {
          startParam = match[1]
        }
      }

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

      await this.taddyService.startEvent({
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

      const isTelegramPartner = /^_tgr_[\w-]+$/.test(startParam ?? '')
      const referralKey = extractReferralKey(startParam ?? '')

      this.logger.info({
        msg: `Start command`,
        telegramId: ctx.from.id,
        startParam,
        isTelegramPartner,
        referralKey,
        // ctx,
      })

      let user = await this.userService.getUserByTgId(ctx.from.id.toString())

      if (!user) {
        user = await this.userService.createUser({
          telegramId: ctx.from.id.toString(),
          referralKey: referralKey,
          userInBotData: ctx.from,
          isTelegramPartner,
          startParam,
          ...(birth && { birth }),
        })
      }

      if (!user) {
        throw new Error('User was not created or loaded')
      }

      await this.sessionsService.createSession({
        userId: user.id,
        place: SessionPlaceEnum.BOT,
        ...(referralKey && {
          referralKey,
        }),
        startParams: startParam,
        telegramPlatform: TelegramPlatformEnum.BOT,
      })

      await this.acquisitionsService.updateAcquisition({
        userId: user.id,
        startParams: startParam,
        ...(referralKey && {
          referralKey,
        }),
      })

      if (ctx.from.id == this.configService.get<number>('TELEGRAM_ADMIN_ID')) {
        this.telegramLogger.info(
          `Admin ${ctx.from.first_name} ${ctx.from.last_name} (${ctx.from.username}) started the bot`,
        )
      }

      // await ctx.reply(
      //   'Выбери действие',
      //   Markup.keyboard([['Продолжить']]).resize(),
      // )

      const settings = await this.prisma.settings.findFirst({
        where: {
          key: DefaultEnum.DEFAULT,
        },
      })

      await ctx.sendPhoto(
        { source: createReadStream('assets/welcome.jpg') },
        {
          caption: `<b>${this.i18n.t('telegraf.telegram.welcome.message1', {
            lang: ctx.from.language_code,
          })}

Бесплатный, быстрый и безопасный VPN для всех!
Оставайся всегда на связи и получай доступ к интернету с VPNsib!</b>
`,
          parse_mode: 'HTML',
          reply_markup: {
            remove_keyboard: true,
            inline_keyboard: [
              [
                {
                  ...Markup.button.webApp(
                    '🛡️ Подключить VPN бесплатно',
                    this.configService.get<string>('WEBAPP_URL') +
                      '?gs_source=start_msg',
                  ),
                  // @ts-ignore
                  style: 'success',
                },
              ],
              [
                {
                  ...Markup.button.url(
                    '📰 Заказать рекламу через Taddy',
                    'https://taddy.pro/vpnsibcom_bot',
                  ),
                  // @ts-ignore
                  style: 'danger',
                },
              ],
              [
                Markup.button.url(
                  '🤝 Сотрудничество и Реклама',
                  this.configService.get<string>('CHANNEL_URL') + '?direct',
                ),
              ],
              [
                Markup.button.url(
                  '📢 Канал',
                  this.configService.get<string>('CHANNEL_URL'),
                ),
                Markup.button.url(
                  '💬 Чат и Поддержка',
                  this.configService.get<string>('CHAT_URL'),
                ),
              ],
            ],
          },
        },
      )

      if (loaderMsgId) await ctx.deleteMessage(loaderMsgId).catch(console.error)

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
