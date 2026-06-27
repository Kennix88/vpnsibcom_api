import { Prisma } from '@core/prisma/generated/browser'
import {
  Plans,
  SubscriptionExtensions,
  Subscriptions,
  XrayInbounds,
} from '@core/prisma/generated/client'
import {
  DefaultEnum,
  SubscriptionExtensionsEnum,
  UserRoleEnum,
} from '@core/prisma/generated/enums'
import { PrismaService } from '@core/prisma/prisma.service'
import { RedisService } from '@core/redis/redis.service'
import { PlansEnum } from '@modules/plans/types/plans.enum'
import { EventsService } from '@modules/users/services/events.service'
import { UsersService } from '@modules/users/services/users.service'
import { EventType } from '@modules/users/types/event-type.enum'
import { Injectable, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Cron, CronExpression } from '@nestjs/schedule'
import { SubscriptionPeriodEnum } from '@shared/enums/subscription-period.enum'
import { TrafficResetEnum } from '@shared/enums/traffic-reset.enum'
import { genToken } from '@shared/utils/gen-token.util'
import axios from 'axios'
import { randomBytes } from 'crypto'
import { addDays, addHours, isAfter } from 'date-fns'
import { PinoLogger } from 'nestjs-pino'
import { InjectBot } from 'nestjs-telegraf'
import { Telegraf } from 'telegraf'
import { UserCreate } from '../types/marzban.types'
import { XrayInboundTypeEnum } from '../types/xray-inbound-type.enum'
import { MarzbanService } from './marzban.service'

// ─── Types ────────────────────────────────────────────────────────────────────

export enum SubscriptionExtensionsWithConditionsTypeEnum {
  ROLE = 'ROLE',
  SUB = 'SUB',
}

export interface SubscriptionExtensionsWithConditionsInterface {
  key: UserRoleEnum | SubscriptionExtensionsEnum
  type: SubscriptionExtensionsWithConditionsTypeEnum
  days: number
  devicesCount: number
  trafficLimitGb: number
  isUnlimitTraffic: boolean
  conditionMet: boolean
  isPremiumServers: boolean
  isNoAds: boolean
  isRoleChat: boolean
}

export interface NewEraSubWithTmaInterface {
  isActive: boolean
  isUnlimitTraffic: boolean
  dataLimit?: number
  usedTraffic?: number
  devicesCount: number
  lifeTimeUsedTraffic: number
  happCryptoUrl?: string
  days: number
  expiredAt?: Date
  onlineAt?: Date
  devices: DevicesInterface[]
}

export interface DevicesInterface {
  id: string
  model?: string
  os?: string
  happVersion: string
  happCryptoUrl: string
}

export interface NewEraSubData {
  days: number
  devicesCount: number
  trafficLimitGb: number
  isUnlimitTraffic: boolean
  isPremiumServers: boolean
  isNoAds: boolean
  isRoleChat: boolean
}

// ─── Result monad ─────────────────────────────────────────────────────────────

type Ok<T> = { success: true; data: T }
type Err = { success: false; message: string }
type Result<T> = Ok<T> | Err

function ok<T>(data: T): Ok<T> {
  return { success: true, data }
}
function err(message: string): Err {
  return { success: false, message }
}
function isErr<T>(r: Result<T>): r is Err {
  return !r.success
}

// ─── User type ────────────────────────────────────────────────────────────────

type UserWithRelations = NonNullable<
  Awaited<ReturnType<NewEraService['findUser']>>
>

enum typeSendTelegramEnum {
  CREATE,
  RENEWING,
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class NewEraService implements OnModuleInit {
  private readonly serviceName = 'NewEraService'

  /** Сколько подписок на удаление обрабатываем параллельно за раз в кроне очистки */
  private readonly REMOVAL_CONCURRENCY = 5
  private readonly CHECK_CHANNEL_CHAT_CONCURRENCY = 5
  private readonly SUBSCRIPTIONS_UPDATE_BATCH_SIZE = 50

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly userService: UsersService,
    private readonly logger: PinoLogger,
    private readonly redis: RedisService,
    private readonly marzbanService: MarzbanService,
    @InjectBot() private readonly bot: Telegraf,
    private readonly eventsService: EventsService,
  ) {}

