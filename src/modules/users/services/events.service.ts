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
  private readonly ADSGRAM_RETRY_BATCH = 200

  constructor(
    private readonly prismaService: PrismaService,
    private readonly logger: PinoLogger,
    private readonly adsgramService: AdsgramService,
    private readonly graspilService: GraspilService,
  ) {}

  @Cron(process.env.ADSGRAM_REGISTRATION_RETRY_CRON || '0 */5 * * * *')
  public async retryPendingAdsgramEvents() {
    try {
      const pending = await this.prismaService.events.findMany({
        where: {
          eventType: {
            in: [
              EventType.REGISTRATION,
              EventType.FIRST_PAYMENT,
              EventType.RELOAD_PAYMENT,
            ],
          },
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
          eventType: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
        take: this.ADSGRAM_RETRY_BATCH,
      })

      if (pending.length === 0) return

      let sentCount = 0
      for (const event of pending) {
        if (!event.recordId?.trim()) continue

        const sent = await this.trySendAdsgramEventById(event.id)
        if (sent) sentCount++
      }

      if (sentCount > 0) {
        this.logger.info({
          msg: 'Adsgram retry sent',
          processed: pending.length,
          sent: sentCount,
        })
      }
    } catch (error) {
      this.logger.error({
        msg: 'Adsgram retry failed',
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
      },
    })

    if (!event) return false

    return this.trySendAdsgramEventById(event.id)
  }

  private getAdsgramGoalType(eventType: EventType): 1 | 2 | 3 | null {
    if (eventType === EventType.REGISTRATION) return 1
    if (eventType === EventType.FIRST_PAYMENT) return 2
    if (eventType === EventType.RELOAD_PAYMENT) return 3
    return null
  }

  private async trySendAdsgramEventById(eventId: string): Promise<boolean> {
    const event = await this.prismaService.events.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        eventType: true,
        recordId: true,
        adsgramRegistrationSentAt: true,
      },
    })

    if (!event || event.adsgramRegistrationSentAt || !event.recordId?.trim()) {
      return false
    }

    const goaltype = this.getAdsgramGoalType(event.eventType as EventType)
    if (!goaltype) return false

    const sent = await this.adsgramService.sendEvent({
      recordId: event.recordId,
      goaltype,
    })
    if (!sent) return false

    const updated = await this.prismaService.events.updateMany({
      where: {
        id: eventId,
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

      const createdEvent = await this.prismaService.events.create({
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
            otherData: {
              ...parseStartParams.params,
              ...parseStartParams.none,
            },
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
        await this.trySendAdsgramEventById(createdEvent.id)
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
