import { DefaultEnum } from '@core/prisma/generated/enums'
import { PrismaService } from '@core/prisma/prisma.service'
import { Injectable, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Cron } from '@nestjs/schedule'
import axios from 'axios'
import { PinoLogger } from 'nestjs-pino'
import {
  RichAdsGetAdRequestInterface,
  RichAdsGetAdResponseInterface,
} from './types/richads.interface'

@Injectable()
export class RichAdsService implements OnModuleInit {
  private pubId: string
  private baseUrl: string
  private fakeInProgress = false

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
    private readonly prisma: PrismaService,
  ) {
    this.pubId = this.configService.getOrThrow<string>('RICHADS_PUB_KEY')
    this.baseUrl = this.configService.getOrThrow<string>('RICHADS_API_URL')
  }

  async onModuleInit() {
    if (process.env.NODE_ENV === 'development') return
    this.fakeAdsSend()
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms))
  }

  private randomBetween(min: number, max: number): number {
    return min + Math.random() * (max - min)
  }

  public async getAd(
    data: Omit<RichAdsGetAdRequestInterface, 'publisher_id'>,
  ): Promise<RichAdsGetAdResponseInterface | null> {
    if (data.production === undefined) {
      data.production = process.env.NODE_ENV === 'development' ? false : true
    }
    const url = `${this.baseUrl}/telegram-mb`
    const result = await axios
      .post<RichAdsGetAdResponseInterface[]>(url, {
        publisher_id: this.pubId,
        ...data,
      })
      .then((res) => res.data)
      .catch((e) => {
        this.logger.error({
          msg: 'Error get ad',
          status: e?.response?.status,
          data: e?.response?.data,
          e,
        })
        return []
      })

    this.logger.info({
      msg: 'Get ad - result',
      resultLength: result.length,
      result,
    })

    const ad = result[0]

    this.logger.info({
      msg: 'Get ad',
      hasAd: Boolean(ad),
      resultLength: result.length,
      ad,
    })

    return (ad ?? null) as RichAdsGetAdResponseInterface
  }

  public async secureShuffle(arr) {
    const copy = [...arr]
    for (let i = copy.length - 1; i > 0; i--) {
      const rand = crypto.getRandomValues(new Uint32Array(1))[0]
      const j = rand % (i + 1)
      ;[copy[i], copy[j]] = [copy[j], copy[i]]
    }
    return copy
  }

  @Cron('*/10 * * * *')
  public async fakeAdsSend() {
    if (this.fakeInProgress) return
    this.fakeInProgress = true

    try {
      const batchSize = 500
      let skip = 0
      let usersBatch: any[] = []
      const allUsers: any[] = []

      const settings = await this.prisma.settings.findFirst({
        where: {
          key: DefaultEnum.DEFAULT,
        },
      })

      if (!settings || !settings.isActiveFakeAds) return
      const now = new Date()
      const lastFakeAdsSend = settings.lastFakeAdsSend
        ? new Date(settings.lastFakeAdsSend)
        : new Date(0)

      // Запуск примерно 1-2 раза в сутки с рандомной периодичностью.
      const minHoursBetweenRuns = Math.max(12, settings.nextFakeAdsHours ?? 12)
      const maxHoursBetweenRuns = Math.max(24, minHoursBetweenRuns)
      const nextRunInMs =
        this.randomBetween(minHoursBetweenRuns, maxHoursBetweenRuns) *
        60 *
        60 *
        1000
      if (now.getTime() - lastFakeAdsSend.getTime() < nextRunInMs) return

      await this.prisma.settings.update({
        where: { key: DefaultEnum.DEFAULT },
        data: { lastFakeAdsSend: now },
      })

      // Собираем полный список пользователей батчами, чтобы пройти по всем.
      do {
        usersBatch = await this.prisma.users.findMany({
          include: {
            telegramData: true,
          },
          where: {
            telegramData: {
              isNot: null,
            },
          },
          orderBy: {
            id: 'asc',
          },
          skip: skip,
          take: batchSize,
        })
        allUsers.push(...usersBatch)
        skip += batchSize
      } while (usersBatch.length === batchSize)

      if (allUsers.length === 0) return

      const shuffledUsers = await this.secureShuffle(allUsers)
      const widgets = ['387042', null]

      // Растягиваем один проход по пользователям примерно на 12-24 часа.
      const targetRunDurationMs = this.randomBetween(12, 24) * 60 * 60 * 1000
      const baseDelayMs = targetRunDurationMs / shuffledUsers.length

      for (const user of shuffledUsers) {
        const getWidgets = widgets[Math.floor(Math.random() * widgets.length)]

        const ad = await this.getAd({
          language_code: user.telegramData.languageCode,
          telegram_id: user.telegramId,
          ...(getWidgets !== undefined &&
            getWidgets !== null && { widget_id: getWidgets }),
          production: false,
        })

        if (ad && ad.notification_url) {
          axios.get(ad.notification_url).catch((e) => {
            this.logger.error({
              msg: `Error send ad notification`,
              e,
            })
          })
        }
        this.logger.info({
          msg: 'Fake ads send - ad',
          ad,
        })

        // Плавный случайный интервал между пользователями без "пачек".
        const jitter = this.randomBetween(0.7, 1.3)
        const delay = Math.max(1000, Math.min(baseDelayMs * jitter, 10 * 60 * 1000))
        await this.sleep(delay)
      }
    } catch (e) {
      this.logger.error({
        msg: 'Error fake ads send',
        e,
      })
    } finally {
      this.fakeInProgress = false
    }
  }
}