  async onModuleInit() {
    void this.removalSubscriptions().catch((error) => {
      this.logger.error('Ошибка в NewEraService onModuleInit', error)
    })
    void this.checkEntryChannelAndChat().catch((error) => {
      this.logger.error('Ошибка в NewEraService onModuleInit', error)
    })
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async findUser(userId: string) {
    return this.prismaService.users.findFirst({
      where: { id: userId },
      include: {
        telegramData: true,
        role: true,
        acquisition: true,
        subscriptions: {
          where: { planKey: PlansEnum.NEW_ERA },
          include: { devices: true },
        },
      },
    })
  }

  private generateMarzbanUsername(telegramId: string | number): string {
    const suffix = randomBytes(6).toString('hex')
    return `${telegramId}_${suffix}`
  }

  private buildMarzbanUserPayload(
    username: string,
    inbounds: XrayInbounds[],
    subData: NewEraSubData,
    user: UserWithRelations,
  ): UserCreate {
    const hasType = (type: XrayInboundTypeEnum) =>
      inbounds.some((el) => el.type === type)
    const tagsByType = (type: XrayInboundTypeEnum) =>
      inbounds.filter((el) => el.type === type).map((el) => el.inboundTag)

    const isVless = hasType(XrayInboundTypeEnum.VLESS)
    const isTrojan = hasType(XrayInboundTypeEnum.TROJAN)
    const isSS = hasType(XrayInboundTypeEnum.SHADOWSOCKS)
    const hasAnyProxy = isVless || isTrojan || isSS

    return {
      username,
      status: 'active',
      ...(hasAnyProxy && {
        proxies: {
          ...(isVless && { vless: { flow: 'xtls-rprx-vision' } }),
          ...(isTrojan && { trojan: {} }),
          ...(isSS && { shadowsocks: {} }),
        },
        inbounds: {
          ...(isVless && { vless: tagsByType(XrayInboundTypeEnum.VLESS) }),
          ...(isTrojan && { trojan: tagsByType(XrayInboundTypeEnum.TROJAN) }),
          ...(isSS && {
            shadowsocks: tagsByType(XrayInboundTypeEnum.SHADOWSOCKS),
          }),
        },
      }),
      ...(!subData.isUnlimitTraffic && {
        data_limit_reset_strategy: 'day',
        data_limit: subData.trafficLimitGb * 1024 ** 3,
      }),
      note: [
        'NEW_ERA',
        user.id,
        user.telegramId,
        user.telegramData?.username ?? '',
        user.telegramData?.firstName ?? '',
        user.telegramData?.lastName ?? '',
        user.telegramData?.languageCode ?? '',
      ].join('/'),
    }
  }

  private async fetchHappCryptoUrl(token: string): Promise<string | null> {
    const baseUrl =
      this.configService.getOrThrow('APPLICATION_URL') +
      `/new-era/happ/${token}`

    try {
      const { data } = await axios.post<{ encrypted_link: string }>(
        'https://crypto.happ.su/api-v2.php',
        { url: baseUrl },
        { timeout: 5_000 },
      )

      if (!data?.encrypted_link) {
        this.logger.warn({
          msg: 'crypto.happ.su вернул пустой encrypted_link',
          service: this.serviceName,
        })
        return null
      }

      return data.encrypted_link
    } catch (error) {
      this.logger.error({
        msg: 'Не удалось получить happCryptoUrl',
        error,
        service: this.serviceName,
      })
      return null
    }
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Перегрузка для случаев, когда user ещё не загружен.
   * Предпочитайте calculateNewEraSubData(user) там, где user уже есть.
   */
  public async createNewEraSubByUserId(
    userId: string,
  ): Promise<Result<Subscriptions>> {
    this.logger.info({
      msg: `Создание NEW_ERA подписки для userID: ${userId}`,
      service: this.serviceName,
    })

    try {
      const [user, plan, inbounds] = await Promise.all([
        this.findUser(userId),
        this.prismaService.plans.findUnique({
          where: { key: PlansEnum.NEW_ERA },
        }),
        this.prismaService.xrayInbounds.findMany(),
      ])

      if (!user) return err('Пользователь не найден')
      if (!plan) return err(`План ${PlansEnum.NEW_ERA} не найден`)

      const subDataResult = await this.calculateNewEraSubData(user)
      if (isErr(subDataResult)) return subDataResult

      const subData = subDataResult.data
      const username = this.generateMarzbanUsername(user.telegramId)
      const token = genToken()

      // ── Внешние вызовы до транзакции ─────────────────────────────────────
      // Оба HTTP-запроса выполняются параллельно и вне транзакции,
      // чтобы не удерживать DB-соединение на время сетевых задержек.
      const [marzbanUser, happCryptoUrl] = await Promise.all([
        this.marzbanService.addUser(
          this.buildMarzbanUserPayload(username, inbounds, subData, user),
        ),
        this.fetchHappCryptoUrl(token),
      ])

      if (!marzbanUser) {
        return err(
          `Не удалось создать пользователя в Marzban для userID: ${userId}`,
        )
      }

      // ── БД-транзакция ─────────────────────────────────────────────────────
      let subscription: Subscriptions
      try {
        subscription = await this.prismaService.$transaction(async (tx) => {
          return tx.subscriptions.create({
            data: {
              username,
              isPremium: subData.isPremiumServers,
              name: subData.isPremiumServers ? 'PREMIUM' : 'FREE',
              planKey: PlansEnum.NEW_ERA,
              isAutoRenewal: false,
              devicesCount: subData.devicesCount,
              isAllBaseServers: true,
              isAllPremiumServers: subData.isPremiumServers,
              trafficLimitGb: subData.trafficLimitGb,
              isUnlimitTraffic: subData.isUnlimitTraffic,
              trafficReset: TrafficResetEnum.DAY,
              userId: user.id,
              period: SubscriptionPeriodEnum.NEW_ERA,
              periodMultiplier: 1,
              isActive: true,
              token,
              links: marzbanUser.links,
              dataLimit: marzbanUser.data_limit / 1024 / 1024,
              usedTraffic: marzbanUser.used_traffic / 1024 / 1024,
              lifeTimeUsedTraffic: marzbanUser.used_traffic / 1024 / 1024,
              expiredAt: addDays(new Date(), subData.days),
              nextRenewalStars: null,
              marzbanData: marzbanUser as unknown as Prisma.InputJsonValue,
              happCryptoUrl,
            },
          })
        })
      } catch (txError) {
        this.logger.error({
          msg: `БД-транзакция упала; удаляем Marzban-пользователя ${username}`,
          error: txError,
          service: this.serviceName,
        })

        await this.marzbanService.removeUser(username).catch((e) =>
          this.logger.error({
            msg: `Не удалось удалить Marzban-пользователя ${username} после отката`,
            error: e,
            service: this.serviceName,
          }),
        )

        throw txError
      }

      // ── Побочные эффекты после транзакции ─────────────────────────────────
      this.eventsService
        .createEvent({ userId: user.id, eventType: EventType.ACTIVATION })
        .catch((e) =>
          this.logger.error({ msg: 'Ошибка создания события', error: e }),
        )

      this.sendSubscriptionLog(
        user,
        subscription,
        typeSendTelegramEnum.CREATE,
      ).catch((e) =>
        this.logger.error({ msg: 'Ошибка отправки Telegram-лога', error: e }),
      )

      this.logger.info({
        msg: `NEW_ERA подписка создана для userID: ${userId}`,
        subscriptionId: subscription.id,
        service: this.serviceName,
      })

      return ok(subscription)
    } catch (error) {
      return this.logAndErr(`Ошибка создания подписки`, error)
    }
  }

  public async getNewEraSubByUserId(
    userId: string,
  ): Promise<Result<NewEraSubWithTmaInterface>> {
    try {
      // Единый запрос — subData вычисляется из уже загруженного user
      const user = await this.findUser(userId)
      if (!user) return err('Пользователь не найден')

      const subDataResult = await this.calculateNewEraSubData(user)
      if (isErr(subDataResult)) return subDataResult

      const sub = user.subscriptions[0]

      if (!sub || sub.planKey !== PlansEnum.NEW_ERA) {
        return ok({
          isActive: false,
          isUnlimitTraffic: false,
          devicesCount: subDataResult.data.devicesCount,
          lifeTimeUsedTraffic: 0,
          days: subDataResult.data.days,
          devices: [],
        })
      }

      return ok(
        mapSubscriptionToTma(
          sub,
          subDataResult.data.days,
          sub.devices.map(mapDevice),
        ),
      )
    } catch (error) {
      return this.logAndErr(`Ошибка получения подписки`, error)
    }
  }

  public async renewingNewEraSubByUserId(
    userId: string,
  ): Promise<Result<NewEraSubWithTmaInterface>> {
    try {
      // Единый запрос — без повторной загрузки внутри calculateNewEraSubData
      const user = await this.findUser(userId)
      if (!user) return err('Пользователь не найден')

      const subDataResult = await this.calculateNewEraSubData(user)
      if (isErr(subDataResult)) return subDataResult

      const subData = subDataResult.data
      const sub = user.subscriptions[0]

      // Подписки нет — создаём с нуля
      if (!sub) {
        const create = await this.createNewEraSubByUserId(userId)
        if (isErr(create)) return create
        return ok(mapSubscriptionToTma(create.data, subData.days, []))
      }

      // ── Синхронизируем Marzban: статус + лимиты ───────────────────────────
      await this.marzbanService.modifyUser(sub.username, {
        status: 'active',
        ...(!subData.isUnlimitTraffic && {
          data_limit: subData.trafficLimitGb * 1024 ** 3,
          data_limit_reset_strategy: 'day',
        }),
        ...(subData.isUnlimitTraffic && {
          data_limit: 0,
        }),
      })

      const updated = await this.prismaService.subscriptions.update({
        where: { id: sub.id },
        data: {
          isPremium: subData.isPremiumServers,
          name: subData.isPremiumServers ? 'PREMIUM' : 'FREE',
          devicesCount: subData.devicesCount,
          isAllBaseServers: true,
          isAllPremiumServers: subData.isPremiumServers,
          trafficLimitGb: subData.trafficLimitGb,
          isUnlimitTraffic: subData.isUnlimitTraffic,
          isActive: true,
          expiredAt: addHours(new Date(), subData.days * 24),
        },
        include: { devices: true },
      })

      this.sendSubscriptionLog(
        user,
        updated,
        typeSendTelegramEnum.RENEWING,
      ).catch((e) =>
        this.logger.error({ msg: 'Ошибка отправки Telegram-лога', e }),
      )

      return ok(
        mapSubscriptionToTma(
          updated,
          subData.days,
          updated.devices.map(mapDevice),
        ),
      )
    } catch (error) {
      return this.logAndErr(`Ошибка продления подписки`, error)
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /** Логирует ошибку и возвращает Err-результат */
  private logAndErr(prefix: string, error: unknown): Err {
    const message = `${prefix}: ${
      error instanceof Error ? error.message : String(error)
    }`
    this.logger.error({ msg: message, service: this.serviceName })
    return err(message)
  }

  // ─── Private pure helpers (без обращений к БД) ────────────────────────────

  private buildSubscriptionExtensionsWithConditions(
    user: UserWithRelations,
    subscriptionExtensions: SubscriptionExtensions[],
  ): SubscriptionExtensionsWithConditionsInterface[] {
    const conditions = new Map<SubscriptionExtensionsEnum, boolean>([
      [
        SubscriptionExtensionsEnum.PREMIUM,
        user.premiumExpiredAt !== null &&
          isAfter(user.premiumExpiredAt, new Date()),
      ],
      [SubscriptionExtensionsEnum.CHANNEL, user.isChannel ?? false],
      [SubscriptionExtensionsEnum.CHAT, user.isChat ?? false],
      [
        SubscriptionExtensionsEnum.BIO,
        user.telegramData.bio?.includes('@vpnsibcom_bot') ?? false,
      ],
      [
        SubscriptionExtensionsEnum.NAME,
        user.telegramData.firstName?.includes('@vpnsibcom_bot') ?? false,
      ],
    ])

    return [
      {
        key: user.role.key,
        type: SubscriptionExtensionsWithConditionsTypeEnum.ROLE,
        days: user.role.days,
        devicesCount: user.role.devicesCount,
        trafficLimitGb: user.role.trafficLimitGb,
        isUnlimitTraffic: user.role.isUnlimitTraffic,
        isPremiumServers: user.role.isPremiumServers,
        isNoAds: user.role.isNoAds,
        isRoleChat: user.role.isRoleChat,
        conditionMet: true,
      },
      ...subscriptionExtensions.map((ext) => ({
        ...ext,
        type: SubscriptionExtensionsWithConditionsTypeEnum.SUB,
        conditionMet:
          conditions.get(ext.key as SubscriptionExtensionsEnum) ?? false,
      })),
    ]
  }

  private buildNewEraSubData(
    user: UserWithRelations,
    plan: Plans,
    subscriptionExtensions: SubscriptionExtensions[],
  ): NewEraSubData {
    const extensions = this.buildSubscriptionExtensionsWithConditions(
      user,
      subscriptionExtensions,
    )

    const result: NewEraSubData = {
      days: plan.days,
      devicesCount: plan.devicesCount,
      trafficLimitGb: plan.trafficLimitGb,
      isUnlimitTraffic: plan.isUnlimitTraffic,
      isPremiumServers: false,
      isNoAds: false,
      isRoleChat: false,
    }

    for (const ext of extensions) {
      if (!ext.conditionMet) continue
      result.days += ext.days
      result.devicesCount += ext.devicesCount
      result.trafficLimitGb += ext.trafficLimitGb
      result.isPremiumServers = result.isPremiumServers || ext.isPremiumServers
      result.isNoAds = result.isNoAds || ext.isNoAds
      result.isUnlimitTraffic = result.isUnlimitTraffic || ext.isUnlimitTraffic
      result.isRoleChat = result.isRoleChat || ext.isRoleChat
    }

    return result
  }

  private getConfigName(link: string): string {
    const hashIndex = link.lastIndexOf('#')
    if (hashIndex === -1) return ''

    const configNameEncoded = link.slice(hashIndex + 1)
    try {
      return decodeURIComponent(configNameEncoded)
    } catch {
      return configNameEncoded
    }
  }

  private isTelegramOnlyConfig(link: string): boolean {
    return this.getConfigName(link).toLowerCase().includes('telegram')
  }

  // ─── Public API — сигнатуры не менялись, остальные методы файла продолжают работать как раньше ──

  public async getSubscriptionExtensionsWithConditions(
    user: UserWithRelations,
  ): Promise<Result<SubscriptionExtensionsWithConditionsInterface[]>> {
    try {
      const subscriptionExtensions =
        await this.prismaService.subscriptionExtensions.findMany()

      return ok(
        this.buildSubscriptionExtensionsWithConditions(
          user,
          subscriptionExtensions,
        ),
      )
    } catch (error) {
      return this.logAndErr(`Ошибка получения расширений подписки`, error)
    }
  }

  public async getSubscriptionExtensionsWithConditionsByUserId(
    userId: string,
  ): Promise<Result<SubscriptionExtensionsWithConditionsInterface[]>> {
    const user = await this.findUser(userId)
    if (!user) return err('Пользователь не найден')
    return this.getSubscriptionExtensionsWithConditions(user)
  }

  public async calculateNewEraSubData(
    user: UserWithRelations,
  ): Promise<Result<NewEraSubData>> {
    try {
      const [plan, subscriptionExtensions] = await Promise.all([
        this.prismaService.plans.findUnique({
          where: { key: PlansEnum.NEW_ERA },
        }),
        this.prismaService.subscriptionExtensions.findMany(),
      ])

      if (!plan) return err(`План ${PlansEnum.NEW_ERA} не найден`)

      return ok(this.buildNewEraSubData(user, plan, subscriptionExtensions))
    } catch (error) {
      return this.logAndErr(`Ошибка калькуляции подписки`, error)
    }
  }

  // ─── Telegram notifications ───────────────────────────────────────────────

  private async sendSubscriptionLog(
    user: UserWithRelations,
    subscription: Subscriptions,
    type: typeSendTelegramEnum,
  ): Promise<void> {
    const title =
      type === typeSendTelegramEnum.CREATE
        ? '👍 <b>НОВАЯ NEW_ERA ПОДПИСКА СОЗДАНА</b>'
        : '🌀 <b>ПОЛЬЗОВАТЕЛЬ ПРОДЛИЛ ПОДПИСКУ NEW_ERA</b>'

    const tg = user.telegramData
    const username = tg?.username ? `@${tg.username}` : '—'
    const fullName =
      [tg?.firstName, tg?.lastName].filter(Boolean).join(' ') || '—'

    // Вспомогательная функция: заменяет пустое значение на «нет»
    const val = (v: string | null | undefined) =>
      v ? `<code>${v}</code>` : '🚫 нет'

    const acq = user.acquisition

    const text = [
      title,
      '',
      `<b>👤 Пользователь:</b> ${username} · <code>${fullName}</code>`,
      `<b>🪪 User ID:</b> <code>${subscription.userId}</code>`,
      `<b>🆔 Telegram ID:</b> <code>${user.telegramId}</code>`,
      '',
      `<b>📋 Тариф:</b> <code>${subscription.planKey}</code>  ·  <b>Имя:</b> <code>${subscription.name}</code>`,
      `<b>🔑 Username:</b> <code>${subscription.username}</code>`,
      `<b>📅 Истекает:</b> <code>${
        subscription.expiredAt?.toISOString() ?? '♾️'
      }</code>`,
      '',
      `<b>📱 Устройства:</b> <code>${subscription.devicesCount}</code>`,
      `<b>📊 Трафик:</b> <code>${
        subscription.usedTraffic ?? 0
      } MB</code> / <code>${
        subscription.trafficLimitGb
      } GB</code>  ·  всего: <code>${
        subscription.lifeTimeUsedTraffic ?? 0
      } MB</code>`,
      `<b>♾️ Безлимит:</b> ${
        subscription.isUnlimitTraffic ? '✅ да' : '🚫 нет'
      }`,
      '',
      `<b>⭐ Премиум:</b> ${subscription.isPremium ? '✅ да' : '🚫 нет'}`,
      `<b>📢 Канал:</b> ${
        user.isChannel ? '✅ да' : '🚫 нет'
      }  ·  <b>💬 Чат:</b> ${user.isChat ? '✅ да' : '🚫 нет'}`,
      `<b>Bio:</b> ${val(tg?.bio)}`,
      '',
      `<b>📎 StartParams:</b> ${val(acq?.lastStartParams)}`,
      `<b>👥 Инвайтер:</b> ${val(acq?.lastReferralId)}`,
      `<b>🌐 IP:</b> ${val(acq?.lastIp)}`,
      `<b>🖥 Platform:</b> ${val(acq?.lastTelegramPlatform)}`,
      `<b>🔍 UserAgent:</b> ${val(acq?.lastUserAgent)}`,
    ].join('\n')

    await this.bot.telegram.sendMessage(
      Number(process.env.TELEGRAM_LOG_CHAT_ID),
      text,
      {
        parse_mode: 'HTML',
        message_thread_id: Number(process.env.TELEGRAM_THREAD_ID_SUBSCRIPTIONS),
      },
    )
  }

  // ─── Кроны ──────────────────────────────────────────────────────────────────

  /** Загружает подписки-кандидаты на удаление со всем необходимым для проверки условий */
  private async findSubscriptionsForRemoval() {
    return this.prismaService.subscriptions.findMany({
      where: { deletedAt: null },
      include: {
        user: {
          include: {
            telegramData: true,
          },
        },
      },
    })
  }

  /** Решает, подлежит ли подписка удалению, согласно бизнес-правилам */
  private shouldRemoveSubscription(
    subscription: Awaited<
      ReturnType<NewEraService['findSubscriptionsForRemoval']>
    >[number],
    subscriptionRemovalAfterInactiveDays: number,
    isAfterRemovalOldSub: boolean,
  ): boolean {
    // Удаляем, если пользователь не живой в боте
    const isNotLive = !(subscription.user.telegramData?.isLive ?? false)

    // FIX: раньше формула была isAfter(now + N дней, lastStartedAt), что почти
    // всегда true независимо от N (т.к. "будущее" почти всегда позже "прошлого").
    // Теперь корректно проверяем, что с момента lastStartedAt прошло N дней.
    const isAfterDaysFromEntry = subscription.user.lastStartedAt
      ? isAfter(
          new Date(),
          addDays(
            subscription.user.lastStartedAt,
            subscriptionRemovalAfterInactiveDays,
          ),
        )
      : true

    // Удаляем все олдовые, исключаем NEW_ERA
    const isOldRemoval =
      isAfterRemovalOldSub && subscription.planKey !== PlansEnum.NEW_ERA

    // FIX: раньше формула была isAfter(now + 7 дней, createdAt), что верно
    // с первой секунды после создания подписки. Теперь проверяем, что с
    // момента создания действительно прошла неделя.
    const isNotTrafficForWeek =
      isAfter(new Date(), addDays(subscription.createdAt, 7)) &&
      subscription.lifeTimeUsedTraffic <= 0

    return (
      isNotLive || isAfterDaysFromEntry || isOldRemoval || isNotTrafficForWeek
    )
  }

  /**
   * Удаляет подписку в Marzban, а затем атомарно — саму подписку вместе со
   * всеми зависимыми сущностями: подключёнными устройствами и связями с
   * индивидуальным списком серверов (greenList).
   *
   * В схеме на этих связях стоит onDelete: Cascade, поэтому в теории БД
   * удалит их сама — но удаление делается явным и атомарным (одна
   * транзакция), чтобы не зависеть от состояния каскадов в реальной БД и
   * чтобы было однозначно видно из кода, что чистится при удалении подписки.
   */
  private async removeSubscriptionWithRelations(
    subscriptionId: string,
    username: string,
  ): Promise<boolean> {
    const isRemovedFromMarzban = await this.marzbanService.removeUser(username)
    if (!isRemovedFromMarzban) return false

    await this.prismaService.$transaction([
      this.prismaService.devices.deleteMany({
        where: { subscriptionId },
      }),
      this.prismaService.subscriptionToGreenList.deleteMany({
        where: { subscriptionId },
      }),
      this.prismaService.subscriptions.delete({
        where: { id: subscriptionId },
      }),
    ])

    return true
  }

  @Cron(CronExpression.EVERY_DAY_AT_5AM)
  private async removalSubscriptions() {
    // Крон агрессивной очистки от ненужных подписок в сервисе
    try {
      const settings = await this.prismaService.settings.findFirst({
        where: { key: DefaultEnum.DEFAULT },
      })

      if (!settings) {
        this.logger.error({
          msg: 'Настройки не найдены — крон очистки подписок пропущен',
          service: this.serviceName,
        })
        return
      }

      const subscriptions = await this.findSubscriptionsForRemoval()

      // Проверяем, настало время удалить все олдовые подписки, которые теперь не будем поддерживать
      const isAfterRemovalOldSub = settings.removeOldSubscriptionsAfter
        ? isAfter(new Date(), settings.removeOldSubscriptionsAfter)
        : false

      const candidates = subscriptions.filter((s) =>
        this.shouldRemoveSubscription(
          s,
          settings.subscriptionRemovalAfterInactiveDays,
          isAfterRemovalOldSub,
        ),
      )

      let removedCount = 0

      // Обрабатываем удаление батчами, чтобы не бить Marzban тысячами
      // последовательных запросов, но и не открывать неограниченное число
      // параллельных соединений с БД
      for (let i = 0; i < candidates.length; i += this.REMOVAL_CONCURRENCY) {
        const chunk = candidates.slice(i, i + this.REMOVAL_CONCURRENCY)

        const results = await Promise.allSettled(
          chunk.map((s) =>
            this.removeSubscriptionWithRelations(s.id, s.username),
          ),
        )

        results.forEach((result, idx) => {
          if (result.status === 'fulfilled' && result.value) {
            removedCount++
            return
          }

          if (result.status === 'rejected') {
            // FIX: раньше ошибка на одной подписке могла прервать весь крон
            // и оставить необработанными все последующие кандидаты за день
            this.logger.error({
              msg: `Ошибка удаления подписки ${chunk[idx].id} (${chunk[idx].username})`,
              error:
                result.reason instanceof Error
                  ? result.reason.message
                  : String(result.reason),
              service: this.serviceName,
            })
          }
        })
      }

      this.logger.info({
        msg: `Крон очистки подписок завершён: удалено ${removedCount} из ${candidates.length} кандидатов`,
        service: this.serviceName,
      })
    } catch (error) {
      this.logAndErr('Ошибка в кроне очистки лишних подписок', error)
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  private async rebootXrayCore() {
    await this.redis.withLock(
      'rebootXrayCoreLock',
      30,
      async () => {
        try {
          await this.marzbanService.restartCore()
        } catch (error) {
          this.logger.error({
            msg: 'Ошибка перезапуска ядра Xray',
            service: this.serviceName,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      },
      { retries: 0, retryDelayMs: 0, autoRenewIntervalSec: 0 },
    )
  }

  @Cron('0 0 */6 * * *')
  private async rebootTelegramConfig() {
    await this.redis.withLock(
      'rebootTelegramConfigLock',
      30,
      async () => {
        try {
          await this.marzbanService.revokeSubscription('telegram')
        } catch (error) {
          this.logger.error({
            msg: 'Ошибка сброса Telegram конфигов',
            service: this.serviceName,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      },
      { retries: 0, retryDelayMs: 0, autoRenewIntervalSec: 0 },
    )
  }

  @Cron('0 0 * * * *')
  private async checkEntryChannelAndChat() {
    try {
      const settings = await this.prismaService.settings.findFirst({
        where: { key: DefaultEnum.DEFAULT },
      })

      if (!settings) {
        this.logger.error({
          msg: 'Настройки не найдены — крон проверки вступления в чат и канал',
          service: this.serviceName,
        })
        return
      }

      const { chatId, channelId } = settings

      if (!chatId || !channelId) {
        this.logger.warn({
          msg: 'chatId или channelId не заданы в настройках — крон пропущен',
          service: this.serviceName,
        })
        return
      }

      const users = await this.prismaService.users.findMany({
        where: { isDeleted: false, isBanned: false },
        select: {
          id: true,
          telegramId: true,
          isChannel: true,
          isChat: true,
          premiumExpiredAt: true,
        },
      })

      const now = new Date()
      let updatedCount = 0
      let premiumGranted = 0
      let premiumRevoked = 0

      for (
        let i = 0;
        i < users.length;
        i += this.CHECK_CHANNEL_CHAT_CONCURRENCY
      ) {
        const chunk = users.slice(i, i + this.CHECK_CHANNEL_CHAT_CONCURRENCY)

        await Promise.allSettled(
          chunk.map(async (user) => {
            try {
              const telegramId = Number(user.telegramId)

              // ── Проверяем канал ──────────────────────────────────────────────
              let isChannel = false
              try {
                const channelMember = await this.bot.telegram.getChatMember(
                  Number(channelId),
                  telegramId,
                )
                isChannel = ['member', 'administrator', 'creator'].includes(
                  channelMember.status,
                )
              } catch {
                // kicked / left / пользователь не найден
              }

              // ── Проверяем чат ────────────────────────────────────────────────
              let isChat = false
              let chatMemberStatus: string | null = null
              try {
                const chatMember = await this.bot.telegram.getChatMember(
                  Number(chatId),
                  telegramId,
                )
                chatMemberStatus = chatMember.status
                isChat = ['member', 'administrator', 'creator'].includes(
                  chatMember.status,
                )
              } catch {
                // kicked / left / пользователь не найден
              }

              // ── Обновляем БД, если статус изменился ─────────────────────────
              if (isChannel !== user.isChannel || isChat !== user.isChat) {
                await this.prismaService.users.update({
                  where: { id: user.id },
                  data: { isChannel, isChat },
                })
                updatedCount++
              }

              // ── Управляем Premium-тегом в чате ──────────────────────────────
              if (!isChat || chatMemberStatus === 'creator') return

              const hasPremium =
                user.premiumExpiredAt !== null &&
                isAfter(user.premiumExpiredAt, now)

              try {
                await (this.bot.telegram as any).callApi(
                  'setChatAdministratorCustomTitle',
                  {
                    chat_id: Number(chatId),
                    user_id: telegramId,
                    custom_title: hasPremium ? 'Premium' : '',
                  },
                )

                if (hasPremium) premiumGranted++
                else premiumRevoked++
              } catch (error) {
                // Пользователь мог выйти между проверкой и установкой тега
                this.logger.warn({
                  msg: `Не удалось установить тег для telegramId=${user.telegramId}`,
                  error: error instanceof Error ? error.message : String(error),
                  service: this.serviceName,
                })
              }
            } catch (error) {
              this.logger.error({
                msg: `Ошибка обработки пользователя telegramId=${user.telegramId}`,
                error: error instanceof Error ? error.message : String(error),
                service: this.serviceName,
              })
            }
          }),
        )
      }

      this.logger.info({
        msg: [
          `Крон проверки канала/чата завершён:`,
          `всего=${users.length}`,
          `обновлено в БД=${updatedCount}`,
          `Premium выдан=${premiumGranted}`,
          `Premium снят=${premiumRevoked}`,
        ].join(' | '),
        service: this.serviceName,
      })
    } catch (error) {
      this.logAndErr('Ошибка в кроне проверки вступления в чат и канал', error)
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async subscriptionsUpdater() {
    await this.redis.withLock(
      'subscriptionsUpdaterLock',
      70,
      async () => {
        this.logger.info({
          msg: 'Starting subscriptions update process',
          service: this.serviceName,
        })

        try {
          // Settings, план и extensions общие для всех подписок —
          // забираем один раз за прогон, а не на каждую запись
          const [
            settings,
            plan,
            subscriptionExtensions,
            marzbanUsers,
            subscriptions,
          ] = await Promise.all([
            this.prismaService.settings.findFirst({
              where: { key: DefaultEnum.DEFAULT },
            }),
            this.prismaService.plans.findUnique({
              where: { key: PlansEnum.NEW_ERA },
            }),
            this.prismaService.subscriptionExtensions.findMany(),
            this.marzbanService.getUsers(),
            this.prismaService.subscriptions.findMany({
              where: {
                planKey: PlansEnum.NEW_ERA,
                deletedAt: null, // по аналогии с findSubscriptionsForRemoval — проверь, что это соответствует твоей логике удаления
              },
              include: {
                user: {
                  include: {
                    telegramData: true,
                    role: true,
                  },
                },
                servers: {
                  include: { greenList: true },
                },
              },
            }),
          ])

          if (!settings) {
            this.logger.error({
              msg: 'Settings not found',
              service: this.serviceName,
            })
            return
          }

          if (!plan) {
            this.logger.error({
              msg: `План ${PlansEnum.NEW_ERA} не найден — крон обновления подписок пропущен`,
              service: this.serviceName,
            })
            return
          }

          const globalTelegramOnlyLinks = (
            marzbanUsers.users.find((u) => u.username === 'telegram')?.links ??
            []
          ).filter((link) => this.isTelegramOnlyConfig(link))

          // Пишем в Settings только если набор линков реально поменялся
          const storedTelegramLinks =
            (settings.telegramConfigLinks as { links?: string[] } | null)
              ?.links ?? []
          const telegramLinksChanged =
            storedTelegramLinks.length !== globalTelegramOnlyLinks.length ||
            storedTelegramLinks.some(
              (link, idx) => link !== globalTelegramOnlyLinks[idx],
            )

          if (telegramLinksChanged) {
            await this.prismaService.settings.update({
              where: { key: DefaultEnum.DEFAULT },
              data: { telegramConfigLinks: { links: globalTelegramOnlyLinks } },
            })
          }

          this.logger.info({
            msg: `Found ${subscriptions.length} subscriptions to update`,
            service: this.serviceName,
          })

          let updatedCount = 0
          let skippedCount = 0

          for (
            let i = 0;
            i < subscriptions.length;
            i += this.SUBSCRIPTIONS_UPDATE_BATCH_SIZE
          ) {
            const batch = subscriptions.slice(
              i,
              i + this.SUBSCRIPTIONS_UPDATE_BATCH_SIZE,
            )

            try {
              // Шаг 1: синхронная подготовка — без единого запроса в БД
              const prepared = batch
                .map((subscription) => {
                  const marzbanUser = marzbanUsers.users.find(
                    (u) => u.username === subscription.username,
                  )

                  if (!marzbanUser) {
                    this.logger.warn({
                      msg: `Marzban user not found for subscription ${subscription.id}`,
                      username: subscription.username,
                      service: this.serviceName,
                    })
                    return null
                  }

                  const serverCodes =
                    subscription.isAllBaseServers &&
                    subscription.isAllPremiumServers
                      ? []
                      : subscription.servers
                          ?.flatMap((server) => server.greenList.green)
                          .filter(Boolean) ?? []

                  const filteredLinks = marzbanUser.links.filter((link) => {
                    if (!serverCodes.length) return true
                    return serverCodes.some((code) => link.includes(`${code}`))
                  })

                  const subData = this.buildNewEraSubData(
                    subscription.user as UserWithRelations,
                    plan,
                    subscriptionExtensions,
                  )

                  return { subscription, marzbanUser, filteredLinks, subData }
                })
                .filter((el): el is NonNullable<typeof el> => el !== null)

              skippedCount += batch.length - prepared.length

              // Шаг 2: считаем статус по каждой подписке (тут и правится инверсия)
              const enriched = prepared.map((item) => {
                const { subscription } = item

                const isExpired =
                  subscription.expiredAt !== null &&
                  isAfter(new Date(), subscription.expiredAt)

                const hasActivePremium =
                  subscription.user.premiumExpiredAt !== null &&
                  isAfter(subscription.user.premiumExpiredAt, new Date())

                // Реально истекла и премиум не покрывает — только тут отключаем
                const isStillExpired = isExpired && !hasActivePremium

                // Если у пользователя есть премиум — подписка автоматически
                // продлевается, пока не закончится прем
                const newExpiredAt =
                  isExpired && hasActivePremium
                    ? addHours(new Date(), item.subData.days * 24)
                    : null

                return {
                  ...item,
                  isStillExpired,
                  newExpiredAt,
                  hasActivePremium,
                }
              })

              // Шаг 3: синхронизация Marzban — параллельно, с await и логом ошибок
              const modifyUserPromises = enriched.map((item) =>
                this.marzbanService
                  .modifyUser(item.subscription.username, {
                    status: item.isStillExpired ? 'disabled' : 'active',
                    ...(!item.subData.isUnlimitTraffic && {
                      data_limit: item.subData.trafficLimitGb * 1024 ** 3,
                      data_limit_reset_strategy: 'day',
                    }),
                    ...(item.subData.isUnlimitTraffic && { data_limit: 0 }),
                  })
                  .catch((e) =>
                    this.logger.error({
                      msg: `Не удалось синхронизировать Marzban-пользователя ${item.subscription.username}`,
                      error: e instanceof Error ? e.message : String(e),
                      service: this.serviceName,
                    }),
                  ),
              )

              await Promise.allSettled(modifyUserPromises)

              // Шаг 4: одна транзакция на батч обновлений в БД
              const transactionOps = enriched.map((item) => {
                const defaultAnnounce = settings.defaultAnnounce
                const announce = item.isStillExpired
                  ? `Ваша подписка закончилась, необходимо нажать кнопку "продлить" в telegram боте @vpnsibcom_bot. Telegram конфиг остается доступным для захода в бота${
                      defaultAnnounce ? `\n${defaultAnnounce}` : ''
                    }`
                  : defaultAnnounce

                const linksWithoutOwnTelegramOnly = item.filteredLinks.filter(
                  (link) => !this.isTelegramOnlyConfig(link),
                )

                const links = Array.from(
                  new Set([
                    ...linksWithoutOwnTelegramOnly,
                    ...globalTelegramOnlyLinks,
                  ]),
                )

                // Урезаем линки только если реально отключаем, а не если есть grace-период
                const linksForUpdate = item.isStillExpired
                  ? globalTelegramOnlyLinks
                  : links

                return this.prismaService.subscriptions.update({
                  where: { id: item.subscription.id },
                  data: {
                    links: linksForUpdate,
                    usedTraffic: item.marzbanUser.used_traffic / 1024 / 1024,
                    dataLimit: item.marzbanUser.data_limit / 1024 / 1024,
                    lifeTimeUsedTraffic:
                      item.marzbanUser.lifetime_used_traffic / 1024 / 1024,
                    onlineAt: item.marzbanUser.online_at
                      ? new Date(item.marzbanUser.online_at + 'Z')
                      : null,
                    marzbanData:
                      item.marzbanUser as unknown as Prisma.InputJsonValue,
                    ...(announce === undefined ? {} : { announce }),
                    ...(item.isStillExpired && { isActive: false }),
                    ...(item.newExpiredAt && { expiredAt: item.newExpiredAt }),
                    devicesCount: item.subData.devicesCount,
                    days: item.subData.days,
                    isUnlimitTraffic: item.subData.isUnlimitTraffic,
                    trafficLimitGb: item.subData.trafficLimitGb,
                    name: item.hasActivePremium ? 'PREMIUM' : 'FREE',
                    isAllPremiumServers: item.hasActivePremium,
                  },
                })
              })

              if (transactionOps.length > 0) {
                await this.prismaService.$transaction(transactionOps)
              }

              updatedCount += transactionOps.length

              this.logger.info({
                msg: `Updated batch of ${transactionOps.length} subscriptions`,
                service: this.serviceName,
              })
            } catch (batchError) {
              // Ошибка одного батча не должна обрывать обработку остальных
              this.logger.error({
                msg: `Ошибка обработки батча подписок (offset ${i})`,
                error:
                  batchError instanceof Error
                    ? batchError.message
                    : String(batchError),
                service: this.serviceName,
              })
            }
          }

          this.logger.info({
            msg: `Successfully updated ${updatedCount} subscriptions (skipped ${skippedCount})`,
            service: this.serviceName,
          })
        } catch (error) {
          this.logger.error({
            msg: 'Error updating subscriptions',
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            service: this.serviceName,
          })
        }
      },
      { retries: 2, retryDelayMs: 300, autoRenewIntervalSec: 20 },
    )
  }
}

// ─── Module-level helpers ─────────────────────────────────────────────────────

function mapDevice(el: {
  id: string
  model?: string | null
  os?: string | null
  happVersion: string
  happCryptoUrl: string
}): DevicesInterface {
  return {
    id: el.id,
    model: el.model ?? undefined,
    os: el.os ?? undefined,
    happVersion: el.happVersion,
    happCryptoUrl: el.happCryptoUrl,
  }
}

function mapSubscriptionToTma(
  subscription: {
    isActive: boolean
    isUnlimitTraffic: boolean
    devicesCount: number
    dataLimit: number | null
    usedTraffic: number | null
    lifeTimeUsedTraffic: number
    expiredAt: Date | null
    onlineAt: Date | null
  },
  days: number,
  devices: DevicesInterface[],
): NewEraSubWithTmaInterface {
  return {
    isActive: subscription.isActive,
    isUnlimitTraffic: subscription.isUnlimitTraffic,
    devicesCount: subscription.devicesCount,
    dataLimit: subscription.dataLimit ?? undefined,
    usedTraffic: subscription.usedTraffic ?? undefined,
    lifeTimeUsedTraffic: subscription.lifeTimeUsedTraffic,
    expiredAt: subscription.expiredAt ?? undefined,
    onlineAt: subscription.onlineAt ?? undefined,
    days,
    devices,
  }
}
