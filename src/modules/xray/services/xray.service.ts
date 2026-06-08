import { Prisma } from '@core/prisma/generated/client'
import { PrismaService } from '@core/prisma/prisma.service'
import { RedisService } from '@core/redis/redis.service'
import { PaymentsService } from '@modules/payments/services/payments.service'
import { PaymentTypeEnum } from '@modules/payments/types/payment-type.enum'
import { PlansServersSelectTypeEnum } from '@modules/plans/types/plans-servers-select-type.enum'
import { PlansEnum } from '@modules/plans/types/plans.enum'
import { PlansInterface } from '@modules/plans/types/plans.interface'
import { EventsService } from '@modules/users/services/events.service'
import { UsersService } from '@modules/users/services/users.service'
import { EventType } from '@modules/users/types/event-type.enum'
import { forwardRef, Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { BalanceTypeEnum } from '@shared/enums/balance-type.enum'
import { DefaultEnum } from '@shared/enums/default.enum'
import { PaymentMethodEnum } from '@shared/enums/payment-method.enum'
import { SubscriptionPeriodEnum } from '@shared/enums/subscription-period.enum'
import { TrafficResetEnum } from '@shared/enums/traffic-reset.enum'
import { TransactionReasonEnum } from '@shared/enums/transaction-reason.enum'
import { TransactionTypeEnum } from '@shared/enums/transaction-type.enum'
import { genToken } from '@shared/utils/gen-token.util'
import { addHours } from 'date-fns'
import { I18nService } from 'nestjs-i18n'
import { PinoLogger } from 'nestjs-pino'
import { InjectBot } from 'nestjs-telegraf'
import { Telegraf } from 'telegraf'
import { UserCreate } from '../types/marzban.types'
import { ServerDataInterface } from '../types/servers-data.interface'
import {
  GetSubscriptionConfigResponseInterface,
  SubscriptionDataInterface,
  SubscriptionResponseInterface,
} from '../types/subscription-data.interface'
import { XrayInboundTypeEnum } from '../types/xray-inbound-type.enum'
import {
  calculateSubscriptionCost,
  calculateTrafficPrice,
} from '../utils/calculate-subscription-cost.util'
import { periodHours } from '../utils/period-hours.util'
import { MarzbanService } from './marzban.service'

// ---------------------------------------------------------------------------
// Shared helper — maps a greenList DB record to ServerDataInterface
// FIX #11: extracted to avoid duplication between getSubscriptions and
//          getSubscriptionByTokenOrId
// ---------------------------------------------------------------------------
function mapServer(server: {
  code: string
  name: string
  flagKey: string
  flagEmoji: string
  network: number
  isActive: boolean
  isPremium: boolean
}): ServerDataInterface {
  return {
    code: server.code,
    name: server.name,
    flagKey: server.flagKey,
    flagEmoji: server.flagEmoji,
    network: server.network,
    isActive: server.isActive,
    isPremium: server.isPremium,
  }
}

// Sorts subscription links so that "⏪" (back/Telegram-only) links come first.
function sortLinks(links: string[]): string[] {
  return [...links].sort((a, b) => {
    const aHasSkip = a.includes('⏪')
    const bHasSkip = b.includes('⏪')
    if (aHasSkip && !bHasSkip) return -1
    if (!aHasSkip && bHasSkip) return 1
    return 0
  })
}

@Injectable()
export class XrayService {
  getLocalizedPeriodText(
    period: SubscriptionPeriodEnum,
    _iso6391: string,
  ): any {
    return period
  }
  private readonly serviceName = 'XrayService'

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly userService: UsersService,
    private readonly logger: PinoLogger,
    private readonly redis: RedisService,
    private readonly marzbanService: MarzbanService,
    @Inject(forwardRef(() => PaymentsService))
    private readonly paymentsService: PaymentsService,
    private readonly i18n: I18nService,
    @InjectBot() private readonly bot: Telegraf,
    private readonly eventsService: EventsService,
  ) {}

  public async addTraffic(
    subscriptionId: string,
    traffic: number,
    method: PaymentMethodEnum | 'BALANCE' | 'USDT',
    userId: string,
  ) {
    try {
      const sub = await this.prismaService.subscriptions.findUnique({
        where: {
          id: subscriptionId,
          userId: userId,
        },
        include: {
          plan: true,
          user: {
            include: {
              role: true,
            },
          },
        },
      })

      if (!sub) {
        this.logger.error({
          msg: `Не существует такой подписки с таким пользователем!`,
          service: this.serviceName,
        })
        return {
          success: false,
          message: 'Не существует такой подписки с таким пользователем!',
        }
      }

      const settings = await this.prismaService.settings.findUnique({
        where: {
          key: DefaultEnum.DEFAULT,
        },
      })
      if (!settings) {
        this.logger.error({
          msg: 'Настройки не найдены',
          service: this.serviceName,
        })
        return {
          success: false,
          message: 'settings_not_found',
        }
      }

      if (method === 'BALANCE' || method === 'USDT') {
        const deductionAmount =
          method === 'USDT'
            ? calculateTrafficPrice(
                traffic,
                sub.isPremium,
                sub.user.isTgProgramPartner,
                sub.user.role.discount,
                settings,
              ) * settings.tgStarsToUSD
            : calculateTrafficPrice(
                traffic,
                sub.isPremium,
                sub.user.isTgProgramPartner,
                sub.user.role.discount,
                settings,
              )
        const deductionBalanceType =
          method === 'USDT' ? BalanceTypeEnum.USDT : BalanceTypeEnum.PAYMENT

        // FIX #8: deduct balance first, then mutate Marzban/DB.
        // If Marzban/DB fails we roll back the balance manually and log
        // any rollback failure so ops can correct it.
        const updateBalance = await this.userService.deductUserBalance(
          userId,
          deductionAmount,
          TransactionReasonEnum.SUBSCRIPTIONS,
          deductionBalanceType,
        )

        if (!updateBalance.success) {
          this.logger.error({
            msg: `Ошибка при изменении баланса пользователя: ${updateBalance}`,
            service: this.serviceName,
          })
          return {
            success: false,
            message: 'Error changing user balance',
          }
        }

        const updateSub = await this.addTrafficToSubscription(
          subscriptionId,
          traffic,
        )

        if (!updateSub || !updateSub.success) {
          // Balance already deducted — attempt rollback
          const rollbackResult = await this.userService.addUserBalance(
            userId,
            deductionAmount,
            TransactionReasonEnum.SUBSCRIPTIONS,
            deductionBalanceType,
          )

          if (!rollbackResult.success) {
            // Critical: money deducted but service not delivered — alert ops
            this.logger.error({
              msg: `CRITICAL: Не удалось вернуть средства после ошибки добавления трафика`,
              userId,
              deductionAmount,
              deductionBalanceType,
              service: this.serviceName,
            })
          }

          this.logger.error({
            msg: `Ошибка при изменении трафика подписки: ${updateSub}`,
            service: this.serviceName,
          })
          return {
            success: false,
            message: 'Error changing subscription traffic',
          }
        }

        return {
          success: true,
        }
      }

      const invoice = await this.paymentsService.createInvoice(
        calculateTrafficPrice(
          traffic,
          sub.isPremium,
          sub.user.isTgProgramPartner,
          sub.user.role.discount,
          settings,
        ),
        method,
        sub.user.telegramId,
        PaymentTypeEnum.ADD_TRAFFIC_SUBSCRIPTION,
        {
          subscriptionId,
          traffic,
        },
        subscriptionId,
      )

      return {
        success: true,
        invoice,
      }
    } catch (error) {
      this.logger.error({
        msg: `Ошибка при изменении трафика подписки: ${
          error instanceof Error ? error.message : String(error)
        }`,
        service: this.serviceName,
      })
      return {
        success: false,
        message: 'Error changing subscription traffic',
      }
    }
  }

  public async addTrafficToSubscription(
    subscriptionId: string,
    traffic: number,
  ) {
    try {
      const sub = await this.prismaService.subscriptions.findUnique({
        where: {
          id: subscriptionId,
        },
        include: {
          user: {
            include: {
              telegramData: true,
            },
          },
        },
      })

      if (!sub) {
        this.logger.error({
          msg: `Не существует такой подписки!`,
          service: this.serviceName,
        })
        return {
          success: false,
          message: 'Не существует такой подписки!',
        }
      }

      const updateData = {
        data_limit: (sub.trafficLimitGb + traffic) * 1024 * 1024 * 1024,
      }

      const marzbanUser = await this.marzbanService.modifyUser(
        sub.username,
        updateData,
      )

      if (!marzbanUser) {
        this.logger.error({
          msg: `Ошибка при изменении трафика подписки: ${marzbanUser}`,
          service: this.serviceName,
        })
        return {
          success: false,
          message: 'Error changing subscription traffic',
        }
      }

      if (this.configService.getOrThrow<string>('NODE_ENV') === 'production') {
        await this.marzbanService.restartCore()
      }

      const updateSub = await this.prismaService.subscriptions.update({
        where: {
          id: subscriptionId,
        },
        data: {
          isActive: true,
          planKey: PlansEnum.TRAFFIC,
          trafficLimitGb: sub.trafficLimitGb + traffic,
          // FIX #9: values from Marzban are in bytes; store as MB
          usedTraffic: marzbanUser.used_traffic / 1024 / 1024,
          lastUserAgent: marzbanUser.sub_last_user_agent,
          dataLimit: marzbanUser.data_limit / 1024 / 1024,
          lifeTimeUsedTraffic: marzbanUser.lifetime_used_traffic / 1024 / 1024,
          onlineAt: marzbanUser.online_at
            ? new Date(marzbanUser.online_at + 'Z')
            : null,
          removalAt: null,
          marzbanData: marzbanUser as unknown as Prisma.InputJsonValue,
          announce: null,
        },
      })

      if (!updateSub) {
        this.logger.error({
          msg: `Ошибка при изменении трафика подписки: ${updateSub}`,
          service: this.serviceName,
        })
        return {
          success: false,
          message: 'Error changing subscription traffic',
        }
      }

      await this.bot.telegram
        .sendMessage(
          Number(process.env.TELEGRAM_LOG_CHAT_ID),
          `<b>➕ ДОБАВЛЕН ТРАФИК НА ${traffic} GB</b>
<b>👤 Пользователь:</b> ${
            sub.user.telegramData?.username
              ? `@${sub.user.telegramData?.username}`
              : ''
          } <code>${sub.user.telegramData?.firstName || ''} ${
            sub.user.telegramData?.lastName || ''
          }</code>
<b>🪪 User ID:</b> <code>${updateSub.userId}</code>
<b>🆔 Telegram ID:</b> <code>${sub.user.telegramId}</code>
<b>Имя:</b> <code>${updateSub.name}</code>
<b>Username :</b> <code>${updateSub.username}</code>
<b>Тариф:</b> <code>${updateSub.planKey}</code>
<b>📅 Дата истечения:</b> <code>${
            updateSub.expiredAt == null ? '♾️' : updateSub.expiredAt
          }</code>
<b>🔁 Автопродление:</b> <code>${updateSub.isAutoRenewal ? '✅' : '🚫'}</code>
<b>Множитель периода:</b> <code>x${updateSub.periodMultiplier}</code>
<b>Цена следующей оплаты:</b> <code>${updateSub.nextRenewalStars}</code>
<b>⭐ Премиум:</b> <code>${updateSub.isPremium ? '✅' : '🚫'}</code>
<b>📱 Устройства:</b> <code>${updateSub.devicesCount}</code> шт.
<b>Все базовые сервера:</b> <code>${
            updateSub.isAllBaseServers ? '✅' : '🚫'
          }</code>
<b>Все премиум сервера:</b> <code>${
            updateSub.isAllPremiumServers ? '✅' : '🚫'
          }</code>
<b>📉 Лимит трафика (MB/GB):</b> <code>${updateSub.usedTraffic}</code>/<code>${
            updateSub.trafficLimitGb *
            (updateSub.trafficReset == TrafficResetEnum.DAY
              ? 1
              : updateSub.trafficReset == TrafficResetEnum.WEEK
              ? 7
              : updateSub.trafficReset == TrafficResetEnum.MONTH
              ? 30
              : updateSub.trafficReset == TrafficResetEnum.YEAR
              ? 365
              : 1)
          } GB</code>
<b>Сброс трафика:</b> <code>${updateSub.trafficReset}</code>
<b>♾️ Безлимит:</b> <code>${updateSub.isUnlimitTraffic ? '✅' : '🚫'}</code>
`,
          {
            parse_mode: 'HTML',
            message_thread_id: Number(
              process.env.TELEGRAM_THREAD_ID_SUBSCRIPTIONS,
            ),
          },
        )
        .catch((e) => {
          this.logger.error({
            msg: `Error while sending message to telegram`,
            e,
          })
        })
        .then(() => {
          this.logger.info({
            msg: `Message sent to telegram`,
          })
        })

      return {
        success: true,
      }
    } catch (error) {
      this.logger.error({
        msg: `Ошибка при изменении трафика подписки: ${
          error instanceof Error ? error.message : String(error)
        }`,
        service: this.serviceName,
      })
      return {
        success: false,
        message: 'Error changing subscription traffic',
      }
    }
  }

  public async updateServer(
    subscriptionId: string,
    server: string,
    userId: string,
  ) {
    try {
      const sub = await this.prismaService.subscriptions.findUnique({
        where: {
          id: subscriptionId,
          userId: userId,
        },
      })

      if (!sub) {
        this.logger.error({
          msg: `Не существует такой подписки с таким пользователем!`,
          service: this.serviceName,
        })
        return {
          success: false,
          message: 'Не существует такой подписки с таким пользователем!',
        }
      }

      const getServer = await this.prismaService.greenList.findUnique({
        where: {
          code: server,
        },
      })

      if (!getServer) {
        this.logger.error({
          msg: `Нужный сервер не найден!`,
          service: this.serviceName,
        })
        return {
          success: false,
          message: 'Нужный сервер не найден',
        }
      }

      await this.prismaService.$transaction(async (tx) => {
        await tx.subscriptionToGreenList.deleteMany({
          where: {
            subscriptionId: subscriptionId,
          },
        })
        await tx.subscriptionToGreenList.create({
          data: {
            subscriptionId: subscriptionId,
            greenListId: getServer.green,
          },
        })
      })

      return {
        success: true,
      }
    } catch (error) {
      this.logger.error({
        msg: `Ошибка при изменении сервера подписки: ${
          error instanceof Error ? error.message : String(error)
        }`,
        service: this.serviceName,
      })
      return {
        success: false,
        message: 'Error changing subscription server',
      }
    }
  }

  public async editSubscriptionName(
    subscriptionId: string,
    name: string,
    userId: string,
  ) {
    try {
      const sub = await this.prismaService.subscriptions.findUnique({
        where: {
          id: subscriptionId,
          userId: userId,
        },
      })

      if (!sub) {
        this.logger.error({
          msg: `Не существует такой подписки с таким пользователем!`,
          service: this.serviceName,
        })
        return {
          success: false,
          message: 'Не существует такой подписки с таким пользователем!',
        }
      }

      await this.prismaService.subscriptions.update({
        where: {
          id: subscriptionId,
        },
        data: {
          name,
        },
      })
      return {
        success: true,
        message: 'Subscription name is changed',
      }
    } catch (error) {
      this.logger.error({
        msg: `Ошибка при изменении имени подписки: ${
          error instanceof Error ? error.message : String(error)
        }`,
        service: this.serviceName,
      })
      return {
        success: false,
        message: 'Error changing subscription name',
      }
    }
  }

  /**
   * Активирует бесплатный план для пользователя
   */
  public async activateFreePlan(telegramId: string) {
    try {
      this.logger.info({
        msg: `Активация бесплатного плана для пользователя с Telegram ID: ${telegramId}`,
        service: this.serviceName,
      })

      const user = await this.userService.getResUserByTgId(telegramId)

      if (!user) {
        this.logger.warn({
          msg: `Пользователь с Telegram ID ${telegramId} не найден`,
          service: this.serviceName,
        })
        return false
      }

      if (!user.isFreePlanAvailable) {
        this.logger.warn({
          msg: `Бесплатный план недоступен для пользователя с Telegram ID ${telegramId}`,
          service: this.serviceName,
        })
        return false
      }

      const plan = await this.prismaService.plans.findUnique({
        where: {
          key: PlansEnum.TRIAL,
        },
      })

      if (!plan) {
        this.logger.error({
          msg: `План ${PlansEnum.TRIAL} не найден`,
          service: this.serviceName,
        })
        return false
      }

      const subscription = await this.createSubscription({
        telegramId,
        name: 'Trial',
        planKey: PlansEnum.TRIAL,
        period: SubscriptionPeriodEnum.TRIAL,
        periodMultiplier: 1,
        isPremium: false,
        trafficReset: TrafficResetEnum.NO_RESET,
        devicesCount: plan.devicesCount,
        isAllBaseServers: true,
        isAllPremiumServers: true,
        isUnlimitTraffic: false,
        trafficLimitGb: user.trialGb || 5000,
        servers: [],
        isAutoRenewal: false,
      })

      if (!subscription) return false

      await this.prismaService.users.update({
        where: {
          id: user.id,
        },
        data: {
          isFreePlanAvailable: false,
        },
      })

      this.logger.info({
        msg: `Бесплатный план успешно активирован для пользователя с Telegram ID: ${telegramId}`,
        service: this.serviceName,
      })

      return subscription
    } catch (error) {
      this.logger.error({
        msg: `Ошибка при активации бесплатного плана для пользователя с Telegram ID: ${telegramId}`,
        error,
        stack: error instanceof Error ? error.stack : undefined,
        service: this.serviceName,
      })
      return false
    }
  }

  public async getSubscriptionByTokenOrId({
    token,
    id,
    isToken,
    agent,
  }: {
    token?: string
    id?: string
    isToken: boolean
    agent: string
  }): Promise<GetSubscriptionConfigResponseInterface> {
    try {
      const whereCondition = isToken && token ? { token } : { id }

      const subscription = await this.prismaService.subscriptions.findUnique({
        where: { ...whereCondition },
        include: {
          plan: true,
          servers: {
            include: {
              greenList: true,
            },
          },
        },
      })

      if (!subscription) {
        return
      }

      const allowedOrigin = this.configService.get<string>('ALLOWED_ORIGIN')
      if (!allowedOrigin) {
        throw new Error('ALLOWED_ORIGIN не настроен в конфигурации')
      }

      const getAllServers = await this.prismaService.greenList.findMany({
        where: {
          isActive: true,
        },
      })

      // FIX #11: use shared helper
      const allServersMapped = getAllServers.map(mapServer)

      await this.prismaService.subscriptions.update({
        where: {
          id: subscription.id,
        },
        data: {
          lastUserAgent: agent,
        },
      })

      const settings = await this.prismaService.settings.findUnique({
        where: {
          key: DefaultEnum.DEFAULT,
        },
      })

      const settingsTelegramLinks =
        settings && typeof settings.telegramConfigLinks === 'object'
          ? (settings.telegramConfigLinks as { links?: unknown })
          : null

      const globalTelegramOnlyLinks = Array.isArray(
        settingsTelegramLinks?.links,
      )
        ? settingsTelegramLinks.links.filter(
            (link): link is string => typeof link === 'string',
          )
        : []

      const subscriptionLinks = Array.isArray(subscription.links)
        ? (subscription.links as string[])
        : []

      const activate_title = 'Telegram бот: @vpnsibcom_bot'
      const support_title = 'Канал: @vpnsibcom'
      const chat_title = 'Чат: @vpnsibcom_chat'

      globalTelegramOnlyLinks.push(
        `vless://ce@0.0.0.0:228?name=${encodeURIComponent(
          activate_title,
        )}#${encodeURIComponent(activate_title)}`,
      )

      globalTelegramOnlyLinks.push(
        `vless://ce@0.0.0.0:228?name=${encodeURIComponent(
          support_title,
        )}#${encodeURIComponent(support_title)}`,
      )

      globalTelegramOnlyLinks.push(
        `vless://ce@0.0.0.0:228?name=${encodeURIComponent(
          chat_title,
        )}#${encodeURIComponent(chat_title)}`,
      )

      // FIX #11: use shared sortLinks helper
      const links = sortLinks(
        subscription.isActive ? subscriptionLinks : globalTelegramOnlyLinks,
      )

      const routing = settings.routingUrl ? settings.routingUrl : undefined
      const subscriptionUrl = `${allowedOrigin}/sub/${subscription.token}`

      // FIX #11: resolve servers via shared helper
      const resolvedServers = this.resolveServers(
        subscription,
        allServersMapped,
      )

      return {
        routing,
        userId: subscription.userId,
        subscription: {
          id: subscription.id,
          name: subscription.name,
          plan: {
            key: subscription.plan.key as PlansEnum,
            name: subscription.plan.name,
            priceStars: subscription.plan.priceStars,
            isCustom: subscription.plan.isCustom,
            devicesCount: subscription.plan.devicesCount,
            isAllBaseServers: subscription.plan.isAllBaseServers,
            isAllPremiumServers: subscription.plan.isAllPremiumServers,
            trafficLimitGb: subscription.plan.trafficLimitGb,
            isUnlimitTraffic: subscription.plan.isUnlimitTraffic,
            serversSelectType: subscription.plan
              .serversSelectType as PlansServersSelectTypeEnum,
          },
          period: subscription.period as SubscriptionPeriodEnum,
          periodMultiplier: subscription.periodMultiplier,
          isActive: subscription.isActive,
          isAutoRenewal: subscription.isAutoRenewal,
          nextRenewalStars: subscription.nextRenewalStars,
          devicesCount: subscription.devicesCount,
          isAllBaseServers: subscription.isAllBaseServers,
          isAllPremiumServers: subscription.isAllPremiumServers,
          trafficLimitGb: subscription.trafficLimitGb,
          isUnlimitTraffic: subscription.isUnlimitTraffic,
          lastUserAgent: subscription.lastUserAgent,
          dataLimit: subscription.dataLimit * 1024 * 1024,
          usedTraffic: subscription.usedTraffic * 1024 * 1024,
          lifeTimeUsedTraffic: subscription.lifeTimeUsedTraffic * 1024 * 1024,
          trafficReset: subscription.trafficReset as TrafficResetEnum,
          announce: subscription.announce,
          links,
          servers: resolvedServers,
          baseServersCount: subscription.isAllBaseServers
            ? getAllServers.filter((s) => !s.isPremium).length
            : subscription.servers.filter(
                (s) => !s.greenList.isPremium && s.greenList.isActive,
              ).length,
          premiumServersCount: subscription.isAllPremiumServers
            ? getAllServers.filter((s) => s.isPremium).length
            : subscription.servers.filter(
                (s) => s.greenList.isPremium && s.greenList.isActive,
              ).length,
          createdAt: subscription.createdAt,
          updatedAt: subscription.updatedAt,
          expiredAt: subscription.expiredAt,
          onlineAt: subscription.onlineAt,
          token: subscription.token,
          subscriptionUrl,
        },
        marzbanSubRes: undefined,
      }
    } catch (error) {
      this.logger.error({
        msg: `Error when receiving a subscription: ${token || id}`,
        error,
        stack: error instanceof Error ? error.stack : undefined,
        service: this.serviceName,
      })

      return
    }
  }

  /**
   * FIX #11: Single place for server resolution logic used by both
   * getSubscriptions and getSubscriptionByTokenOrId.
   */
  private resolveServers(
    subscription: {
      isAllBaseServers: boolean
      isAllPremiumServers: boolean
      servers: Array<{ greenList: any }>
    },
    allServersMapped: ServerDataInterface[],
  ): ServerDataInterface[] {
    if (subscription.isAllBaseServers && subscription.isAllPremiumServers) {
      return allServersMapped
    }
    if (subscription.isAllBaseServers && !subscription.isAllPremiumServers) {
      return allServersMapped.filter((s) => !s.isPremium)
    }
    return subscription.servers.map((s) => mapServer(s.greenList))
  }

  /**
   * Получает список подписок пользователя
   */
  public async getSubscriptions(
    userId: string,
  ): Promise<SubscriptionResponseInterface> {
    try {
      this.logger.info({
        msg: `Получение подписок для пользователя с ID: ${userId}`,
        service: this.serviceName,
      })

      const subscriptions = await this.prismaService.subscriptions.findMany({
        where: {
          userId: userId,
          deletedAt: null,
        },
        include: {
          plan: true,
          servers: {
            include: {
              greenList: true,
            },
          },
        },
      })

      const allowedOrigin = this.configService.get<string>('ALLOWED_ORIGIN')
      if (!allowedOrigin) {
        this.logger.error({
          msg: `ALLOWED_ORIGIN not configured`,
          service: this.serviceName,
        })
        throw new Error('ALLOWED_ORIGIN не настроен в конфигурации')
      }

      const getAllServers = await this.prismaService.greenList.findMany({
        where: {
          isActive: true,
        },
      })

      // FIX #11: use shared helper
      const allServersMapped = getAllServers.map(mapServer)

      const baseServersCount = getAllServers.filter((s) => !s.isPremium).length
      const premiumServersCount = getAllServers.filter(
        (s) => s.isPremium,
      ).length

      this.logger.info({
        msg: `Server statistics - Total: ${getAllServers.length}, Base: ${baseServersCount}, Premium: ${premiumServersCount}`,
        service: this.serviceName,
      })

      const result: SubscriptionDataInterface[] = subscriptions.map(
        (subscription) => ({
          id: subscription.id,
          name: subscription.name,
          plan: {
            key: subscription.plan.key as PlansEnum,
            name: subscription.plan.name,
            priceStars: subscription.plan.priceStars,
            isCustom: subscription.plan.isCustom,
            devicesCount: subscription.plan.devicesCount,
            isAllBaseServers: subscription.plan.isAllBaseServers,
            isAllPremiumServers: subscription.plan.isAllPremiumServers,
            trafficLimitGb: subscription.plan.trafficLimitGb,
            isUnlimitTraffic: subscription.plan.isUnlimitTraffic,
            serversSelectType: subscription.plan
              .serversSelectType as PlansServersSelectTypeEnum,
          },
          period: subscription.period as SubscriptionPeriodEnum,
          periodMultiplier: subscription.periodMultiplier,
          isActive: subscription.isActive,
          isAutoRenewal: subscription.isAutoRenewal,
          nextRenewalStars: subscription.nextRenewalStars,
          devicesCount: subscription.devicesCount,
          isAllBaseServers: subscription.isAllBaseServers,
          isAllPremiumServers: subscription.isAllPremiumServers,
          trafficLimitGb: subscription.trafficLimitGb,
          isUnlimitTraffic: subscription.isUnlimitTraffic,
          lastUserAgent: subscription.lastUserAgent,
          dataLimit: subscription.dataLimit * 1024 * 1024,
          usedTraffic: subscription.usedTraffic * 1024 * 1024,
          lifeTimeUsedTraffic: subscription.lifeTimeUsedTraffic * 1024 * 1024,
          trafficReset: subscription.trafficReset as TrafficResetEnum,
          announce: subscription.announce,
          // FIX #11: use shared sortLinks helper
          links: sortLinks(subscription.links as string[]),
          // FIX #11: use shared resolveServers helper
          servers: this.resolveServers(subscription, allServersMapped),
          baseServersCount: subscription.isAllBaseServers
            ? baseServersCount
            : subscription.servers.filter(
                (s) => !s.greenList.isPremium && s.greenList.isActive,
              ).length,
          premiumServersCount: subscription.isAllPremiumServers
            ? premiumServersCount
            : subscription.servers.filter(
                (s) => s.greenList.isPremium && s.greenList.isActive,
              ).length,
          createdAt: subscription.createdAt,
          updatedAt: subscription.updatedAt,
          expiredAt: subscription.expiredAt,
          onlineAt: subscription.onlineAt,
          token: subscription.token,
          subscriptionUrl: `${allowedOrigin}/sub/${subscription.token}`,
        }),
      )

      this.logger.info({
        msg: `Успешно получены ${result.length} подписок для пользователя с ID: ${userId}`,
        service: this.serviceName,
      })

      const settings = await this.prismaService.settings.findUnique({
        where: {
          key: DefaultEnum.DEFAULT,
        },
      })
      if (!settings) {
        this.logger.warn({
          msg: 'Настройки по умолчанию не найдены',
          service: this.serviceName,
        })
        return
      }

      return {
        tgStarsToUSD: settings.tgStarsToUSD,
        telegramPremiumRatio: settings.telegramPremiumRatio,
        devicesPriceStars: settings.devicesPriceStars,
        serversPriceStars: settings.serversPriceStars,
        premiumServersPriceStars: settings.premiumServersPriceStars,
        allBaseServersPriceStars: settings.allBaseServersPriceStars,
        allPremiumServersPriceStars: settings.allPremiumServersPriceStars,
        trafficGbPriceStars: settings.trafficGbPriceStars,
        unlimitTrafficPriceStars: settings.unlimitTrafficPriceStars,
        hourRatioPayment: settings.hourRatioPayment,
        dayRatioPayment: settings.dayRatioPayment,
        weekRatioPayment: settings.weekRatioPayment,
        threeMouthesRatioPayment: settings.threeMouthesRatioPayment,
        sixMouthesRatioPayment: settings.sixMouthesRatioPayment,
        oneYearRatioPayment: settings.oneYearRatioPayment,
        twoYearRatioPayment: settings.twoYearRatioPayment,
        threeYearRatioPayment: settings.threeYearRatioPayment,
        indefinitelyRatio: settings.indefinitelyRatio,
        telegramPartnerProgramRatio: settings.telegramPartnerProgramRatio,
        subscriptions: result.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
      }
    } catch (error) {
      this.logger.error({
        msg: `Ошибка при получении подписок для пользователя с ID: ${userId}`,
        error,
        stack: error instanceof Error ? error.stack : undefined,
        service: this.serviceName,
      })
      return undefined
    }
  }

  public async createSubscription({
    telegramId,
    name,
    planKey,
    period,
    periodMultiplier,
    isPremium,
    nextRenewalStars,
    devicesCount,
    isAllBaseServers,
    isAllPremiumServers,
    trafficLimitGb,
    isUnlimitTraffic,
    trafficReset,
    servers,
    isAutoRenewal = true,
  }: {
    telegramId: string
    name: string
    planKey: PlansEnum
    period: SubscriptionPeriodEnum
    periodMultiplier: number
    isPremium: boolean
    trafficReset: TrafficResetEnum
    nextRenewalStars?: number
    devicesCount: number
    isAllBaseServers: boolean
    isAllPremiumServers: boolean
    trafficLimitGb?: number
    isUnlimitTraffic: boolean
    servers: string[]
    isAutoRenewal?: boolean
  }) {
    try {
      this.logger.info({
        msg: `Создание подписки для пользователя с Telegram ID: ${telegramId}, период: ${period}`,
        service: this.serviceName,
      })

      const user = await this.userService.getUserByTgId(telegramId)
      if (!user) {
        this.logger.warn({
          msg: `Пользователь с Telegram ID ${telegramId} не найден`,
          service: this.serviceName,
        })
        return false
      }

      if (user.subscriptions.length >= user.role.limitSubscriptions) {
        this.logger.warn({
          msg: `Превышен лимит подписок для пользователя с Telegram ID ${telegramId}`,
          service: this.serviceName,
        })
        return false
      }

      const getServers = await this.prismaService.greenList.findMany({
        where: {
          code: {
            in: servers,
          },
        },
      })

      trafficReset =
        planKey == PlansEnum.TRAFFIC ? TrafficResetEnum.NO_RESET : trafficReset

      period =
        planKey == PlansEnum.TRAFFIC
          ? SubscriptionPeriodEnum.INDEFINITELY
          : period

      const token = genToken()
      const username = `${user.telegramId}_${Math.random()
        .toString(36)
        .substring(2)}`
      const isIndefinitely =
        period == SubscriptionPeriodEnum.INDEFINITELY ||
        period == SubscriptionPeriodEnum.TRIAL ||
        period == SubscriptionPeriodEnum.TRAFFIC

      const getInbounds = await this.prismaService.xrayInbounds.findMany()

      const isVless =
        getInbounds.findIndex((el) => el.type == XrayInboundTypeEnum.VLESS) !=
        -1

      const isTrojan =
        getInbounds.findIndex((el) => el.type == XrayInboundTypeEnum.TROJAN) !=
        -1

      const isSS =
        getInbounds.findIndex(
          (el) => el.type == XrayInboundTypeEnum.SHADOWSOCKS,
        ) != -1

      const marbanDataStart: UserCreate = {
        username,
        ...((isVless || isTrojan || isSS) && {
          proxies: {
            ...(isVless && {
              vless: {
                flow: 'xtls-rprx-vision',
              },
            }),
            ...(isTrojan && {
              trojan: {},
            }),
            ...(isSS && {
              shadowsocks: {},
            }),
          },
          inbounds: {
            ...(isVless && {
              vless: getInbounds
                .filter((el) => el.type == XrayInboundTypeEnum.VLESS)
                .map((el) => el.inboundTag),
            }),
            ...(isTrojan && {
              trojan: getInbounds
                .filter((el) => el.type == XrayInboundTypeEnum.TROJAN)
                .map((el) => el.inboundTag),
            }),
            ...(isSS && {
              shadowsocks: getInbounds
                .filter((el) => el.type == XrayInboundTypeEnum.SHADOWSOCKS)
                .map((el) => el.inboundTag),
            }),
          },
        }),
        status: 'active',
        ...(!isUnlimitTraffic && {
          data_limit_reset_strategy:
            trafficReset.toLowerCase() || TrafficResetEnum.DAY.toLowerCase(),
          data_limit:
            trafficLimitGb *
            1024 *
            1024 *
            1024 *
            (trafficReset == TrafficResetEnum.DAY
              ? 1
              : trafficReset == TrafficResetEnum.WEEK
              ? 7
              : trafficReset == TrafficResetEnum.MONTH
              ? 30
              : trafficReset == TrafficResetEnum.YEAR
              ? 365
              : 1),
        }),
        note: `${user.id}/${user.telegramId}/${
          user.telegramData?.username || ''
        }/${user.telegramData?.firstName || ''}/${
          user.telegramData?.lastName || ''
        }/${user.telegramData?.languageCode || ''}`,
      }

      const marzbanData = await this.marzbanService.addUser(marbanDataStart)
      if (!marzbanData) {
        this.logger.error({
          msg: `Не удалось добавить пользователя в Marzban для Telegram ID: ${telegramId}`,
          service: this.serviceName,
        })
        return false
      }

      if (this.configService.getOrThrow<string>('NODE_ENV') === 'production') {
        await this.marzbanService.restartCore()
      }

      const hours = periodHours(period, periodMultiplier)
      if (
        period !== SubscriptionPeriodEnum.INDEFINITELY &&
        period !== SubscriptionPeriodEnum.TRIAL &&
        period !== SubscriptionPeriodEnum.TRAFFIC &&
        hours <= 0
      ) {
        this.logger.error({
          msg: `Некорректный период подписки: ${period}`,
          service: this.serviceName,
        })
        return false
      }

      const subscriptionData = {
        username,
        isPremium,
        name,
        planKey,
        isAutoRenewal:
          isIndefinitely || planKey == PlansEnum.TRAFFIC
            ? false
            : isAutoRenewal,
        devicesCount,
        isAllBaseServers,
        isAllPremiumServers,
        trafficLimitGb: trafficLimitGb,
        isUnlimitTraffic:
          planKey == PlansEnum.TRAFFIC ? false : isUnlimitTraffic,
        trafficReset: trafficReset,
        userId: user.id,
        period,
        periodMultiplier,
        isActive: true,
        token,
        links: marzbanData.links,
        dataLimit: marzbanData.data_limit / 1024 / 1024,
        usedTraffic: marzbanData.used_traffic / 1024 / 1024,
        lifeTimeUsedTraffic: marzbanData.used_traffic / 1024 / 1024,
        expiredAt:
          isIndefinitely || planKey == PlansEnum.TRAFFIC
            ? null
            : addHours(new Date(), hours),
        nextRenewalStars:
          isIndefinitely || planKey == PlansEnum.TRAFFIC
            ? null
            : nextRenewalStars,
        marzbanData: marzbanData as unknown as Prisma.InputJsonValue,
        servers: {
          create: getServers.map((server) => ({
            greenListId: server.green,
          })),
        },
      }

      const subscription = await this.prismaService.subscriptions.create({
        data: subscriptionData,
      })

      if (!subscription) {
        this.logger.error({
          msg: `Не удалось создать подписку в базе данных для пользователя с Telegram ID: ${telegramId}`,
          service: this.serviceName,
        })
        return false
      }

      this.eventsService.createEvent({
        userId: user.id,
        eventType: EventType.ACTIVATION,
      })

      await this.processReferrals(user)

      this.logger.info({
        msg: `Подписка успешно создана для пользователя с Telegram ID: ${telegramId}`,
        subscriptionId: subscription.id,
        service: this.serviceName,
      })

      try {
        if (subscription.isActive)
          await this.bot.telegram
            .sendMessage(
              Number(process.env.TELEGRAM_LOG_CHAT_ID),
              `<b>👍 НОВАЯ ПОДПИСКА СОЗДАНА</b>
<b>👤 Пользователь:</b> ${
                user.telegramData?.username
                  ? `@${user.telegramData?.username}`
                  : ''
              } <code>${user.telegramData?.firstName || ''} ${
                user.telegramData?.lastName || ''
              }</code>
<b>🪪 User ID:</b> <code>${subscription.userId}</code>
<b>🆔 Telegram ID:</b> <code>${user.telegramId}</code>
<b>Имя:</b> <code>${subscription.name}</code>
<b>Username :</b> <code>${subscription.username}</code>
<b>Тариф:</b> <code>${subscription.planKey}</code>
<b>📅 Дата истечения:</b> <code>${
                subscription.expiredAt == null ? '♾️' : subscription.expiredAt
              }</code>
<b>🔁 Автопродление:</b> <code>${
                subscription.isAutoRenewal ? '✅' : '🚫'
              }</code>
<b>Множитель периода:</b> <code>x${subscription.periodMultiplier}</code>
<b>Цена следующей оплаты:</b> <code>${subscription.nextRenewalStars}</code>
<b>⭐ Премиум:</b> <code>${subscription.isPremium ? '✅' : '🚫'}</code>
<b>📱 Устройства:</b> <code>${subscription.devicesCount}</code>
<b>Все базовые сервера:</b> <code>${
                subscription.isAllBaseServers ? '✅' : '🚫'
              }</code>
<b>Все премиум сервера:</b> <code>${
                subscription.isAllPremiumServers ? '✅' : '🚫'
              }</code>
<b>📉 Лимит трафика:</b> <code>${
                // FIX #9: usedTraffic уже хранится в MB; показываем как есть
                subscription.usedTraffic
              } MB</code>/<code>${
                subscription.trafficLimitGb *
                (trafficReset == TrafficResetEnum.DAY
                  ? 1
                  : trafficReset == TrafficResetEnum.WEEK
                  ? 7
                  : trafficReset == TrafficResetEnum.MONTH
                  ? 30
                  : trafficReset == TrafficResetEnum.YEAR
                  ? 365
                  : 1)
              } GB</code>
<b>Сброс трафика:</b> <code>${subscription.trafficReset}</code>
<b>♾️ Безлимит:</b> <code>${subscription.isUnlimitTraffic ? '✅' : '🚫'}</code>
`,
              {
                parse_mode: 'HTML',
                message_thread_id: Number(
                  process.env.TELEGRAM_THREAD_ID_SUBSCRIPTIONS,
                ),
              },
            )
            .catch((e) => {
              this.logger.error({
                msg: `Error while sending message to telegram`,
                e,
              })
            })
            .then(() => {
              this.logger.info({
                msg: `Message sent to telegram`,
              })
            })
      } catch (e) {
        this.logger.error({
          msg: `Error while sending message to telegram`,
          e,
        })
      }

      return subscription
    } catch (error) {
      this.logger.error({
        msg: `Ошибка при создании подписки для пользователя с Telegram ID: ${telegramId}`,
        error,
        stack: error instanceof Error ? error.stack : undefined,
        service: this.serviceName,
      })
      return false
    }
  }

  /**
   * Обрабатывает реферальную систему при первой активации подписки рефералом.
   * FIX #3: транзакция теперь действительно обновляет баланс инвайтера.
   */
  public async processReferrals(user: any) {
    try {
      if (!user.inviters || user.inviters.length === 0) {
        return
      }

      const settings = await this.prismaService.settings.findUnique({
        where: {
          key: DefaultEnum.DEFAULT,
        },
      })

      if (!settings) {
        this.logger.warn({
          msg: 'Настройки по умолчанию не найдены',
          service: this.serviceName,
        })
        return
      }

      for (const inviter of user.inviters) {
        if (!inviter.isActivated) {
          try {
            // Validate required data before entering the transaction
            if (!inviter.inviter) {
              this.logger.warn({
                msg: `Данные инвайтера отсутствуют, пропускаем`,
                inviterId: inviter.id,
                service: this.serviceName,
              })
              continue
            }

            if (!inviter.inviter.balanceId) {
              this.logger.error({
                msg: `Отсутствует balanceId для инвайтера`,
                inviterId: inviter.inviter.id,
                service: this.serviceName,
              })
              continue
            }

            if (!inviter.inviter.balance) {
              this.logger.error({
                msg: `Отсутствуют данные о балансе для инвайтера`,
                inviterId: inviter.inviter.id,
                service: this.serviceName,
              })
              continue
            }

            // Activation bonus: configurable per-level from settings
            const activationBonus = this.getReferralActivationBonus(
              inviter.level,
              settings,
            )

            await this.prismaService.$transaction(async (tx) => {
              // Mark referral as activated
              await tx.referrals.update({
                where: {
                  id: inviter.id,
                },
                data: {
                  isActivated: true,
                },
              })

              // FIX #3: actually credit the inviter's balance
              if (activationBonus > 0) {
                await tx.userBalance.update({
                  where: {
                    id: inviter.inviter.balanceId,
                  },
                  data: {
                    paymentBalance: {
                      increment: activationBonus,
                    },
                  },
                })

                await tx.transactions.create({
                  data: {
                    amount: activationBonus,
                    type: TransactionTypeEnum.PLUS,
                    reason: TransactionReasonEnum.REFERRAL,
                    balanceType: BalanceTypeEnum.PAYMENT,
                    balanceId: inviter.inviter.balanceId,
                  },
                })

                this.logger.info({
                  msg: `Реферальный бонус за активацию начислен`,
                  inviterId: inviter.inviter.id,
                  activationBonus,
                  service: this.serviceName,
                })
              }
            })
          } catch (error) {
            this.logger.error({
              msg: `Ошибка при обновлении реферального баланса`,
              inviterId: inviter.inviter?.id,
              error,
              stack: error instanceof Error ? error.stack : undefined,
              service: this.serviceName,
            })
          }
        }
      }
    } catch (error) {
      this.logger.error({
        msg: `Ошибка при обработке реферальной системы`,
        userId: user.id,
        error,
        stack: error instanceof Error ? error.stack : undefined,
        service: this.serviceName,
      })
    }
  }

  /**
   * Returns the one-time activation bonus (in Stars) for a given referral level.
   * Reads from settings fields referralOneLevelActivationBonus,
   * referralTwoLevelActivationBonus, referralThreeLevelActivationBonus.
   * Falls back to 0 if the field doesn't exist yet.
   */
  private getReferralActivationBonus(level: number, settings: any): number {
    switch (level) {
      case 1:
        return settings.referralOneLevelActivationBonus ?? 0
      case 2:
        return settings.referralTwoLevelActivationBonus ?? 0
      case 3:
        return settings.referralThreeLevelActivationBonus ?? 0
      default:
        return 0
    }
  }

  public getDeclension(count: number): number {
    const lastDigit = count % 10
    const lastTwoDigits = count % 100

    if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
      return 2
    }

    if (lastDigit === 1) {
      return 0
    }

    if (lastDigit >= 2 && lastDigit <= 4) {
      return 1
    }

    return 2
  }

  public async purchaseSubscription({
    telegramId,
    name,
    planKey,
    period,
    periodMultiplier,
    devicesCount,
    isAllBaseServers,
    isAllPremiumServers,
    trafficLimitGb,
    isUnlimitTraffic,
    trafficReset,
    servers = [],
    isAutoRenewal = true,
    method,
  }: {
    name: string
    telegramId: string
    planKey: PlansEnum
    period: SubscriptionPeriodEnum
    periodMultiplier: number
    devicesCount: number
    isAllBaseServers: boolean
    isAllPremiumServers: boolean
    trafficLimitGb?: number
    isUnlimitTraffic: boolean
    trafficReset: TrafficResetEnum
    servers?: string[]
    isAutoRenewal?: boolean
    method?: PaymentMethodEnum | 'BALANCE' | 'USDT'
  }) {
    try {
      this.logger.info({
        msg: `Покупка подписки для пользователя с Telegram ID: ${telegramId}, период: ${period}`,
        service: this.serviceName,
      })

      const user = await this.userService.getUserByTgId(telegramId)
      if (!user) {
        this.logger.warn({
          msg: `Пользователь с Telegram ID ${telegramId} не найден`,
          service: this.serviceName,
        })
        return { success: false, message: 'user_not_found' }
      }

      if (user.subscriptions.length >= user.role.limitSubscriptions) {
        this.logger.warn({
          msg: `Превышен лимит подписок для пользователя с Telegram ID ${telegramId}`,
          service: this.serviceName,
        })
        return { success: false, message: 'subscription_limit_exceeded' }
      }

      const getServers = await this.prismaService.greenList.findMany({
        where: {
          code: {
            in: servers,
          },
        },
      })

      const baseServers = getServers.filter((server) => !server.isPremium)
      const premiumServers = getServers.filter((server) => server.isPremium)

      const settings = await this.prismaService.settings.findFirst()
      if (!settings) {
        this.logger.error({
          msg: 'Настройки не найдены',
          service: this.serviceName,
        })
        return { success: false, message: 'settings_not_found' }
      }

      const getPlan = await this.prismaService.plans.findUnique({
        where: {
          key: planKey,
        },
      })

      if (!getPlan) {
        return { success: false, message: 'plan_not_found' }
      }

      const resolvedTrafficLimitGb = trafficLimitGb ?? getPlan.trafficLimitGb

      const cost = calculateSubscriptionCost({
        period: period,
        plan: getPlan as PlansInterface,
        isPremium: user.telegramData.isPremium,
        isTgProgramPartner: user.isTgProgramPartner,
        periodMultiplier,
        devicesCount,
        isAllBaseServers,
        isAllPremiumServers,
        isUnlimitTraffic,
        userDiscount: user.role.discount,
        settings: settings,
        serversCount: baseServers.length,
        premiumServersCount: premiumServers.length,
        trafficLimitGb: resolvedTrafficLimitGb,
      })

      if (method == 'BALANCE' || method == 'USDT') {
        const deductionAmount =
          method === 'USDT' ? cost * settings.tgStarsToUSD : cost
        const deductionBalanceType =
          method === 'USDT' ? BalanceTypeEnum.USDT : BalanceTypeEnum.PAYMENT

        if (!Number.isFinite(deductionAmount) || deductionAmount < 0) {
          this.logger.error({
            msg: `Некорректная сумма списания при покупке подписки`,
            userId: user.id,
            deductionAmount,
            cost,
            method,
            service: this.serviceName,
          })
          return { success: false, message: 'invalid_subscription_cost' }
        }

        const deductResult = await this.userService.deductUserBalance(
          user.id,
          deductionAmount,
          TransactionReasonEnum.SUBSCRIPTIONS,
          deductionBalanceType,
        )

        if (!deductResult.success) {
          this.logger.warn({
            msg: `Недостаточно средств для покупки подписки`,
            userId: user.id,
            cost,
            service: this.serviceName,
          })
          return { success: false, message: 'insufficient_balance' }
        }

        const subscription = await this.createSubscription({
          isPremium: user.telegramData.isPremium,
          name,
          planKey,
          period,
          periodMultiplier,
          nextRenewalStars: cost,
          devicesCount,
          isAllBaseServers,
          isAllPremiumServers,
          trafficReset,
          trafficLimitGb: resolvedTrafficLimitGb,
          isUnlimitTraffic,
          servers,
          isAutoRenewal,
          telegramId,
        })

        if (!subscription) {
          // FIX #8: rollback balance with critical-level logging on failure
          const rollbackResult = await this.userService.addUserBalance(
            user.id,
            deductionAmount,
            TransactionReasonEnum.SUBSCRIPTIONS,
            deductionBalanceType,
          )

          if (!rollbackResult.success) {
            this.logger.error({
              msg: `CRITICAL: Не удалось вернуть средства после ошибки создания подписки`,
              userId: user.id,
              deductionAmount,
              deductionBalanceType,
              service: this.serviceName,
            })
          }

          this.logger.error({
            msg: `Не удалось создать подписку для пользователя с Telegram ID: ${telegramId}`,
            service: this.serviceName,
          })
          return { success: false, message: 'subscription_creation_failed' }
        }

        this.logger.info({
          msg: `Подписка успешно куплена пользователем с Telegram ID: ${telegramId}`,
          subscriptionId: subscription.id,
          service: this.serviceName,
        })

        return { success: true, subscription }
      }

      const invoice = await this.paymentsService.createInvoice(
        cost,
        method,
        user.telegramId,
        PaymentTypeEnum.PAY_SUBSCRIPTION,
        {
          isPremium: user.telegramData.isPremium,
          name,
          planKey,
          period,
          periodMultiplier,
          nextRenewalStars: cost,
          devicesCount,
          isAllBaseServers,
          isAllPremiumServers,
          trafficReset,
          trafficLimitGb: resolvedTrafficLimitGb,
          isUnlimitTraffic,
          servers,
          isAutoRenewal,
          telegramId,
        },
      )

      return { success: true, invoice }
    } catch (error) {
      this.logger.error({
        msg: `Ошибка при покупке подписки для пользователя с Telegram ID: ${telegramId}`,
        error,
        stack: error instanceof Error ? error.stack : undefined,
        service: this.serviceName,
      })
      return {
        success: false,
        message: error instanceof Error ? error.message : 'unknown_error',
      }
    }
  }

  public async deleteSubscription(
    telegramId: string,
    subscriptionId: string,
  ): Promise<{ success: boolean; message?: string }> {
    try {
      this.logger.info({
        msg: `Запрос на удаление подписки ${subscriptionId} от пользователя с Telegram ID: ${telegramId}`,
        service: this.serviceName,
      })

      const user = await this.userService.getUserByTgId(telegramId)
      if (!user) {
        this.logger.warn({
          msg: `Пользователь с Telegram ID ${telegramId} не найден`,
          service: this.serviceName,
        })
        return { success: false, message: 'user_not_found' }
      }

      const subscription = await this.prismaService.subscriptions.findFirst({
        where: {
          id: subscriptionId,
          userId: user.id,
        },
      })

      if (!subscription) {
        this.logger.warn({
          msg: `Подписка ${subscriptionId} не найдена или не принадлежит пользователю ${telegramId}`,
          service: this.serviceName,
        })
        return { success: false, message: 'subscription_not_found' }
      }

      const marzbanResult = await this.marzbanService.modifyUser(
        subscription.username,
        {
          status: 'disabled',
        },
      )
      if (!marzbanResult) {
        this.logger.error({
          msg: `Не удалось удалить пользователя ${subscription.username} из Marzban`,
          service: this.serviceName,
        })

        return { success: false, message: 'marzban_error' }
      }

      await this.prismaService.subscriptions.update({
        where: {
          id: subscriptionId,
        },
        data: {
          isActive: false,
          deletedAt: new Date(),
          removalAt: null,
        },
      })

      this.logger.info({
        msg: `Подписка ${subscriptionId} успешно удалена для пользователя ${telegramId}`,
        service: this.serviceName,
      })

      return { success: true }
    } catch (error) {
      this.logger.error({
        msg: `Ошибка при удалении подписки для пользователя с Telegram ID: ${telegramId}`,
        error,
        stack: error instanceof Error ? error.stack : undefined,
        service: this.serviceName,
      })
      return { success: false, message: 'internal_error' }
    }
  }

  public async renewSubscription(
    telegramId: string,
    subscriptionId: string,
    method: PaymentMethodEnum | 'BALANCE' | 'USDT',
    isSavePeriod: boolean,
    period: SubscriptionPeriodEnum,
    periodMultiplier: number,
    trafficReset: TrafficResetEnum,
  ) {
    try {
      this.logger.info({
        msg: `Manual subscription renewal requested for user with Telegram ID: ${telegramId}, subscription ID: ${subscriptionId}`,
        service: this.serviceName,
      })

      const user = await this.userService.getUserByTgId(telegramId)
      if (!user) {
        this.logger.warn({
          msg: `User with Telegram ID ${telegramId} not found`,
          service: this.serviceName,
        })
        return { success: false, message: 'user_not_found' }
      }

      const subscription = await this.prismaService.subscriptions.findFirst({
        where: {
          id: subscriptionId,
          userId: user.id,
        },
        include: {
          plan: true,
          servers: {
            include: {
              greenList: true,
            },
          },
        },
      })

      if (!subscription) {
        this.logger.warn({
          msg: `Subscription with ID ${subscriptionId} not found or does not belong to user with Telegram ID ${telegramId}`,
          service: this.serviceName,
        })
        return { success: false, message: 'subscription_not_found' }
      }

      const settings = await this.prismaService.settings.findUnique({
        where: {
          key: DefaultEnum.DEFAULT,
        },
      })
      if (!settings) {
        this.logger.error({
          msg: 'Настройки не найдены',
          service: this.serviceName,
        })
        return {
          success: false,
          message: 'settings_not_found',
        }
      }

      const cost = calculateSubscriptionCost({
        isPremium: user.telegramData.isPremium,
        isTgProgramPartner: user.isTgProgramPartner,
        period,
        periodMultiplier,
        devicesCount: subscription.devicesCount,
        serversCount: subscription.isAllBaseServers
          ? await this.prismaService.greenList.count({
              where: { isActive: true, isPremium: false },
            })
          : subscription.servers.filter((s) => !s.greenList.isPremium).length,
        premiumServersCount: subscription.isAllPremiumServers
          ? await this.prismaService.greenList.count({
              where: { isActive: true, isPremium: true },
            })
          : subscription.servers.filter((s) => s.greenList.isPremium).length,
        isAllBaseServers: subscription.isAllBaseServers,
        isAllPremiumServers: subscription.isAllPremiumServers,
        trafficLimitGb: subscription.trafficLimitGb,
        isUnlimitTraffic: subscription.isUnlimitTraffic,
        userDiscount: user.role.discount,
        plan: subscription.plan as unknown as PlansInterface,
        settings,
      })

      if (method === 'BALANCE' || method === 'USDT') {
        const deductionAmount =
          method === 'USDT' ? cost * settings.tgStarsToUSD : cost
        const deductionBalanceType =
          method === 'USDT' ? BalanceTypeEnum.USDT : BalanceTypeEnum.PAYMENT

        const updateBalance = await this.userService.deductUserBalance(
          user.id,
          deductionAmount,
          TransactionReasonEnum.SUBSCRIPTIONS,
          deductionBalanceType,
        )

        if (!updateBalance.success) {
          this.logger.error({
            msg: `Ошибка при изменении баланса пользователя: ${updateBalance}`,
            service: this.serviceName,
          })
          return {
            success: false,
            message: 'Error changing user balance',
          }
        }

        const updateSub = await this.renewSubFinaly(
          user.id,
          subscriptionId,
          isSavePeriod,
          period,
          periodMultiplier,
          trafficReset,
        )

        if (!updateSub || !updateSub.success) {
          // FIX #8: rollback with critical logging
          const rollbackResult = await this.userService.addUserBalance(
            user.id,
            deductionAmount,
            TransactionReasonEnum.SUBSCRIPTIONS,
            deductionBalanceType,
          )

          if (!rollbackResult.success) {
            this.logger.error({
              msg: `CRITICAL: Не удалось вернуть средства после ошибки продления подписки`,
              userId: user.id,
              deductionAmount,
              deductionBalanceType,
              service: this.serviceName,
            })
          }

          this.logger.error({
            msg: `Ошибка при продлении подписки: ${updateSub}`,
            service: this.serviceName,
          })
          return {
            success: false,
            message: 'Error renewing subscription',
          }
        }

        return {
          success: true,
        }
      }

      const invoice = await this.paymentsService.createInvoice(
        cost,
        method,
        user.telegramId,
        PaymentTypeEnum.UPDATE_SUBSCTIPTION,
        {
          subscriptionId,
          isSavePeriod,
          period,
          periodMultiplier,
          trafficReset,
        },
        subscriptionId,
      )

      return {
        success: true,
        invoice,
      }
    } catch (error) {
      this.logger.error({
        msg: `Error renewing subscription for user with Telegram ID: ${telegramId}`,
        error,
        stack: error instanceof Error ? error.stack : undefined,
        service: this.serviceName,
      })
      return {
        success: false,
        message: error instanceof Error ? error.message : 'unknown_error',
      }
    }
  }

  public async renewSubFinaly(
    userId: string,
    subscriptionId: string,
    isSavePeriod: boolean,
    period: SubscriptionPeriodEnum,
    periodMultiplier: number,
    trafficReset: TrafficResetEnum,
  ) {
    try {
      const user = await this.prismaService.users.findUnique({
        where: {
          id: userId,
        },
        include: {
          telegramData: true,
        },
      })
      if (!user) {
        this.logger.warn({
          msg: `User with ID ${userId} not found`,
          service: this.serviceName,
        })
        return { success: false, message: 'user_not_found' }
      }

      const subscription = await this.prismaService.subscriptions.findFirst({
        where: {
          id: subscriptionId,
          userId,
        },
      })

      if (!subscription) {
        this.logger.warn({
          msg: `Subscription with ID ${subscriptionId} not found or does not belong to user with ID ${userId}`,
          service: this.serviceName,
        })
        return { success: false, message: 'subscription_not_found' }
      }

      const hours = periodHours(period, periodMultiplier)
      if (hours <= 0) {
        this.logger.error({
          msg: `Invalid subscription period: ${period}`,
          service: this.serviceName,
        })
        return { success: false, message: 'invalid_period' }
      }

      const now = new Date()
      const newExpiredAt =
        period === SubscriptionPeriodEnum.INDEFINITELY
          ? null
          : subscription.expiredAt > now
          ? addHours(subscription.expiredAt, hours)
          : addHours(now, hours)

      const marzbanUser = await this.marzbanService.modifyUser(
        subscription.username,
        {
          status: 'active',
          ...(!subscription.isUnlimitTraffic && {
            data_limit_reset_strategy:
              trafficReset.toLowerCase() || TrafficResetEnum.DAY.toLowerCase(),
            data_limit:
              subscription.trafficLimitGb *
              1024 *
              1024 *
              1024 *
              (trafficReset == TrafficResetEnum.DAY
                ? 1
                : trafficReset == TrafficResetEnum.WEEK
                ? 7
                : trafficReset == TrafficResetEnum.MONTH
                ? 30
                : trafficReset == TrafficResetEnum.YEAR
                ? 365
                : 1),
          }),
        },
      )

      if (this.configService.getOrThrow<string>('NODE_ENV') === 'production') {
        await this.marzbanService.restartCore()
      }

      if (!marzbanUser) {
        this.logger.error({
          msg: `Failed to activate user ${subscription.username} in Marzban`,
          service: this.serviceName,
        })

        return { success: false, message: 'marzban_error' }
      }

      this.logger.info({
        msg: `User ${subscription.username} successfully activated in Marzban`,
        service: this.serviceName,
      })

      const updatedSubscription = await this.prismaService.subscriptions.update(
        {
          where: {
            id: subscription.id,
          },
          data: {
            period:
              period === SubscriptionPeriodEnum.INDEFINITELY
                ? period
                : isSavePeriod
                ? period
                : (subscription.period as SubscriptionPeriodEnum),
            periodMultiplier: isSavePeriod
              ? periodMultiplier
              : subscription.periodMultiplier,
            expiredAt: newExpiredAt,
            trafficReset: trafficReset,
            isActive: true,
            announce: null,
          },
        },
      )

      if (!updatedSubscription) {
        return { success: false, message: 'marzban_error' }
      }

      this.logger.info({
        msg: `Subscription successfully renewed by user with Telegram ID: ${user.telegramId}`,
        service: this.serviceName,
      })

      await this.bot.telegram
        .sendMessage(
          Number(process.env.TELEGRAM_LOG_CHAT_ID),
          `<b>🍥 ПРОДЛЕНИЕ ПОДПИСКИ</b>
<b>👤 Пользователь:</b> ${
            user.telegramData?.username ? `@${user.telegramData?.username}` : ''
          } <code>${user.telegramData?.firstName || ''} ${
            user.telegramData?.lastName || ''
          }</code>
<b>🪪 User ID:</b> <code>${updatedSubscription.userId}</code>
<b>🆔 Telegram ID:</b> <code>${user.telegramId}</code>
<b>Имя:</b> <code>${updatedSubscription.name}</code>
<b>Username :</b> <code>${updatedSubscription.username}</code>
<b>Тариф:</b> <code>${updatedSubscription.planKey}</code>
<b>📅 Дата истечения:</b> <code>${
            updatedSubscription.expiredAt == null
              ? '♾️'
              : updatedSubscription.expiredAt
          }</code>
<b>🔁 Автопродление:</b> <code>${
            updatedSubscription.isAutoRenewal ? '✅' : '🚫'
          }</code>
<b>Множитель периода:</b> <code>x${updatedSubscription.periodMultiplier}</code>
<b>Цена следующей оплаты:</b> <code>${
            updatedSubscription.nextRenewalStars
          }</code>
<b>⭐ Премиум:</b> <code>${updatedSubscription.isPremium ? '✅' : '🚫'}</code>
<b>📱 Устройства:</b> <code>${updatedSubscription.devicesCount}</code> шт.
<b>Все базовые сервера:</b> <code>${
            updatedSubscription.isAllBaseServers ? '✅' : '🚫'
          }</code>
<b>Все премиум сервера:</b> <code>${
            updatedSubscription.isAllPremiumServers ? '✅' : '🚫'
          }</code>
<b>📉 Лимит трафика:</b> <code>${
            // FIX #9: usedTraffic stored in MB — display as MB, no extra division
            updatedSubscription.usedTraffic
          } MB</code>/<code>${
            updatedSubscription.trafficLimitGb *
            (trafficReset == TrafficResetEnum.DAY
              ? 1
              : trafficReset == TrafficResetEnum.WEEK
              ? 7
              : trafficReset == TrafficResetEnum.MONTH
              ? 30
              : trafficReset == TrafficResetEnum.YEAR
              ? 365
              : 1)
          } GB</code>
<b>Сброс трафика:</b> <code>${updatedSubscription.trafficReset}</code>
<b>♾️ Безлимит:</b> <code>${
            updatedSubscription.isUnlimitTraffic ? '✅' : '🚫'
          }</code>
`,
          {
            parse_mode: 'HTML',
            message_thread_id: Number(
              process.env.TELEGRAM_THREAD_ID_SUBSCRIPTIONS,
            ),
          },
        )
        .catch((e) => {
          this.logger.error({
            msg: `Error while sending message to telegram`,
            e,
          })
        })
        .then(() => {
          this.logger.info({
            msg: `Message sent to telegram`,
          })
        })

      return { success: true, subscription: updatedSubscription }
    } catch (error) {
      this.logger.error({
        msg: `Error renewing subscription for user with User ID: ${userId}`,
        error,
        stack: error instanceof Error ? error.stack : undefined,
        service: this.serviceName,
      })
      return {
        success: false,
        message: error instanceof Error ? error.message : 'unknown_error',
      }
    }
  }

  public async resetSubscriptionToken(
    telegramId: string,
    subscriptionId: string,
  ): Promise<{ success: boolean; message?: string; subscriptionUrl?: string }> {
    try {
      this.logger.info({
        msg: `Запрос на сброс токена подписки ${subscriptionId} от пользователя с Telegram ID: ${telegramId}`,
        service: this.serviceName,
      })

      const user = await this.userService.getUserByTgId(telegramId)
      if (!user) {
        this.logger.warn({
          msg: `Пользователь с Telegram ID ${telegramId} не найден`,
          service: this.serviceName,
        })
        return { success: false, message: 'user_not_found' }
      }

      const subscription = await this.prismaService.subscriptions.findFirst({
        where: {
          id: subscriptionId,
          userId: user.id,
        },
      })

      if (!subscription) {
        this.logger.warn({
          msg: `Подписка ${subscriptionId} не найдена или не принадлежит пользователю ${telegramId}`,
          service: this.serviceName,
        })
        return { success: false, message: 'subscription_not_found' }
      }

      const marzbanResult = await this.marzbanService.revokeSubscription(
        subscription.username,
      )
      if (!marzbanResult) {
        this.logger.error({
          msg: `Не удалось отозвать подписку для пользователя ${subscription.username} в Marzban`,
          service: this.serviceName,
        })
      }

      const newToken = genToken()

      await this.prismaService.subscriptions.update({
        where: {
          id: subscriptionId,
        },
        data: {
          token: newToken,
          marzbanData:
            marzbanResult === null
              ? Prisma.DbNull
              : (marzbanResult as unknown as Prisma.InputJsonValue),
        },
      })

      this.logger.info({
        msg: `Токен подписки ${subscriptionId} успешно сброшен для пользователя ${telegramId}`,
        service: this.serviceName,
      })

      return { success: true }
    } catch (error) {
      this.logger.error({
        msg: `Ошибка при сбросе токена подписки для пользователя с Telegram ID: ${telegramId}`,
        error,
        stack: error instanceof Error ? error.stack : undefined,
        service: this.serviceName,
      })
      return { success: false, message: 'internal_error' }
    }
  }

  public async toggleAutoRenewal(subscriptionId: string, telegramId: string) {
    try {
      this.logger.info({
        msg: `Переключение статуса автопродления для подписки с ID: ${subscriptionId}, пользователь: ${telegramId}`,
        service: this.serviceName,
      })

      const user = await this.userService.getUserByTgId(telegramId)
      if (!user) {
        this.logger.warn({
          msg: `Пользователь с Telegram ID ${telegramId} не найден`,
          service: this.serviceName,
        })
        return { success: false, message: 'user_not_found' }
      }

      const subscription = await this.prismaService.subscriptions.findFirst({
        where: {
          id: subscriptionId,
          userId: user.id,
        },
      })

      if (!subscription) {
        this.logger.warn({
          msg: `Подписка с ID ${subscriptionId} не найдена или не принадлежит пользователю ${telegramId}`,
          service: this.serviceName,
        })
        return { success: false, message: 'subscription_not_found' }
      }

      const updatedSubscription = await this.prismaService.subscriptions.update(
        {
          where: {
            id: subscriptionId,
          },
          data: {
            isAutoRenewal: !subscription.isAutoRenewal,
          },
        },
      )

      this.logger.info({
        msg: `Статус автопродления успешно изменен для подписки ${subscriptionId}, новое значение: ${updatedSubscription.isAutoRenewal}`,
        service: this.serviceName,
      })

      return {
        success: true,
        isAutoRenewal: updatedSubscription.isAutoRenewal,
      }
    } catch (error) {
      this.logger.error({
        msg: `Ошибка при переключении статуса автопродления для подписки ${subscriptionId}`,
        error,
        stack: error instanceof Error ? error.stack : undefined,
        service: this.serviceName,
      })
      return { success: false, message: 'internal_error' }
    }
  }
}
