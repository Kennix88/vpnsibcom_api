import {
  DefaultSubData,
  ExternalSquad,
  InternalSquads,
  SubscriptionExtensions,
  Subscriptions,
} from '@core/prisma/generated/client'
import {
  DefaultEnum,
  ExternalSquadEnum,
  InternalSquadsEnum,
  SubscriptionExtensionsEnum,
  UserRoleEnum,
} from '@core/prisma/generated/enums'
import { PrismaService } from '@core/prisma/prisma.service'
import { RedisService } from '@core/redis/redis.service'
import { EventsService } from '@modules/users/services/events.service'
import { UsersService } from '@modules/users/services/users.service'
import { EventType } from '@modules/users/types/event-type.enum'
import { Injectable, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Cron, CronExpression } from '@nestjs/schedule'
import axios from 'axios'
import { randomBytes } from 'crypto'
import { addDays, isAfter } from 'date-fns'
import { PinoLogger } from 'nestjs-pino'
import { InjectBot } from 'nestjs-telegraf'
import { Telegraf } from 'telegraf'
import { RemnaService } from '../remna/remna.service'
import {
  CreateRemnaUserDto,
  RemnaHwidDevice,
  RemnaTrafficLimitStrategy,
  RemnaUser,
  RemnaUserStatus,
} from '../remna/remna.types'

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
  isAutoRenewing: boolean
  roleName?: string
}

export interface NewEraSubWithTmaInterface {
  isNoSub: boolean
  status: RemnaUserStatus
  isUnlimitTraffic: boolean
  dataLimitBytes?: number
  devicesLimit: number
  usedTrafficBytes: number
  lifetimeUsedTrafficBytes: number
  subscriptionUrl?: string
  happCryptoUrl?: string
  days: number
  expiredAt?: Date
  onlineAt?: Date
  devices: HwidDevice[]
  isAutoRenewing: boolean
}

export interface HwidDevice {
  hwid: string
  platform: string | null
  osVersion: string | null
  deviceModel: string | null
}

export interface NewEraSubData {
  days: number
  devicesCount: number
  trafficLimitGb: number
  isUnlimitTraffic: boolean
  isPremiumServers: boolean
  isNoAds: boolean
  isRoleChat: boolean
  isAutoRenewing: boolean
  roleName?: string
}

interface ActiveSquads {
  internal: string[]
  external: string
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

  private readonly REMOVAL_CONCURRENCY = 5
  private readonly CHECK_CHANNEL_CHAT_CONCURRENCY = 5
  private readonly SUBSCRIPTIONS_UPDATE_BATCH_SIZE = 10

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly userService: UsersService,
    private readonly remnaService: RemnaService,
    private readonly logger: PinoLogger,
    private readonly redis: RedisService,
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

  private async findUser(userId: string) {
    return this.prismaService.users.findFirst({
      where: { id: userId },
      include: {
        telegramData: true,
        role: true,
        acquisition: true,
        subscription: true,
      },
    })
  }

  private generateRemnaUsername(telegramId: string | number): string {
    const suffix = randomBytes(6).toString('hex')
    const devTag =
      this.configService.get('NODE_ENV') === 'development' ? 'dev_' : ''
    return `vpnsib_${devTag}${telegramId}_${suffix}`
  }

  private resolveActiveSquads(
    subData: NewEraSubData,
    internalSquads: InternalSquads[],
    externalSquads: ExternalSquad[],
  ): ActiveSquads {
    const internal = internalSquads
      .filter(
        (el) =>
          el.key !== InternalSquadsEnum.PREMIUM || subData.isPremiumServers,
      )
      .map((el) => el.uuid)

    const externalSquad = externalSquads.find(
      (el) => el.key === ExternalSquadEnum.RU_ROUTING_FRAGMENT,
    )

    if (!externalSquad) {
      throw new Error(
        `External squad "${ExternalSquadEnum.RU_ROUTING_FRAGMENT}" не найден`,
      )
    }

    return { internal, external: externalSquad.uuid }
  }

  private buildRemnaTag(roleKey: string): string {
    const devTag =
      this.configService.get('NODE_ENV') === 'development' ? 'DEV_' : ''
    return devTag + roleKey.toUpperCase()
  }

  private buildRemnaUserPayload(
    username: string,
    subData: NewEraSubData,
    user: UserWithRelations,
    internalSquads: InternalSquads[],
    externalSquads: ExternalSquad[],
  ): CreateRemnaUserDto {
    const { internal, external } = this.resolveActiveSquads(
      subData,
      internalSquads,
      externalSquads,
    )

    return {
      username,
      ...(subData.isUnlimitTraffic
        ? {
            trafficLimitStrategy: 'NO_RESET' as RemnaTrafficLimitStrategy,
            trafficLimitBytes: 0,
          }
        : {
            trafficLimitStrategy: 'DAY' as RemnaTrafficLimitStrategy,
            trafficLimitBytes: subData.trafficLimitGb * 1024 ** 3,
          }),
      telegramId: Number(user.telegramId),
      tag: this.buildRemnaTag(user.role.key),
      hwidDeviceLimit: subData.devicesCount,
      expireAt: addDays(new Date(), subData.days).toISOString(),
      activeInternalSquads: internal,
      externalSquadUuid: external,
      description: [
        user.id,
        user.telegramId,
        user.telegramData?.username ?? '',
        user.telegramData?.firstName ?? '',
        user.telegramData?.lastName ?? '',
        user.telegramData?.languageCode ?? '',
      ].join('/'),
    }
  }

