import { PrismaService } from '@core/prisma/prisma.service'
import { AdsgramService } from '@modules/ads/services/adsgram.service'
import { GraspilService } from '@modules/ads/services/graspil.service'
import { Injectable } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { parseStartParamUtil } from '@shared/utils/parse-start-param.util'
import { PinoLogger } from 'nestjs-pino'
import { EventType } from '../types/event-type.enum'

@Injectable()
export class EventsService {
  private readonly ADSGRAM_REG_RETRY_BATCH = 200

  constructor(
    private readonly prismaService: PrismaService,
    private readonly logger: PinoLogger,
    private readonly adsgramService: AdsgramService,
    private readonly graspilService: GraspilService,
  ) {}

  @Cron(process.env.ADSGRAM_REGISTRATION_RETRY_CRON || '0 */5 * * * *')
  public async retryPendingAdsgramRegistrationEvents() {
    try {
      const pending = await this.prismaService.events.findMany({
        where: {
          eventType: EventType.REGISTRATION,
          adsgramRegistrationSentAt: null,
          source: {
            equals: 'adsgram',
            mode: 'insensitive',
          },
          recordId: {
            not: null,
          },
        },
        select: {
          id: true,
          recordId: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
        take: this.ADSGRAM_REG_RETRY_BATCH,
      })

      if (pending.length === 0) return

      let sentCount = 0
      for (const event of pending) {
        if (!event.recordId?.trim()) continue

        const sent = await this.adsgramService.sendEvent({
          recordId: event.recordId,
          goaltype: 1,
        })

        if (!sent) continue

        const updated = await this.prismaService.events.updateMany({
          where: {
            id: event.id,
            adsgramRegistrationSentAt: null,
          },
          data: {
            adsgramRegistrationSentAt: new Date(),
          },
        })
        if (updated.count > 0) sentCount++
      }

      if (sentCount > 0) {
        this.logger.info({
          msg: 'Adsgram registration retry sent',
          processed: pending.length,
          sent: sentCount,
        })
      }
    } catch (error) {
      this.logger.error({
        msg: 'Adsgram registration retry failed',
        error,
      })
    }
  }

  public async trySendAdsgramRegistrationByUserId(userId: string) {
    const event = await this.prismaService.events.findFirst({
      where: {
        userId,
        eventType: EventType.REGISTRATION,
        adsgramRegistrationSentAt: null,
        source: {
          equals: 'adsgram',
          mode: 'insensitive',
        },
        recordId: {
          not: null,
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
      select: {
        id: true,
        recordId: true,
      },
    })

    if (!event?.recordId?.trim()) return false

    const sent = await this.adsgramService.sendEvent({
      recordId: event.recordId,
      goaltype: 1,
    })
    if (!sent) return false

    const updated = await this.prismaService.events.updateMany({
      where: {
        id: event.id,
        adsgramRegistrationSentAt: null,
      },
      data: {
        adsgramRegistrationSentAt: new Date(),
      },
    })

    return updated.count > 0
  }

  public async createEvent({
    userId,
    eventType,
    amountStars = 0,
    isSendGraspil = false,
  }: {
    userId: string
    eventType: EventType
    amountStars?: number
    isSendGraspil?: boolean
  }) {
    try {
      if (
        eventType == EventType.ACTIVATION ||
        eventType == EventType.FIRST_PAYMENT ||
        eventType == EventType.REGISTRATION
      ) {
        const getEvent = await this.prismaService.events.findFirst({
          where: {
            userId: userId,
            eventType: eventType,
          },
        })

        if (getEvent) return
      }

      const user = await this.prismaService.users.findUnique({
        where: {
          id: userId,
        },
        include: {
          acquisition: true,
        },
      })

      if (!user) return

      const startParams =
        user.acquisition?.firstStartParams ||
        user.acquisition?.lastStartParams ||
        ''
      const referralKey =
        user.acquisition?.firstReferralId ||
        user.acquisition?.lastReferralId ||
        ''

      const parseStartParams = parseStartParamUtil(startParams ?? '')

      await this.prismaService.events.create({
        data: {
          userId,
          eventType,
          amountStars,
          ...(parseStartParams.params.source && {
            source: parseStartParams.params.source,
          }),
          ...(referralKey && {
            referralId: referralKey,
          }),
          ...(startParams && {
            startParams: startParams,
          }),
          ...(parseStartParams.params.compaing && {
            compaingId: parseStartParams.params.compaing,
          }),
          ...(parseStartParams.params.record && {
            recordId: parseStartParams.params.record,
          }),
          ...((Object.keys(parseStartParams.params).length > 0 ||
            parseStartParams.none.length > 0) && {
            otherData: JSON.stringify({
              ...parseStartParams.params,
              ...parseStartParams.none,
            }),
          }),
        },
      })

      if (
        parseStartParams.params.source &&
        parseStartParams.params.source.toLocaleLowerCase() == 'adsgram' &&
        parseStartParams.params.record &&
        (eventType == EventType.REGISTRATION ||
          eventType == EventType.FIRST_PAYMENT ||
          eventType == EventType.RELOAD_PAYMENT)
      ) {
        if (eventType === EventType.REGISTRATION) {
          await this.trySendAdsgramRegistrationByUserId(userId)
        } else {
          await this.adsgramService.sendEvent({
            recordId: parseStartParams.params.record,
            goaltype: eventType == EventType.FIRST_PAYMENT ? 2 : 3,
          })
        }
      } else if (parseStartParams.params.source) {
        this.logger.debug({
          msg: 'Adsgram conversion condition not met',
          userId,
          eventType,
          source: parseStartParams.params.source,
          hasRecord: Boolean(parseStartParams.params.record),
        })
      }

      if (
        isSendGraspil &&
        (eventType == EventType.RELOAD_PAYMENT ||
          eventType == EventType.FIRST_PAYMENT)
      ) {
        await this.graspilService.sendEvent({
          tgid: user.telegramId,
          amountStars,
        })
      }
    } catch (error) {
      this.logger.error(error)
    }
  }
}
