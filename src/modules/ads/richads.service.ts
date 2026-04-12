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

  @Cron('11 * * * *')
  public async fakeAdsSend() {
    if (this.fakeInProgress) return
    this.fakeInProgress = true

    try {
      const batchSize = 500 // Define your batch size here
      let skip = 0
      let users: any[] = [] // Initialize users as an empty array

      const settings = await this.prisma.settings.findFirst({
        where: {
          key: DefaultEnum.DEFAULT,
        },
      })

      if (!settings || !settings.isActiveFakeAds) return
      const now = new Date()
      const lastFakeAdsSend = new Date(settings.lastFakeAdsSend)
      if (
        lastFakeAdsSend.getTime() <
        now.getTime() - settings.nextFakeAdsHours * 60 * 60 * 1000
      )
        return

      // Fetch users in batches
      do {
        users = await this.prisma.users.findMany({
          include: {
            telegramData: true,
          },
          skip: skip,
          take: batchSize,
        })

        const shuffledUsers = await this.secureShuffle(users)

        const widgets = ['387042', null]
        const getWidgets = widgets[Math.floor(Math.random() * widgets.length)]

        for (const user of shuffledUsers) {
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

          const delay = Math.random() * 1000

          await this.sleep(delay)
        }

        skip += batchSize
      } while (users.length === batchSize) // Continue as long as the last batch was full
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
