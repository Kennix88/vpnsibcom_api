import { Prisma } from '@core/prisma/generated/client'
import { PrismaService } from '@core/prisma/prisma.service'
import { RedisService } from '@core/redis/redis.service'
import { PaymentsService } from '@modules/payments/services/payments.service'
import { PlansServersSelectTypeEnum } from '@modules/plans/types/plans-servers-select-type.enum'
import { PlansEnum } from '@modules/plans/types/plans.enum'
import { EventsService } from '@modules/users/services/events.service'
import { UsersService } from '@modules/users/services/users.service'
import { forwardRef, Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { BalanceTypeEnum } from '@shared/enums/balance-type.enum'
import { DefaultEnum } from '@shared/enums/default.enum'
import { SubscriptionPeriodEnum } from '@shared/enums/subscription-period.enum'
import { TrafficResetEnum } from '@shared/enums/traffic-reset.enum'
import { TransactionReasonEnum } from '@shared/enums/transaction-reason.enum'
import { TransactionTypeEnum } from '@shared/enums/transaction-type.enum'
import { genToken } from '@shared/utils/gen-token.util'
import { I18nService } from 'nestjs-i18n'
import { PinoLogger } from 'nestjs-pino'
import { InjectBot } from 'nestjs-telegraf'
import { Telegraf } from 'telegraf'
import { ServerDataInterface } from '../types/servers-data.interface'
import {
  GetSubscriptionConfigResponseInterface,
  SubscriptionDataInterface,
  SubscriptionResponseInterface,
} from '../types/subscription-data.interface'
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
      // const subscriptionUrl = `${allowedOrigin}/sub/${subscription.token}`
      const subscriptionUrl =
        'happ://crypt5/fzvdgqNr9OJMbqUegYzarjvM108MTu8gTcX/YH9X2txQ8zaZpbwMA+JxBuunRLP92iRaj7KA28c2VdoVTkDKAvEr+MSAa8aAIDLrTby0950uKOu/tISsegtPiHUXo+ysVLI7Tc/xZzI=bwCER8jknmbfRBGjwrG3a6+iZj05z2Za8vbYJiLF8xRsVnqZ2M4j76tWOzIoIphSheu+JQSHnJAOf9zrdTfHuINkAnWVqwlLMLrpoE2/wVNHT9h7GCWceMDBl0EJ4BYpIfjqGU/V4NQC903lH3jZcdDOKt9mMS8zlVL5Iah2XJABHKNu72HXEUOJF2DqAB/gWIxOencCrwDFeeOKtaSF2BM/+zWsylIszAENOgq0EvLSs7yOKLeRgndjpZ6QKrH4zUDoCy++pB1WoisC/mT/lIwtIPq2lj/upJummLfWGfaSA9Svzka+iwzrSEPnpwFU0lRFldgkAftJY2OsDYNLXSqgHVSBO7GOGhG5gCFNjNnp6HZBoxlHEeB4oI1UzjsvJELC0dZUqzS8/JHGAYGaUV3mKUeW9k6Dx4SZ2xPquSJ7SYyG83lRB5h3v/yC3orxp4bLD6dd7WL7xc5gB9/zlOGAbseiJiR4k75WZhueL5uutbMtEHjKkwDsvHEt579Z+ArxTdIFW6J0ychpFzyB0XxxeEo2QZpNUy7s8l5FcGcIEUdr1c1H/dwrM8vmj4dG6TcamnpSY0/9hxzXf7bNmQ1ktSwdbr2+k7zkso1bx9AQ6MCoM9fxaj3mi/S8a1/r9ZxxooR/oco24YN4TOgZSsmgQaD6IpffhIKJEaTffoI=ff'
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
          // subscriptionUrl: `${allowedOrigin}/sub/${subscription.token}`,
          subscriptionUrl: `happ://crypt5/fzvdgqNr9OJMbqUegYzarjvM108MTu8gTcX/YH9X2txQ8zaZpbwMA+JxBuunRLP92iRaj7KA28c2VdoVTkDKAvEr+MSAa8aAIDLrTby0950uKOu/tISsegtPiHUXo+ysVLI7Tc/xZzI=bwCER8jknmbfRBGjwrG3a6+iZj05z2Za8vbYJiLF8xRsVnqZ2M4j76tWOzIoIphSheu+JQSHnJAOf9zrdTfHuINkAnWVqwlLMLrpoE2/wVNHT9h7GCWceMDBl0EJ4BYpIfjqGU/V4NQC903lH3jZcdDOKt9mMS8zlVL5Iah2XJABHKNu72HXEUOJF2DqAB/gWIxOencCrwDFeeOKtaSF2BM/+zWsylIszAENOgq0EvLSs7yOKLeRgndjpZ6QKrH4zUDoCy++pB1WoisC/mT/lIwtIPq2lj/upJummLfWGfaSA9Svzka+iwzrSEPnpwFU0lRFldgkAftJY2OsDYNLXSqgHVSBO7GOGhG5gCFNjNnp6HZBoxlHEeB4oI1UzjsvJELC0dZUqzS8/JHGAYGaUV3mKUeW9k6Dx4SZ2xPquSJ7SYyG83lRB5h3v/yC3orxp4bLD6dd7WL7xc5gB9/zlOGAbseiJiR4k75WZhueL5uutbMtEHjKkwDsvHEt579Z+ArxTdIFW6J0ychpFzyB0XxxeEo2QZpNUy7s8l5FcGcIEUdr1c1H/dwrM8vmj4dG6TcamnpSY0/9hxzXf7bNmQ1ktSwdbr2+k7zkso1bx9AQ6MCoM9fxaj3mi/S8a1/r9ZxxooR/oco24YN4TOgZSsmgQaD6IpffhIKJEaTffoI=ff`,
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
