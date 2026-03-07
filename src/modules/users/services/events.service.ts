import { PrismaService } from '@core/prisma/prisma.service'
import { AdsgramService } from '@modules/ads/services/adsgram.service'
import { GraspilService } from '@modules/ads/services/graspil.service'
import { Injectable } from '@nestjs/common'
import { parseStartParamUtil } from '@shared/utils/parse-start-param.util'
import { PinoLogger } from 'nestjs-pino'
import { EventType } from '../types/event-type.enum'

@Injectable()
export class EventsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly logger: PinoLogger,
    private readonly adsgramService: AdsgramService,
    private readonly graspilService: GraspilService,
  ) {}

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

      const startParams = user.acquisition.firstStartParams || ''
      const referralKey = user.acquisition.lastReferralId || ''

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
            referralKey: referralKey,
          }),
          ...(startParams && {
            startParam: startParams,
          }),
          ...(parseStartParams.params.comaping && {
            comapingId: parseStartParams.params.comaping,
          }),
          ...(parseStartParams.params.record && {
            recordId: parseStartParams.params.record,
          }),
          ...(parseStartParams.params ||
            (parseStartParams.none && {
              otherData: JSON.stringify({
                ...parseStartParams.params,
                ...parseStartParams.none,
              }),
            })),
        },
      })

      if (
        parseStartParams.params.source &&
        parseStartParams.params.source.toLocaleLowerCase() == 'adsgram' &&
        parseStartParams.params.record &&
        eventType !== EventType.ACTIVATION
      ) {
        this.adsgramService.sendEvent({
          recordId: parseStartParams.params.record,
          goaltype:
            eventType == EventType.REGISTRATION
              ? 1
              : eventType == EventType.FIRST_PAYMENT
              ? 2
              : 3,
        })
      }

      if (
        isSendGraspil &&
        (eventType == EventType.RELOAD_PAYMENT ||
          eventType == EventType.FIRST_PAYMENT)
      ) {
        this.graspilService.sendEvent({
          tgid: user.telegramId,
          amountStars,
        })
      }
    } catch (error) {
      this.logger.error(error)
    }
  }
}
