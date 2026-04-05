import {
  AdsNetworkEnum,
  DefaultEnum,
  PlansEnum,
} from '@core/prisma/generated/enums'
import { PrismaService } from '@core/prisma/prisma.service'
import { AdsService } from '@modules/ads/ads.service'
import { AdsPlaceEnum } from '@modules/ads/types/ads-place.enum'
import { AdsTypeEnum } from '@modules/ads/types/ads-type.enum'
import { Injectable, OnModuleInit } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import axios from 'axios'
import { addHours } from 'date-fns'
import { PinoLogger } from 'nestjs-pino'
import { InjectBot } from 'nestjs-telegraf'
import { Telegraf } from 'telegraf'

@Injectable()
export class AdsSenderService implements OnModuleInit {
  private readonly baseSendMessageRateLimitPerSecond = 20
  private readonly minSendMessageRateLimitPerSecond = 5
  private readonly sendMessageRecoverySuccessThreshold = 100
  private readonly sendMessageRetryDelayBufferMs = 500
  private currentSendMessageRateLimitPerSecond =
    this.baseSendMessageRateLimitPerSecond
  private consecutiveSendMessageSuccessCount = 0
  private localNextSendMessageAt = 0

  constructor(
    @InjectBot() private readonly bot: Telegraf,
    private readonly logger: PinoLogger,
    private readonly prisma: PrismaService,
    private readonly adsService: AdsService,
  ) {}