  private async fetchHappCryptoUrl(shortUuid: string): Promise<string | null> {
    try {
      const url = this.configService.getOrThrow('SUB_DOMAIN') + `/${shortUuid}`
      const { data } = await axios.post<{ encrypted_link: string }>(
        'https://crypto.happ.su/api-v2.php',
        { url: url },
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

  private async buildNewEraSub(
    user: UserWithRelations,
    preFetchedDevices?: RemnaHwidDevice[],
  ): Promise<Result<NewEraSubWithTmaInterface>> {
    const subDataResult = await this.calculateNewEraSubData(user)
    if (isErr(subDataResult)) return subDataResult

    const sub = user.subscription
    if (!sub) {
      return ok({
        isNoSub: true,
        status: 'DISABLED',
        devicesLimit: subDataResult.data.devicesCount,
        isUnlimitTraffic: subDataResult.data.isUnlimitTraffic,
        dataLimitBytes: subDataResult.data.isUnlimitTraffic
          ? undefined
          : subDataResult.data.trafficLimitGb * 1024 ** 3,
        usedTrafficBytes: 0,
        lifetimeUsedTrafficBytes: 0,
        days: subDataResult.data.days,
        isAutoRenewing: false,
        devices: [],
      })
    }

    const [remnaUser, devices] = await Promise.all([
      this.remnaService.getUserByUuid(sub.uuid),
      preFetchedDevices
        ? Promise.resolve(preFetchedDevices)
        : this.remnaService
            .getUserHwidDevices(sub.uuid)
            .then((res) => res.devices),
    ])

    return ok(this.mapSubscriptionToTma(remnaUser, subDataResult.data, devices))
  }

  public async deleteDevice(
    userId: string,
    hwid: string,
  ): Promise<Result<NewEraSubWithTmaInterface>> {
    try {
      const user = await this.findUser(userId)
      if (!user) return err('Пользователь не найден')
      if (!user.subscription) return err('Нет подписки!')

      const deleteResult = await this.remnaService.deleteUserHwidDevice({
        userUuid: user.subscription.uuid,
        hwid,
      })

      return await this.buildNewEraSub(user, deleteResult.devices)
    } catch (error) {
      return this.logAndErr(`Ошибка удаления устройства пользователя`, error)
    }
  }

  public async createNewEraSubByUserId(
    userId: string,
  ): Promise<Result<RemnaUser>> {
    const lockResult = await this.redis.withLock(
      `newEraSub:mutate:${userId}`,
      30,
      () => this.createNewEraSubByUserIdUnsafe(userId),
      { retries: 0 },
    )

    if (lockResult === null) {
      return err(
        `Создание подписки для userID: ${userId} уже выполняется, повторный вызов отклонён`,
      )
    }

    return lockResult
  }

  private async createNewEraSubByUserIdUnsafe(
    userId: string,
  ): Promise<Result<RemnaUser>> {
    this.logger.info({
      msg: `Создание NEW_ERA подписки для userID: ${userId}`,
      service: this.serviceName,
    })

    try {
      const [user, internalSquads, externalSquads] = await Promise.all([
        this.findUser(userId),
        this.prismaService.internalSquads.findMany(),
        this.prismaService.externalSquad.findMany(),
      ])

      if (!user) return err('Пользователь не найден')

      if (user.subscription) {
        return err(
          `У пользователя ${userId} уже есть подписка (subscriptionId: ${user.subscription.id}); используйте renewingNewEraSubByUserId`,
        )
      }

      const subDataResult = await this.calculateNewEraSubData(user)
      if (isErr(subDataResult)) return subDataResult

      const subData = subDataResult.data
      const username = this.generateRemnaUsername(user.telegramId)
      const shortUuid = randomBytes(8).toString('hex')

      const [remnaUser, happCryptoUrl] = await Promise.all([
        this.remnaService.createUser(
          this.buildRemnaUserPayload(
            username,
            subData,
            user,
            internalSquads,
            externalSquads,
          ),
        ),
        this.fetchHappCryptoUrl(shortUuid),
      ])

      if (!remnaUser) {
        return err(
          `Не удалось создать пользователя в Remna для userID: ${userId}`,
        )
      }

      let subscription: Subscriptions
      try {
        const url =
          this.configService.getOrThrow('SUB_DOMAIN') + `/${shortUuid}`
        subscription = await this.prismaService.$transaction(async (tx) => {
          const sub = await tx.subscriptions.create({
            data: {
              username,
              uuid: remnaUser.uuid,
              happCryptoUrl,
              shortUuid,
              subscriptionUrl: url,
            },
          })

          await tx.users.update({
            where: { id: userId },
            data: { subscriptionId: sub.id },
          })

          return sub
        })
      } catch (txError) {
        this.logger.error({
          msg: `БД-транзакция упала; удаляем Remna-пользователя ${remnaUser.uuid}`,
          error: txError,
          service: this.serviceName,
        })

        await this.remnaService.deleteUser(remnaUser.uuid).catch((e) =>
          this.logger.error({
            msg: `Не удалось удалить Remna-пользователя ${remnaUser.uuid} после отката`,
            error: e,
            service: this.serviceName,
          }),
        )

        throw txError
      }

      this.eventsService
        .createEvent({ userId: user.id, eventType: EventType.ACTIVATION })
        .catch((e) =>
          this.logger.error({ msg: 'Ошибка создания события', error: e }),
        )

      this.sendSubscriptionLog(
        user,
        remnaUser,
        subData,
        typeSendTelegramEnum.CREATE,
        [],
      ).catch((e) =>
        this.logger.error({ msg: 'Ошибка отправки Telegram-лога', error: e }),
      )

      this.logger.info({
        msg: `NEW_ERA подписка создана для userID: ${userId}`,
        subscriptionId: subscription.id,
        service: this.serviceName,
      })

      return ok(remnaUser)
    } catch (error) {
      return this.logAndErr(`Ошибка создания подписки`, error)
    }
  }

  public async getNewEraSubByUserId(
    userId: string,
  ): Promise<Result<NewEraSubWithTmaInterface>> {
    try {
      const user = await this.findUser(userId)
      if (!user) return err('Пользователь не найден')
      return await this.buildNewEraSub(user)
    } catch (error) {
      return this.logAndErr(`Ошибка получения подписки`, error)
    }
  }

  public async renewingNewEraSubByUserId(
    userId: string,
  ): Promise<Result<NewEraSubWithTmaInterface>> {
    const lockResult = await this.redis.withLock(
      `newEraSub:mutate:${userId}`,
      30,
      () => this.renewingNewEraSubByUserIdUnsafe(userId),
      { retries: 2, retryDelayMs: 300 },
    )

    if (lockResult === null) {
      return err(
        `Не удалось получить блокировку продления подписки для userID: ${userId}`,
      )
    }

    return lockResult
  }

  private async renewingNewEraSubByUserIdUnsafe(
    userId: string,
  ): Promise<Result<NewEraSubWithTmaInterface>> {
    try {
      const [user, internalSquads, externalSquads] = await Promise.all([
        this.findUser(userId),
        this.prismaService.internalSquads.findMany(),
        this.prismaService.externalSquad.findMany(),
      ])
      if (!user) return err('Пользователь не найден')

      const subDataResult = await this.calculateNewEraSubData(user)
      if (isErr(subDataResult)) return subDataResult

      const subData = subDataResult.data
      const sub = user.subscription

      if (!sub) {
        const create = await this.createNewEraSubByUserIdUnsafe(userId)
        if (isErr(create)) return create
        return ok(this.mapSubscriptionToTma(create.data, subData, []))
      }

      const { internal, external } = this.resolveActiveSquads(
        subData,
        internalSquads,
        externalSquads,
      )

      const [remnaUser, happCryptoUrl, devices] = await Promise.all([
        this.remnaService.updateUser({
          uuid: sub.uuid,
          status: 'ACTIVE',
          ...(subData.isUnlimitTraffic
            ? {
                trafficLimitStrategy: 'NO_RESET' as RemnaTrafficLimitStrategy,
                trafficLimitBytes: 0,
              }
            : {
                trafficLimitStrategy: 'DAY' as RemnaTrafficLimitStrategy,
                trafficLimitBytes: subData.trafficLimitGb * 1024 ** 3,
              }),
          hwidDeviceLimit: subData.devicesCount,
          tag: this.buildRemnaTag(user.role.key),
          expireAt: addDays(new Date(), subData.days).toISOString(),
          activeInternalSquads: internal,
          externalSquadUuid: external,
        }),
        this.fetchHappCryptoUrl(sub.shortUuid),
        this.remnaService.getUserHwidDevices(sub.uuid),
      ])

      if (!remnaUser) {
        return err(
          `Не удалось создать пользователя в Remna для userID: ${userId}`,
        )
      }

      const url =
        this.configService.getOrThrow('SUB_DOMAIN') + `/${remnaUser.shortUuid}`

      await this.prismaService.subscriptions.update({
        where: { id: sub.id },
        data: {
          uuid: remnaUser.uuid,
          happCryptoUrl,
          shortUuid: remnaUser.shortUuid,
          subscriptionUrl: url,
        },
      })

      const enforcedDevices = await this.enforceHwidDeviceLimit(
        sub.uuid,
        subData.devicesCount,
        devices.devices,
      )

      this.sendSubscriptionLog(
        user,
        remnaUser,
        subData,
        typeSendTelegramEnum.RENEWING,
        enforcedDevices,
      ).catch((e) =>
        this.logger.error({ msg: 'Ошибка отправки Telegram-лога', error: e }),
      )

      return ok(this.mapSubscriptionToTma(remnaUser, subData, enforcedDevices))
    } catch (error) {
      return this.logAndErr(`Ошибка продления подписки`, error)
    }
  }

  private logAndErr(prefix: string, error: unknown): Err {
    const message = `${prefix}: ${
      error instanceof Error ? error.message : String(error)
    }`
    this.logger.error({ msg: message, service: this.serviceName })
    return err(message)
  }

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
        isAutoRenewing:
          user.premiumExpiredAt !== null &&
          isAfter(user.premiumExpiredAt, new Date()),
        roleName: user.role.roleName,
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
    defaultSubData: DefaultSubData,
    subscriptionExtensions: SubscriptionExtensions[],
  ): NewEraSubData {
    const extensions = this.buildSubscriptionExtensionsWithConditions(
      user,
      subscriptionExtensions,
    )

    const result: NewEraSubData = {
      days: defaultSubData.days,
      devicesCount: defaultSubData.devicesCount,
      trafficLimitGb: defaultSubData.trafficLimitGb,
      isUnlimitTraffic: defaultSubData.isUnlimitTraffic,
      isPremiumServers: false,
      isNoAds: false,
      isRoleChat: false,
      isAutoRenewing: false,
      roleName: undefined,
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
      result.isAutoRenewing = result.isAutoRenewing || ext.isAutoRenewing
      result.roleName = result.roleName || ext.roleName
    }

    return result
  }

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
      const [defaultSubData, subscriptionExtensions] = await Promise.all([
        this.prismaService.defaultSubData.findUnique({
          where: { key: DefaultEnum.DEFAULT },
        }),
        this.prismaService.subscriptionExtensions.findMany(),
      ])

      if (!defaultSubData) return err(`Не найдены дефолтные данные`)

      return ok(
        this.buildNewEraSubData(user, defaultSubData, subscriptionExtensions),
      )
    } catch (error) {
      return this.logAndErr(`Ошибка калькуляции подписки`, error)
    }
  }

