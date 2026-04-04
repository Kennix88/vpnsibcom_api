import { DefaultEnum, PlansEnum } from '@core/prisma/generated/enums'
import { PrismaService } from '@core/prisma/prisma.service'
import { RedisService } from '@core/redis/redis.service'
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
  private readonly sendMessageRateKeyPrefix = 'tg:ads-sender:send-message'
  private readonly sendMessageRateLimitPerSecond = 10
  private readonly sendMessageRateRetryDelayMs = 120
  private localNextSendMessageAt = 0

  constructor(
    @InjectBot() private readonly bot: Telegraf,
    private readonly logger: PinoLogger,
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly adsService: AdsService,
  ) {}

  async onModuleInit() {
    this.sendAd()
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms))
  }

  private async waitForSendMessageSlot(): Promise<void> {
    while (true) {
      const secondBucket = Math.floor(Date.now() / 1000)
      const key = `${this.sendMessageRateKeyPrefix}:${secondBucket}`

      try {
        const current = await this.redisService.incr(key)
        if (current === 1) {
          await this.redisService.expire(key, 2)
        }

        if (current <= this.sendMessageRateLimitPerSecond) return
      } catch (error) {
        this.logger.warn({
          msg: 'Redis rate-limit error',
          error,
        })

        const stepMs = Math.ceil(1000 / this.sendMessageRateLimitPerSecond)
        const now = Date.now()
        const waitMs = Math.max(0, this.localNextSendMessageAt - now)
        this.localNextSendMessageAt =
          Math.max(this.localNextSendMessageAt, now) + stepMs

        if (waitMs > 0) {
          await this.sleep(waitMs)
        }

        return
      }

      await this.sleep(this.sendMessageRateRetryDelayMs)
    }
  }

  @Cron('0 * * * *')
  public async sendAd() {
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
              }\n\n${ad.richAds.brand ? `Ad by ${ad.richAds.brand}` : ''}`,
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
              this.logger.error({
                msg: `Error send ad`,
                e,
              })
              this.prisma.userTelegramData.update({
                where: { id: user.telegramDataId },
                data: { isLive: false },
              })
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