  async onModuleInit() {
    this.sendAd()
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms))
  }

  private async waitForSendMessageSlot(): Promise<void> {
    const now = Date.now()
    const waitMs = Math.max(0, this.localNextSendMessageAt - now)
    this.localNextSendMessageAt =
      Math.max(this.localNextSendMessageAt, now) +
      this.getCurrentSendMessageStepMs()

    if (waitMs > 0) {
      await this.sleep(waitMs)
    }
  }

  private getCurrentSendMessageStepMs(): number {
    return Math.ceil(1000 / this.currentSendMessageRateLimitPerSecond)
  }

  private getTelegramErrorMeta(error: unknown): {
    errorCode?: number
    description?: string
    retryAfterSeconds?: number
  } {
    if (!error || typeof error !== 'object') {
      return {}
    }

    const response = 'response' in error ? error.response : undefined
    if (!response || typeof response !== 'object') {
      return {}
    }

    const errorCode =
      'error_code' in response && typeof response.error_code === 'number'
        ? response.error_code
        : undefined
    const description =
      'description' in response && typeof response.description === 'string'
        ? response.description
        : undefined
    const retryAfterSeconds =
      'parameters' in response &&
      response.parameters &&
      typeof response.parameters === 'object' &&
      'retry_after' in response.parameters &&
      typeof response.parameters.retry_after === 'number'
        ? response.parameters.retry_after
        : undefined

    return { errorCode, description, retryAfterSeconds }
  }

  private isRateLimited(error: unknown): boolean {
    const { errorCode, description } = this.getTelegramErrorMeta(error)
    const normalizedDescription = description?.toLowerCase() ?? ''

    return (
      errorCode === 429 || normalizedDescription.includes('too many requests')
    )
  }

  private async handleRateLimit(error: unknown): Promise<void> {
    const previousRate = this.currentSendMessageRateLimitPerSecond
    const { retryAfterSeconds, description } = this.getTelegramErrorMeta(error)
    const waitMs =
      Math.max(1, retryAfterSeconds ?? 1) * 1000 +
      this.sendMessageRetryDelayBufferMs

    this.currentSendMessageRateLimitPerSecond = Math.max(
      this.minSendMessageRateLimitPerSecond,
      Math.floor(this.currentSendMessageRateLimitPerSecond * 0.7),
    )
    this.consecutiveSendMessageSuccessCount = 0
    this.localNextSendMessageAt = Date.now() + waitMs

    this.logger.warn({
      msg: 'Telegram send rate limited',
      previousRatePerSecond: previousRate,
      newRatePerSecond: this.currentSendMessageRateLimitPerSecond,
      waitMs,
      retryAfterSeconds,
      description,
    })

    await this.sleep(waitMs)
  }

  private handleSendSuccess(): void {
    if (
      this.currentSendMessageRateLimitPerSecond >=
      this.baseSendMessageRateLimitPerSecond
    ) {
      this.consecutiveSendMessageSuccessCount = 0
      return
    }

    this.consecutiveSendMessageSuccessCount += 1
    if (
      this.consecutiveSendMessageSuccessCount >=
      this.sendMessageRecoverySuccessThreshold
    ) {
      this.currentSendMessageRateLimitPerSecond += 1
      this.consecutiveSendMessageSuccessCount = 0

      this.logger.info({
        msg: 'Telegram send rate recovered',
        ratePerSecond: this.currentSendMessageRateLimitPerSecond,
      })
    }
  }

  @Cron('0 * * * *')
  public async sendAd() {
    if (process.env.NODE_ENV === 'development') return
    try {
      const settings = await this.prisma.settings.findFirst({
        where: {
          key: DefaultEnum.DEFAULT,
        },
      })
      const nextAdsHours = settings?.nextAdsHours ?? 12
      const nextAdsAt = addHours(new Date(), -nextAdsHours)
      const users = await this.prisma.users.findMany({
        where: {
          telegramData: {
            is: {
              isLive: true,
            },
          },
          adsData: {
            is: {
              OR: [
                {
                  lastMessageAt: {
                    lt: nextAdsAt,
                  },
                },
                {
                  lastMessageAt: null,
                },
              ],
            },
          },
        },
        include: {
          telegramData: true,
          adsData: true,
          subscriptions: {
            where: {
              isActive: true,
              NOT: {
                planKey: PlansEnum.TRIAL,
              },
            },
          },
        },
      })

      for (const user of users) {
        const ad = await this.adsService.createAdSession({
          userId: user.id,
          telegramId: user.telegramId,
          place: AdsPlaceEnum.MESSAGE,
          type: AdsTypeEnum.MESSAGE,
        })
        this.logger.info({
          msg: `Send ad to user ${user.id}`,
          ad,
        })
        if (!ad || ad.isNoAds) continue
        if (ad.richAds) {
          await this.waitForSendMessageSlot()

          await this.bot.telegram
            .sendPhoto(user.telegramId, ad.richAds.image, {
              caption: `<b>${ad.richAds.title}</b>\n\n${
                ad.richAds.message ?? ''
              }\n\n${
                ad.richAds.brand ? `Ad by ${ad.richAds.brand}` : ''
              }\n\n#AD #Sponsor\n<code>With an active subscription, no ads are shown! / При активной подписке, реклама не показывается!</code>`,
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: ad.richAds.button
                  ? [
                      [
                        {
                          text: ad.richAds.button,
                          url: ad.richAds.link,
                          // @ts-ignore
                          style: 'success',
                        },
                      ],
                    ]
                  : [],
              },
            })
            .then((res) => {
              this.handleSendSuccess()
              this.logger.info({
                msg: `Send ad`,
                res,
              })
              this.adsService.confirmAd({
                userId: user.id,
                verifyKey: ad.ad.verifyKey,
              })
              axios.get(ad.richAds.notification_url).catch((e) => {
                this.logger.error({
                  msg: `Error send ad notification`,
                  e,
                })
              })
            })
            .catch((e) => {
              if (this.isRateLimited(e)) {
                return this.handleRateLimit(e)
              }

              this.consecutiveSendMessageSuccessCount = 0
              this.logger.error({
                msg: `Error send ad`,
                e,
              })
              this.prisma.userTelegramData.update({
                where: { id: user.telegramDataId },
                data: { isLive: false },
              })
            })
          this.prisma.userAdsData.update({
            where: {
              id: user.adsDataId,
            },
            data: {
              lastMessageAt: new Date(),
              lastMessageNetwork: AdsNetworkEnum.RICHADS,
            },
          })
        }
      }
    } catch (e) {
      this.logger.error({
        msg: `Error send ad`,
        e,
      })
    }
  }
}