  private async sendSubscriptionLog(
    user: UserWithRelations,
    remnaUser: RemnaUser,
    subData: NewEraSubData,
    type: typeSendTelegramEnum,
    devices: RemnaHwidDevice[] = [],
  ): Promise<void> {
    const title =
      type === typeSendTelegramEnum.CREATE
        ? '👍 <b>НОВАЯ NEW_ERA ПОДПИСКА СОЗДАНА</b>'
        : '🌀 <b>ПОЛЬЗОВАТЕЛЬ ПРОДЛИЛ ПОДПИСКУ NEW_ERA</b>'

    const tg = user.telegramData
    const username = tg?.username ? `@${tg.username}` : '—'
    const fullName =
      [tg?.firstName, tg?.lastName].filter(Boolean).join(' ') || '—'
    const premium =
      user.premiumExpiredAt !== null &&
      isAfter(user.premiumExpiredAt, new Date())
        ? '✅ да'
        : '🚫 нет'
    const userTraffic = remnaUser.userTraffic.usedTrafficBytes / 1024 ** 3
    const lifeTimeUsedTraffic =
      remnaUser.userTraffic.lifetimeUsedTrafficBytes / 1024 ** 3

    const traffic = subData.isUnlimitTraffic
      ? `♾️  ·  всего: <code>${lifeTimeUsedTraffic} GB</code>`
      : `<code>${userTraffic.toFixed(2)}</code>/<code>${
          subData.trafficLimitGb
        }</code> GB  ·  всего: <code>${lifeTimeUsedTraffic.toFixed(
          2,
        )} GB</code>`

    const val = (v: string | null | undefined) =>
      v ? `<code>${v}</code>` : '🚫 нет'

    const acq = user.acquisition

    const text = [
      title,
      '',
      `<b>👤 Пользователь:</b> ${username} · <code>${fullName}</code>`,
      `<b>🪪 User ID:</b> <code>${user.id}</code>`,
      `<b>🆔 Telegram ID:</b> <code>${user.telegramId}</code>`,
      '',
      `<b>🔑 Username:</b> <code>${remnaUser.username}</code>`,
      `<b>📅 Истекает:</b> <code>${remnaUser.expireAt ?? '♾️'}</code>`,
      `<b>📅 Онлайн:</b> <code>${
        remnaUser.userTraffic.onlineAt ?? '🚫'
      }</code>`,
      '',
      `<b>📱 Устройства:</b> <code>${devices.length}</code>/<code>${remnaUser.hwidDeviceLimit}</code>`,
      `<b>📊 Трафик:</b> ${traffic}`,
      '',
      `<b>⭐ Премиум sub:</b> ${premium}`,
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

  private async findSubscriptionsForRemoval() {
    return this.prismaService.subscriptions.findMany({
      include: {
        user: {
          include: {
            telegramData: true,
            role: true,
          },
        },
      },
    })
  }

  private async shouldRemoveSubscription(
    subscription: Awaited<
      ReturnType<NewEraService['findSubscriptionsForRemoval']>
    >[number],
    subscriptionRemovalAfterInactiveDays: number,
  ): Promise<boolean> {
    const isPremium =
      subscription.user.premiumExpiredAt !== null &&
      isAfter(subscription.user.premiumExpiredAt, new Date())
    const isRole =
      subscription.user.role.key === UserRoleEnum.SUPER_ADMIN ||
      subscription.user.role.key === UserRoleEnum.ADMIN ||
      subscription.user.role.key === UserRoleEnum.SUPPORT ||
      subscription.user.role.key === UserRoleEnum.FRIEND

    if (isPremium || isRole) return false

    const isNotLive = !(subscription.user.telegramData?.isLive ?? false)

    const isAfterDaysFromEntry = subscription.user.lastStartedAt
      ? isAfter(
          new Date(),
          addDays(
            subscription.user.lastStartedAt,
            subscriptionRemovalAfterInactiveDays,
          ),
        )
      : true

    if (isNotLive || isAfterDaysFromEntry) return true

    if (!isAfter(new Date(), addDays(subscription.createdAt, 7))) return false

    try {
      const remnaUser = await this.remnaService.getUserByUuid(subscription.uuid)
      return remnaUser.userTraffic.lifetimeUsedTrafficBytes <= 0
    } catch (error) {
      this.logger.warn({
        msg: `Не удалось проверить трафик подписки ${subscription.id} в Remna, пропускаем`,
        error: error instanceof Error ? error.message : String(error),
        service: this.serviceName,
      })
      return false
    }
  }

  private async removeSubscriptionWithRelations(
    subscriptionId: string,
    uuid: string,
  ): Promise<boolean> {
    const isRemovedFromMarzban = await this.remnaService.deleteUser(uuid)
    if (!isRemovedFromMarzban) return false

    await this.prismaService.$transaction([
      this.prismaService.users.updateMany({
        where: { subscriptionId },
        data: { subscriptionId: null },
      }),
      this.prismaService.subscriptions.delete({
        where: { id: subscriptionId },
      }),
    ])

    return true
  }

  @Cron(CronExpression.EVERY_DAY_AT_5AM)
  private async removalSubscriptions() {
    try {
      const subscriptions = await this.findSubscriptionsForRemoval()

      const removalFlags = await Promise.all(
        subscriptions.map((s) => this.shouldRemoveSubscription(s, 30)),
      )
      const candidates = subscriptions.filter((_, idx) => removalFlags[idx])

      let removedCount = 0

      for (let i = 0; i < candidates.length; i += this.REMOVAL_CONCURRENCY) {
        const chunk = candidates.slice(i, i + this.REMOVAL_CONCURRENCY)

        const results = await Promise.allSettled(
          chunk.map((s) => this.removeSubscriptionWithRelations(s.id, s.uuid)),
        )

        results.forEach((result, idx) => {
          if (result.status === 'fulfilled' && result.value) {
            removedCount++
            return
          }

          if (result.status === 'rejected') {
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
        msg: `Крон очистки подписок завершён: удалено ${removedCount} из ${candidates.length} кандидатов (всего проверено ${subscriptions.length})`,
        service: this.serviceName,
      })
    } catch (error) {
      this.logAndErr('Ошибка в кроне очистки лишних подписок', error)
    }
  }

  /**
   * Проверяет членство пользователя в канале/чате через Telegram Bot API.
   * Вынесено в отдельный метод, чтобы не дублировать одну и ту же логику
   * между массовым кроном checkEntryChannelAndChat и точечной проверкой
   * "по кнопке" из checkSubscriptionTasksByUserId ниже.
   */
  private async checkUserChannelAndChatMembership(
    telegramId: string | number,
    channelId: string | number,
    chatId: string | number,
  ): Promise<{
    isChannel: boolean
    isChat: boolean
    chatMemberStatus: string | null
  }> {
    const tgId = Number(telegramId)

    let isChannel = false
    try {
      const channelMember = await this.bot.telegram.getChatMember(
        channelId,
        tgId,
      )
      isChannel = ['member', 'administrator', 'creator'].includes(
        channelMember.status,
      )
    } catch {
      // kicked / left / пользователь не найден
    }

    let isChat = false
    let chatMemberStatus: string | null = null
    try {
      const chatMember = await this.bot.telegram.getChatMember(chatId, tgId)
      chatMemberStatus = chatMember.status
      isChat = ['member', 'administrator', 'creator'].includes(
        chatMember.status,
      )
    } catch {
      // kicked / left / пользователь не найден
    }

    return { isChannel, isChat, chatMemberStatus }
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
        include: {
          telegramData: true,
          role: true,
          acquisition: true,
          subscription: true,
        },
      })

      const [defaultSubData, subscriptionExtensions] = await Promise.all([
        this.prismaService.defaultSubData.findUnique({
          where: { key: DefaultEnum.DEFAULT },
        }),
        this.prismaService.subscriptionExtensions.findMany(),
      ])

      let updatedCount = 0
      let roleGranted = 0
      let roleRevoked = 0

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

              const { isChannel, isChat, chatMemberStatus } =
                await this.checkUserChannelAndChatMembership(
                  telegramId,
                  channelId,
                  chatId,
                )

              if (isChannel !== user.isChannel || isChat !== user.isChat) {
                await this.prismaService.users.update({
                  where: { id: user.id },
                  data: { isChannel, isChat },
                })
                updatedCount++
              }

              if (!isChat || chatMemberStatus === 'creator') return

              try {
                if (!defaultSubData) return
                const subData = this.buildNewEraSubData(
                  user,
                  defaultSubData,
                  subscriptionExtensions,
                )

                const rawTag = subData.isRoleChat ? subData.roleName ?? '' : ''
                // защита от превышения лимита и эмодзи, раз API это не простит
                const safeTag = this.sanitizeTag(rawTag)

                await (this.bot.telegram as any).callApi('setChatMemberTag', {
                  chat_id: Number(chatId),
                  user_id: telegramId,
                  tag: safeTag,
                })

                if (subData.isRoleChat) roleGranted++
                else roleRevoked++
              } catch (error) {
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
          `Роль выдана=${roleGranted}`,
          `Роль снята=${roleRevoked}`,
        ].join(' | '),
        service: this.serviceName,
      })
    } catch (error) {
      this.logAndErr('Ошибка в кроне проверки вступления в чат и канал', error)
    }
  }

  private sanitizeTag(tag: string): string {
    // убираем эмодзи и всё, что не текст/цифры/пробелы/базовая пунктуация
    const noEmoji = tag.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    return noEmoji.slice(0, 16)
  }

  /**
   * Точечная проверка заданий (подписка на канал/вступление в чат) по кнопке
   * "Проверить" на фронте. В отличие от checkEntryChannelAndChat (крон по
   * всем пользователям раз в час), тут только один userId, и человек ждёт
   * ответа в TMA синхронно.
   *
   * ЗАЩИТА (от спама по кнопке): у Telegram Bot API есть свои rate limit'ы на
   * getChatMember — как по конкретному чату, так и по боту в целом. Без
   * кулдауна частые нажатия "Проверить" от одного пользователя могут не
   * только впустую грузить сервис повторными одинаковыми проверками, но и
   * подъедать общий лимит бота, задевая остальных пользователей. Короткий
   * NX-лок в Redis на userId делает повторный вызов в течение TTL явной
   * ошибкой вместо тихого дублирования запросов к Telegram.
   */
  public async checkSubscriptionTasksByUserId(
    userId: string,
  ): Promise<Result<SubscriptionExtensionsWithConditionsInterface[]>> {
    const cooldownKey = `newEraSub:checkTasks:${userId}`
    const acquired = await this.redis.setWithExpiryNx(cooldownKey, '1', 5)
    if (!acquired) {
      return err(
        `Проверка заданий для userID: ${userId} уже выполняется или недавно выполнялась, подождите`,
      )
    }

    try {
      const [user, settings] = await Promise.all([
        this.findUser(userId),
        this.prismaService.settings.findFirst({
          where: { key: DefaultEnum.DEFAULT },
        }),
      ])

      if (!user) return err('Пользователь не найден')
      if (!settings) return err('Настройки не найдены')

      const { chatId, channelId } = settings
      if (!chatId || !channelId) {
        return err('chatId или channelId не заданы в настройках')
      }

      const { isChannel, isChat, chatMemberStatus } =
        await this.checkUserChannelAndChatMembership(
          user.telegramId,
          channelId,
          chatId,
        )

      if (isChannel !== user.isChannel || isChat !== user.isChat) {
        await this.prismaService.users.update({
          where: { id: user.id },
          data: { isChannel, isChat },
        })
        user.isChannel = isChannel
        user.isChat = isChat
      }

      if (isChat && chatMemberStatus !== 'creator') {
        try {
          const subDataResult = await this.calculateNewEraSubData(user)
          if (!isErr(subDataResult)) {
            await (this.bot.telegram as any).callApi(
              'setChatAdministratorCustomTitle',
              {
                chat_id: Number(chatId),
                user_id: Number(user.telegramId),
                custom_title: subDataResult.data.isRoleChat
                  ? subDataResult.data.roleName ?? ''
                  : '',
              },
            )
          }
        } catch (error) {
          this.logger.warn({
            msg: `Не удалось установить тег для telegramId=${user.telegramId} (точечная проверка)`,
            error: error instanceof Error ? error.message : String(error),
            service: this.serviceName,
          })
        }
      }

      return this.getSubscriptionExtensionsWithConditions(user)
    } catch (error) {
      return this.logAndErr(`Ошибка проверки заданий пользователя`, error)
    }
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
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
          const [settings, subscriptions, internalSquads, externalSquads] =
            await Promise.all([
              this.prismaService.settings.findFirst({
                where: { key: DefaultEnum.DEFAULT },
              }),
              this.prismaService.subscriptions.findMany({
                include: {
                  user: {
                    include: {
                      telegramData: true,
                      role: true,
                      acquisition: true,
                      subscription: true,
                    },
                  },
                },
              }),
              this.prismaService.internalSquads.findMany(),
              this.prismaService.externalSquad.findMany(),
            ])

          if (!settings) {
            this.logger.error({
              msg: 'Settings not found',
              service: this.serviceName,
            })
            return
          }

          this.logger.info({
            msg: `Found ${subscriptions.length} subscriptions to update`,
            service: this.serviceName,
          })

          const [defaultSubData, subscriptionExtensions] = await Promise.all([
            this.prismaService.defaultSubData.findUnique({
              where: { key: DefaultEnum.DEFAULT },
            }),
            this.prismaService.subscriptionExtensions.findMany(),
          ])

          if (!defaultSubData) {
            this.logger.error({
              msg: 'Дефолтные данные подписки не найдены',
              service: this.serviceName,
            })
            return
          }

          let updatedCount = 0
          let failedCount = 0

          for (
            let i = 0;
            i < subscriptions.length;
            i += this.SUBSCRIPTIONS_UPDATE_BATCH_SIZE
          ) {
            const chunk = subscriptions.slice(
              i,
              i + this.SUBSCRIPTIONS_UPDATE_BATCH_SIZE,
            )

            const results = await Promise.allSettled(
              chunk.map(async (sub) => {
                const subData = this.buildNewEraSubData(
                  sub.user,
                  defaultSubData,
                  subscriptionExtensions,
                )

                const { internal, external } = this.resolveActiveSquads(
                  subData,
                  internalSquads,
                  externalSquads,
                )

                const isAutoRenewing = subData.isAutoRenewing

                const [remnaUser, happCryptoUrl] = await Promise.all([
                  this.remnaService.updateUser({
                    uuid: sub.uuid,
                    ...(subData.isUnlimitTraffic
                      ? {
                          trafficLimitStrategy:
                            'NO_RESET' as RemnaTrafficLimitStrategy,
                          trafficLimitBytes: 0,
                        }
                      : {
                          trafficLimitStrategy:
                            'DAY' as RemnaTrafficLimitStrategy,
                          trafficLimitBytes: subData.trafficLimitGb * 1024 ** 3,
                        }),
                    hwidDeviceLimit: subData.devicesCount,
                    tag: this.buildRemnaTag(sub.user.role.key),
                    ...(isAutoRenewing && {
                      expireAt: addDays(new Date(), subData.days).toISOString(),
                    }),
                    activeInternalSquads: internal,
                    externalSquadUuid: external,
                  }),
                  this.fetchHappCryptoUrl(sub.shortUuid),
                ])

                if (!remnaUser) {
                  throw new Error(
                    `Не удалось обновить пользователя в Remna для userID: ${sub.user.id}`,
                  )
                }

                await this.enforceHwidDeviceLimit(
                  sub.uuid,
                  subData.devicesCount,
                )

                const url =
                  this.configService.getOrThrow('SUB_DOMAIN') +
                  `/${remnaUser.shortUuid}`

                await this.prismaService.subscriptions.update({
                  where: { id: sub.id },
                  data: {
                    uuid: remnaUser.uuid,
                    happCryptoUrl,
                    shortUuid: remnaUser.shortUuid,
                    subscriptionUrl: url,
                  },
                })
              }),
            )

            results.forEach((result, idx) => {
              if (result.status === 'fulfilled') {
                updatedCount++
                return
              }
              failedCount++
              this.logger.error({
                msg: `Ошибка обновления подписки ${chunk[idx].id} (userID: ${chunk[idx].user.id})`,
                error:
                  result.reason instanceof Error
                    ? result.reason.message
                    : String(result.reason),
                service: this.serviceName,
              })
            })
          }

          this.logger.info({
            msg: `Subscriptions update finished: updated=${updatedCount} failed=${failedCount} total=${subscriptions.length}`,
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

  /**
   * Приводит фактическое количество зарегистрированных HWID-устройств пользователя
   * в соответствие с текущим лимитом подписки (subData.devicesCount).
   *
   * Проблема: Remnawave не удаляет "лишние" устройства сама, когда hwidDeviceLimit
   * уменьшается (например, при продлении с меньшим количеством ролей/расширений,
   * дающих devicesCount). Она просто хранит все ранее привязанные hwid — так что без
   * ручной чистки пользователь остаётся с доступом с большего числа устройств, чем
   * оплатил.
   *
   * Стратегия:
   *  - Первое привязанное устройство (минимальный createdAt) считаем "основным" и
   *    никогда не удаляем его первым.
   *  - Остальные сортируем по updatedAt по убыванию, оставляем сколько влезает по
   *    лимиту, остальное (давно не обращавшееся) — удаляем.
   *
   * Best-effort: ошибки удаления отдельных устройств не бросаются наружу, только
   * логируются — рассинхрон исправится на следующем проходе крона.
   */
  private async enforceHwidDeviceLimit(
    userUuid: string,
    hwidDeviceLimit: number,
    knownDevices?: RemnaHwidDevice[],
  ): Promise<RemnaHwidDevice[]> {
    if (!hwidDeviceLimit || hwidDeviceLimit < 1) return knownDevices ?? []

    try {
      const devices =
        knownDevices ??
        (await this.remnaService.getUserHwidDevices(userUuid)).devices

      if (devices.length <= hwidDeviceLimit) return devices

      const sortedByCreated = [...devices].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      )
      const [primaryDevice, ...rest] = sortedByCreated

      const sortedRestByRecency = rest.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )

      const keepFromRest = sortedRestByRecency.slice(0, hwidDeviceLimit - 1)
      const toRemove = sortedRestByRecency.slice(hwidDeviceLimit - 1)

      if (toRemove.length === 0) return devices

      this.logger.info({
        msg: `Превышен лимит HWID-устройств userUuid=${userUuid}: ${devices.length}/${hwidDeviceLimit}, удаляем ${toRemove.length}`,
        service: this.serviceName,
      })

      const results = await Promise.allSettled(
        toRemove.map((d) =>
          this.remnaService.deleteUserHwidDevice({ userUuid, hwid: d.hwid }),
        ),
      )

      results.forEach((result, idx) => {
        if (result.status === 'rejected') {
          this.logger.warn({
            msg: `Не удалось удалить HWID-устройство ${toRemove[idx].hwid} userUuid=${userUuid}`,
            error:
              result.reason instanceof Error
                ? result.reason.message
                : String(result.reason),
            service: this.serviceName,
          })
        }
      })

      return [primaryDevice, ...keepFromRest]
    } catch (error) {
      this.logger.warn({
        msg: `Ошибка синхронизации лимита HWID-устройств userUuid=${userUuid}, пропускаем`,
        error: error instanceof Error ? error.message : String(error),
        service: this.serviceName,
      })
      return knownDevices ?? []
    }
  }

  private mapSubscriptionToTma(
    remnaUser: RemnaUser,
    subData: NewEraSubData,
    devices: RemnaHwidDevice[],
  ): NewEraSubWithTmaInterface {
    const subUrl =
      'https://' +
      this.configService.getOrThrow('SUB_DOMAIN') +
      '/' +
      remnaUser.shortUuid
    return {
      isNoSub: false,
      status: remnaUser.status,
      isUnlimitTraffic: remnaUser.trafficLimitBytes === 0,
      devicesLimit: remnaUser.hwidDeviceLimit,
      dataLimitBytes:
        remnaUser.trafficLimitBytes === 0
          ? undefined
          : subData.trafficLimitGb * 1024 ** 3,
      usedTrafficBytes: remnaUser.userTraffic.usedTrafficBytes,
      lifetimeUsedTrafficBytes: remnaUser.userTraffic.lifetimeUsedTrafficBytes,
      expiredAt: new Date(remnaUser.expireAt),
      onlineAt: remnaUser.userTraffic.onlineAt
        ? new Date(remnaUser.userTraffic.onlineAt)
        : undefined,
      days: subData.days,
      subscriptionUrl: subUrl,
      devices: sortDevicesByRemovalPriority(devices).map(mapDevice),
      isAutoRenewing: subData.isAutoRenewing,
    }
  }
}

function mapDevice(el: RemnaHwidDevice): HwidDevice {
  return {
    hwid: el.hwid,
    platform: el.platform,
    osVersion: el.osVersion,
    deviceModel: el.deviceModel,
  }
}

function sortDevicesByRemovalPriority(
  devices: RemnaHwidDevice[],
): RemnaHwidDevice[] {
  if (devices.length <= 1) return devices

  const sortedByCreated = [...devices].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  )

  const [primaryDevice, ...rest] = sortedByCreated

  rest.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )

  return [primaryDevice, ...rest]
}
