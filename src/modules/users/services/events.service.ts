import { PrismaService } from '@core/prisma/prisma.service'
import { AdsgramService } from '@modules/ads/services/adsgram.service'
import { GraspilService } from '@modules/ads/services/graspil.service'
import { Injectable } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { parseStartParamUtil } from '@shared/utils/parse-start-param.util'
import { PinoLogger } from 'nestjs-pino'
import { EventType } from '../types/event-type.enum'

// Маппинг типов событий на ID целей в Graspil.
const GRASPIL_TARGET_ID: Partial<Record<EventType, number>> = {
  [EventType.REGISTRATION]: 10806,
  [EventType.ACTIVATION]: 10809,
  [EventType.FIRST_PAYMENT]: 10807,
  [EventType.RELOAD_PAYMENT]: 10808,
  [EventType.REACTIVATION]: 10831,
  [EventType.WEEK_SUB]: 10832,
}

// Фиксированные суммы в звёздах для событий без реальной оплаты
const GRASPIL_FIXED_STARS: Partial<Record<EventType, number>> = {
  [EventType.REGISTRATION]: 1,
  [EventType.ACTIVATION]: 10,
  [EventType.REACTIVATION]: 1,
  [EventType.WEEK_SUB]: 50,
}

// Типы целей в Adsgram. REACTIVATION намеренно переиспользует
// Registration-цель — отдельной цели для реактивации в Adsgram нет.
enum AdsgramGoalType {
  Registration = 1,
  Payment = 2,
  Reload = 3,
}

const ADSGRAM_GOAL_BY_EVENT: Partial<Record<EventType, AdsgramGoalType>> = {
  [EventType.REGISTRATION]: AdsgramGoalType.Registration,
  [EventType.FIRST_PAYMENT]: AdsgramGoalType.Payment,
  [EventType.RELOAD_PAYMENT]: AdsgramGoalType.Reload,
  [EventType.REACTIVATION]: AdsgramGoalType.Registration,
}

// Минимальные данные события, необходимые для отправки в Adsgram.
type AdsgramSendableEvent = {
  id: string
  eventType: EventType
  recordId: string
}

@Injectable()
export class EventsService {
  private readonly ADSGRAM_RETRY_BATCH = 200
  private readonly ADSGRAM_RETRY_CONCURRENCY = 20

  constructor(
    private readonly prismaService: PrismaService,
    private readonly logger: PinoLogger,
    private readonly adsgramService: AdsgramService,
    private readonly graspilService: GraspilService,
  ) {}

