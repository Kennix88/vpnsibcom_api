import { PrismaService } from '@core/prisma/prisma.service'
import { Injectable } from '@nestjs/common'
import { parseStartParamUtil } from '@shared/utils/parse-start-param.util'
import { PinoLogger } from 'nestjs-pino'
import { EventType } from '../types/event-type.enum'
import { EventsService } from './events.service'

@Injectable()
export class AcquisitionsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly logger: PinoLogger,
    private readonly eventsService: EventsService,
  ) {}

  public async updateAcquisition({
    userId,
    startParams,
    referralKey,
  }: {
    userId: string
    startParams?: string
    referralKey?: string
  }) {
    try {
      const hasInputData = Boolean(startParams || referralKey)

      const parseStartParams = parseStartParamUtil(startParams ?? '')
      const hasOtherData =
        Object.keys(parseStartParams.params).length > 0 ||
        parseStartParams.none.length > 0

      const registrationEventPatch = {
        ...(parseStartParams.params.source && {
          source: parseStartParams.params.source,
        }),
        ...(referralKey && { referralId: referralKey }),
        ...(startParams && { startParams }),
        ...(parseStartParams.params.compaing && {
          compaingId: parseStartParams.params.compaing,
        }),
        ...(parseStartParams.params.record && {
          recordId: parseStartParams.params.record,
        }),
        // [БАГ #6] Единый формат none[]: храним массив в поле none, а не спредом
        // с числовыми ключами ({ 0: "value" }).
        ...(hasOtherData && {
          otherData: {
            ...parseStartParams.params,
            ...(parseStartParams.none.length > 0 && {
              none: parseStartParams.none,
            }),
          },
        }),
      }

      const user = await this.prismaService.users.findUnique({
        where: { id: userId },
        select: { acquisitionId: true, acquisition: true },
      })

      if (!user) return

      // ── Self-heal: создаём Acquisition для старых пользователей без него ──
      // [БАГ #2] Конкурентные запросы могли создавать дублирующие Acquisition.
      // Защищаем через SELECT FOR UPDATE внутри транзакции: только один
      // из параллельных запросов пройдёт ветку создания, остальные прочитают
      // уже записанный acquisition из БД и выйдут без повторного создания.
      if (!user.acquisition?.id) {
        const acquisition = await this.prismaService.$transaction(
          async (tx) => {
            // Блокируем строку пользователя на время транзакции
            await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`

            // Перечитываем после блокировки — возможно, параллельный запрос уже создал
            const fresh = await tx.users.findUnique({
              where: { id: userId },
              select: { acquisitionId: true, acquisition: true },
            })

            if (fresh?.acquisition?.id) {
              return fresh.acquisition
            }

            // Создаём acquisition и привязываем атомарно
            const created = await tx.acquisition.create({
              data: {
                firstAt: new Date(),
                lastAt: new Date(),
                ...(parseStartParams.params.source && {
                  firstSource: parseStartParams.params.source,
                  lastSource: parseStartParams.params.source,
                }),
                ...(referralKey && {
                  firstReferralId: referralKey,
                  lastReferralId: referralKey,
                }),
                ...(startParams && {
                  firstStartParams: startParams,
                  lastStartParams: startParams,
                }),
                ...(parseStartParams.params.compaing && {
                  firstCompaingId: parseStartParams.params.compaing,
                  lastCompaingId: parseStartParams.params.compaing,
                }),
                ...(parseStartParams.params.record && {
                  firstRecordId: parseStartParams.params.record,
                  lastRecordId: parseStartParams.params.record,
                }),
                // [БАГ #6] Единый формат none[]
                ...(hasOtherData && {
                  firstOtherData: {
                    ...parseStartParams.params,
                    ...(parseStartParams.none.length > 0 && {
                      none: parseStartParams.none,
                    }),
                  },
                  lastOtherData: {
                    ...parseStartParams.params,
                    ...(parseStartParams.none.length > 0 && {
                      none: parseStartParams.none,
                    }),
                  },
                }),
              },
            })

            await tx.users.update({
              where: { id: userId },
              data: { acquisitionId: created.id },
            })

            return created
          },
        )

        if (hasInputData) {
          const updatedRegistrationEvent =
            await this.prismaService.events.updateMany({
              where: {
                userId,
                eventType: EventType.REGISTRATION,
                OR: [
                  { startParams: null },
                  { startParams: '' },
                  { source: null },
                  { source: '' },
                  { recordId: null },
                  { recordId: '' },
                  { compaingId: null },
                  { compaingId: '' },
                ],
              },
              data: registrationEventPatch,
            })

          if (updatedRegistrationEvent.count > 0) {
            await this.eventsService.trySendAdsgramRegistrationByUserId(userId)
          }
        }

        return
      }

      if (!hasInputData) return

      await this.prismaService.acquisition.update({
        where: { id: user.acquisition.id },
        data: {
          ...(parseStartParams.params.source &&
            !user.acquisition.firstSource && {
              firstSource: parseStartParams.params.source,
            }),
          ...(parseStartParams.params.source && {
            lastSource: parseStartParams.params.source,
          }),
          ...(referralKey &&
            !user.acquisition.firstReferralId && {
              firstReferralId: referralKey,
            }),
          ...(referralKey && { lastReferralId: referralKey }),
          ...(startParams &&
            !user.acquisition.firstStartParams && {
              firstStartParams: startParams,
            }),
          ...(startParams && { lastStartParams: startParams }),
          ...(parseStartParams.params.compaing &&
            !user.acquisition.firstCompaingId && {
              firstCompaingId: parseStartParams.params.compaing,
            }),
          ...(parseStartParams.params.compaing && {
            lastCompaingId: parseStartParams.params.compaing,
          }),
          ...(parseStartParams.params.record &&
            !user.acquisition.firstRecordId && {
              firstRecordId: parseStartParams.params.record,
            }),
          ...(parseStartParams.params.record && {
            lastRecordId: parseStartParams.params.record,
          }),
          // [БАГ #6] Единый формат none[]
          ...(hasOtherData &&
            !user.acquisition.firstOtherData && {
              firstOtherData: {
                ...parseStartParams.params,
                ...(parseStartParams.none.length > 0 && {
                  none: parseStartParams.none,
                }),
              },
            }),
          ...(hasOtherData && {
            lastOtherData: {
              ...parseStartParams.params,
              ...(parseStartParams.none.length > 0 && {
                none: parseStartParams.none,
              }),
            },
          }),
        },
      })

      const updatedRegistrationEvent =
        await this.prismaService.events.updateMany({
          where: {
            userId,
            eventType: EventType.REGISTRATION,
            OR: [
              { startParams: null },
              { startParams: '' },
              { source: null },
              { source: '' },
              { recordId: null },
              { recordId: '' },
              { compaingId: null },
              { compaingId: '' },
            ],
          },
          data: registrationEventPatch,
        })

      if (updatedRegistrationEvent.count > 0) {
        await this.eventsService.trySendAdsgramRegistrationByUserId(userId)
      }
    } catch (error) {
      this.logger.error(error)
    }
  }
}