  @Cron(process.env.ADSGRAM_REGISTRATION_RETRY_CRON || '0 */5 * * * *')
  public async retryPendingAdsgramEvents(): Promise<void> {
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
          source: { equals: 'adsgram', mode: 'insensitive' },
          recordId: { not: null },
        },
        select: { id: true, recordId: true, eventType: true },
        orderBy: { createdAt: 'asc' },
        take: this.ADSGRAM_RETRY_BATCH,
      })

      if (pending.length === 0) return

      const sendable = pending.filter(
        (e): e is typeof e & { recordId: string } =>
          Boolean(e.recordId?.trim()),
      )

      let sentCount = 0
      // Ограниченный параллелизм вместо полностью последовательной отправки —
      // ускоряет прогон батча, не заваливая внешний API.
      for (
        let i = 0;
        i < sendable.length;
        i += this.ADSGRAM_RETRY_CONCURRENCY
      ) {
        const chunk = sendable.slice(i, i + this.ADSGRAM_RETRY_CONCURRENCY)
        const results = await Promise.all(
          chunk.map((event) =>
            this.sendAdsgramEvent({
              id: event.id,
              eventType: event.eventType as EventType,
              recordId: event.recordId,
            }),
          ),
        )
        sentCount += results.filter(Boolean).length
      }

      this.logger.info({
        msg: 'Adsgram retry sent',
        processed: pending.length,
        sent: sentCount,
      })
    } catch (error) {
      this.logger.error({ msg: 'Adsgram retry failed', error })
    }
  }

  public async trySendAdsgramRegistrationByUserId(
    userId: string,
  ): Promise<boolean> {
    const event = await this.prismaService.events.findFirst({
      where: {
        userId,
        eventType: EventType.REGISTRATION,
        adsgramRegistrationSentAt: null,
        source: { equals: 'adsgram', mode: 'insensitive' },
        recordId: { not: null },
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, eventType: true, recordId: true },
    })

    if (!event?.recordId?.trim()) return false

    return this.sendAdsgramEvent({
      id: event.id,
      eventType: event.eventType as EventType,
      recordId: event.recordId,
    })
  }

  public async trySendAdsgramEventById(eventId: string): Promise<boolean> {
    // Условие "ещё не отправлено" вынесено в WHERE, а не проверяется постфактум —
    // сужает окно гонки между конкурентными вызовами.
    const event = await this.prismaService.events.findFirst({
      where: {
        id: eventId,
        adsgramRegistrationSentAt: null,
        recordId: { not: null },
      },
      select: { id: true, eventType: true, recordId: true },
    })

    if (!event?.recordId?.trim()) return false

    return this.sendAdsgramEvent({
      id: event.id,
      eventType: event.eventType as EventType,
      recordId: event.recordId,
    })
  }

  // Единая точка отправки события в Adsgram + атомарная простановка
  // adsgramRegistrationSentAt. Не делает собственный fetch — вызывающий код
  // уже должен был получить event из БД, чтобы не читать одну и ту же строку дважды.
  private async sendAdsgramEvent(
    event: AdsgramSendableEvent,
  ): Promise<boolean> {
    const goaltype = ADSGRAM_GOAL_BY_EVENT[event.eventType]
    if (!goaltype) return false

    const sent = await this.adsgramService.sendEvent({
      recordId: event.recordId,
      goaltype,
    })
    if (!sent) return false

    // Guard в WHERE — гарантирует, что «выигрывает» только один конкурентный вызов,
    // даже если оба уже успели дернуть внешний API.
    const updated = await this.prismaService.events.updateMany({
      where: { id: event.id, adsgramRegistrationSentAt: null },
      data: { adsgramRegistrationSentAt: new Date() },
    })

    return updated.count > 0
  }

  public async createEvent({
    userId,
    eventType,
    amountStars = 0,
  }: {
    userId: string
    eventType: EventType
    amountStars?: number
  }): Promise<void> {
    try {
      if (
        eventType === EventType.ACTIVATION ||
        eventType === EventType.FIRST_PAYMENT ||
        eventType === EventType.REGISTRATION
      ) {
        const existing = await this.prismaService.events.findFirst({
          where: { userId, eventType },
          select: { id: true },
        })
        if (existing) return
      }

      const user = await this.prismaService.users.findUnique({
        where: { id: userId },
        include: { acquisition: true },
      })

      if (!user) {
        this.logger.warn({
          msg: 'createEvent: user not found',
          userId,
          eventType,
        })
        return
      }

      const startParams =
        user.acquisition?.firstStartParams ||
        user.acquisition?.lastStartParams ||
        ''
      const referralKey =
        user.acquisition?.firstReferralId ||
        user.acquisition?.lastReferralId ||
        ''

      const parseStartParams = parseStartParamUtil(startParams)
      const hasOtherData =
        Object.keys(parseStartParams.params).length > 0 ||
        parseStartParams.none.length > 0

      const createdEvent = await this.prismaService.events.create({
        data: {
          userId,
          eventType,
          amountStars,
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
          // [БАГ #6] Единый формат none[]: храним как поле `none`,
          // а не спредим с числовыми ключами.
          ...(hasOtherData && {
            otherData: {
              ...parseStartParams.params,
              ...(parseStartParams.none.length > 0 && {
                none: parseStartParams.none,
              }),
            },
          }),
        },
        select: { id: true },
      })

      const source = parseStartParams.params.source
      const isAdsgramEligible =
        source?.toLocaleLowerCase() === 'adsgram' &&
        Boolean(parseStartParams.params.record) &&
        (eventType === EventType.REGISTRATION ||
          eventType === EventType.FIRST_PAYMENT ||
          eventType === EventType.RELOAD_PAYMENT ||
          eventType === EventType.REACTIVATION)

      if (isAdsgramEligible) {
        await this.trySendAdsgramEventById(createdEvent.id)
      } else if (source) {
        this.logger.debug({
          msg: 'Adsgram conversion condition not met',
          userId,
          eventType,
          source,
          hasRecord: Boolean(parseStartParams.params.record),
        })
      }

      await this.trySendGraspilEvent({
        tgid: Number(user.telegramId),
        eventType,
        amountStars,
      })
    } catch (error) {
      this.logger.error({ msg: 'createEvent failed', userId, eventType, error })
    }
  }

  private async trySendGraspilEvent({
    tgid,
    eventType,
    amountStars,
  }: {
    tgid: number
    eventType: EventType
    amountStars: number
  }): Promise<void> {
    const targetId = GRASPIL_TARGET_ID[eventType]
    if (!targetId) {
      this.logger.debug({
        msg: 'Graspil: no targetId configured for eventType, skipping',
        eventType,
      })
      return
    }

    const stars =
      eventType === EventType.RELOAD_PAYMENT ||
      eventType === EventType.FIRST_PAYMENT
        ? amountStars
        : GRASPIL_FIXED_STARS[eventType] ?? 0

    const sent = await this.graspilService.sendEvent({
      tgid,
      amountStars: stars,
      targetId,
    })

    if (!sent) {
      this.logger.warn({
        msg: 'Graspil event not sent',
        tgid,
        eventType,
        targetId,
        amountStars: stars,
      })
    }
  }
}
