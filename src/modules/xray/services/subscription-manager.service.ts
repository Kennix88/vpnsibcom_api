import { LoggerTelegramService } from '@core/logger/logger-telegram.service'
import { DefaultEnum } from '@core/prisma/generated/enums'
import { PrismaService } from '@core/prisma/prisma.service'
import { RedisService } from '@core/redis/redis.service'
import { PlansEnum } from '@modules/plans/types/plans.enum'
import { PlansInterface } from '@modules/plans/types/plans.interface'
import { UsersService } from '@modules/users/services/users.service'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Cron, CronExpression } from '@nestjs/schedule'
import { SubscriptionPeriodEnum } from '@shared/enums/subscription-period.enum'
import { TrafficResetEnum } from '@shared/enums/traffic-reset.enum'
import { add, intlFormat } from 'date-fns'
import { I18nService } from 'nestjs-i18n'
import { PinoLogger } from 'nestjs-pino'
import { calculateSubscriptionCost } from '../utils/calculate-subscription-cost.util'
import { MarzbanService } from './marzban.service'
import { XrayService } from './xray.service'

/**
 * Service for managing subscriptions lifecycle
 */
@Injectable()
export class SubscriptionManagerService {
  private readonly serviceName = 'SubscriptionManagerService'

  constructor(
    private readonly prismaService: PrismaService,
    private readonly logger: PinoLogger,
    private readonly i18n: I18nService,
    private readonly redis: RedisService,
    private readonly marzbanService: MarzbanService,
    private readonly xrayService: XrayService,
    private readonly telegramLogger: LoggerTelegramService,
    private readonly configService: ConfigService,
    private readonly userService: UsersService,
  ) {}

  /**
   * Updates subscription data with information from Marzban service
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async subscriptionsUpdater() {
    if (process.env.NODE_ENV !== 'production') return
    await this.redis.withLock(
      'subscriptionsUpdaterLock',
      70,
      async () => {
        this.logger.info({
          msg: 'Starting subscriptions update process',
          service: this.serviceName,
        })

        try {
          const settings = await this.prismaService.settings.findFirst()
          if (!settings) {
            this.logger.error({
              msg: 'Settings not found',
              service: this.serviceName,
            })
            return
          }

          const [marzbanUsers, subscriptions] = await Promise.all([
            this.marzbanService.getUsers(),
            this.prismaService.subscriptions.findMany({
              where: {
                planKey: {
                  not: PlansEnum.NEW_ERA,
                },
              },
              include: {
                user: {
                  include: {
                    language: true,
                    balance: true,
                    role: true,
                  },
                },
                plan: true,
                servers: {
                  include: {
                    greenList: true,
                  },
                },
              },
            }),
          ])

          const getConfigName = (link: string): string => {
            const hashIndex = link.lastIndexOf('#')
            if (hashIndex === -1) return ''

            const configNameEncoded = link.slice(hashIndex + 1)
            try {
              return decodeURIComponent(configNameEncoded)
            } catch {
              return configNameEncoded
            }
          }

          const isTelegramOnlyConfig = (link: string): boolean =>
            getConfigName(link).toLowerCase().includes('telegram')

          const telegramMarzbanUser = marzbanUsers.users.find(
            (user) => user.username === 'telegram',
          )

          const globalTelegramOnlyLinks = telegramMarzbanUser
            ? telegramMarzbanUser.links.filter((link) =>
                isTelegramOnlyConfig(link),
              )
            : []

          await this.prismaService.settings.update({
            where: { key: DefaultEnum.DEFAULT },
            data: {
              telegramConfigLinks: {
                links: globalTelegramOnlyLinks,
              },
            },
          })

          this.logger.info({
            msg: `Found ${subscriptions.length} subscriptions to update`,
            service: this.serviceName,
          })

          const batchSize = 50
          const batches = []

          for (let i = 0; i < subscriptions.length; i += batchSize) {
            batches.push(subscriptions.slice(i, i + batchSize))
          }

          let updatedCount = 0

          for (const batch of batches) {
            const updatedBatch = await Promise.all(
              batch.map(async (subscription) => {
                const marzbanUser = marzbanUsers.users.find(
                  (user) => user.username === subscription.username,
                )

                if (!marzbanUser) {
                  this.logger.warn({
                    msg: `Marzban user not found for subscription ${subscription.id}`,
                    username: subscription.username,
                    service: this.serviceName,
                  })
                  return subscription
                }

                let baseServers = 0
                let premiumServers = 0

                const serverCodes =
                  subscription.isAllBaseServers &&
                  subscription.isAllPremiumServers
                    ? []
                    : subscription.servers
                        ?.flatMap((server) => {
                          if (server.greenList.isPremium) premiumServers++
                          else baseServers++
                          return server.greenList.green
                        })
                        .filter(Boolean)

                const filteredLinks = marzbanUser.links.filter((link) => {
                  if (!serverCodes.length) return true
                  return serverCodes.some((code) => link.includes(`${code}`))
                })

                let nextRenewalStars = null

                if (
                  subscription.period !== SubscriptionPeriodEnum.INDEFINITELY &&
                  subscription.plan.key !== PlansEnum.TRIAL &&
                  subscription.plan.key !== PlansEnum.TRAFFIC
                ) {
                  nextRenewalStars = calculateSubscriptionCost({
                    plan: subscription.plan as PlansInterface,
                    period: subscription.period as SubscriptionPeriodEnum,
                    isPremium: subscription.isPremium,
                    isTgProgramPartner: subscription.user.isTgProgramPartner,
                    periodMultiplier: subscription.periodMultiplier,
                    devicesCount: subscription.devicesCount,
                    isAllBaseServers: subscription.isAllBaseServers,
                    isAllPremiumServers: subscription.isAllPremiumServers,
                    isUnlimitTraffic: subscription.isUnlimitTraffic,
                    userDiscount: subscription.user.role.discount,
                    settings: settings,
                    serversCount: baseServers,
                    premiumServersCount: premiumServers,
                    trafficLimitGb: subscription.trafficLimitGb,
                  })
                }

                return {
                  ...subscription,
                  links: filteredLinks,
                  nextRenewalStars,
                  usedTraffic: marzbanUser.used_traffic,
                  lastUserAgent: marzbanUser.sub_last_user_agent,
                  dataLimit: marzbanUser.data_limit,
                  lifeTimeUsedTraffic: marzbanUser.lifetime_used_traffic,
                  onlineAt: marzbanUser.online_at,
                  marzbanData: marzbanUser,
                }
              }),
            )

            await this.prismaService.$transaction(
              updatedBatch.map((subscription) => {
                const announceMessages = []
                const removalAt = new Date(add(new Date(), { days: 30 }))
                let isRemovalAt = false
                let isNotAnnounce = false

                if (
                  subscription.usedTraffic >= subscription.dataLimit &&
                  !subscription.isUnlimitTraffic &&
                  subscription.announce == null
                ) {
                  announceMessages.push(
                    this.i18n.t('subscription.traffic_exhausted', {
                      lang: subscription.user.language.iso6391,
                    }),
                  )

                  if (
                    subscription.plan.key == PlansEnum.TRAFFIC ||
                    subscription.plan.key == PlansEnum.TRIAL
                  ) {
                    announceMessages.push(
                      this.i18n.t(
                        'subscription.buy_more_traffic_and_expiration',
                        {
                          lang: subscription.user.language.iso6391,
                          args: {
                            date: intlFormat(
                              new Date(removalAt),
                              {
                                year: 'numeric',
                                month: 'numeric',
                                day: 'numeric',
                                hour: 'numeric',
                                minute: 'numeric',
                              },
                              {
                                locale: subscription.user.language.iso6391,
                              },
                            ),
                          },
                        },
                      ),
                    )
                    isRemovalAt = true
                  } else {
                    const updateTraffic =
                      subscription.trafficReset == TrafficResetEnum.DAY
                        ? this.i18n.t('subscription.traffic_reset_day', {
                            lang: subscription.user.language.iso6391,
                          })
                        : subscription.trafficReset == TrafficResetEnum.WEEK
                        ? this.i18n.t('subscription.traffic_reset_week', {
                            lang: subscription.user.language.iso6391,
                          })
                        : subscription.trafficReset == TrafficResetEnum.MONTH
                        ? this.i18n.t('subscription.traffic_reset_month', {
                            lang: subscription.user.language.iso6391,
                          })
                        : subscription.trafficReset == TrafficResetEnum.YEAR
                        ? this.i18n.t('subscription.traffic_reset_year', {
                            lang: subscription.user.language.iso6391,
                          })
                        : ''
                    announceMessages.push(updateTraffic)
                  }
                } else if (
                  subscription.usedTraffic < subscription.dataLimit ||
                  subscription.isUnlimitTraffic
                ) {
                  isNotAnnounce = true
                }

                if (announceMessages.length > 0 && !isNotAnnounce) {
                  this.telegramLogger.sendMessage({
                    chatId: Number(subscription.user.telegramId),
                    text: `${subscription.name}: ${announceMessages.join(' ')}`,
                  })
                }

                const defaultAnnounce = settings.defaultAnnounce

                const announce =
                  announceMessages.length > 0
                    ? `${announceMessages.join(' ')}${
                        defaultAnnounce ? `\n${defaultAnnounce}` : ''
                      }`
                    : defaultAnnounce
                    ? defaultAnnounce
                    : isNotAnnounce
                    ? null
                    : undefined

                const linksWithoutOwnTelegramOnly = subscription.links.filter(
                  (link: string) => !isTelegramOnlyConfig(link),
                )

                const links = Array.from(
                  new Set([
                    ...linksWithoutOwnTelegramOnly,
                    ...globalTelegramOnlyLinks,
                  ]),
                )

                const isTrafficOrTrialExhausted =
                  (subscription.plan.key == PlansEnum.TRAFFIC ||
                    subscription.plan.key == PlansEnum.TRIAL) &&
                  subscription.usedTraffic >= subscription.dataLimit

                const linksForUpdate = isTrafficOrTrialExhausted
                  ? globalTelegramOnlyLinks
                  : links

                return this.prismaService.subscriptions.update({
                  where: { id: subscription.id },
                  data: {
                    links: linksForUpdate,
                    // FIX #12: discount == 0 means NO discount (full price), so
                    // nextRenewalStars should be kept as-is.
                    // Only zero the price when discount is 100 (fully free role).
                    nextRenewalStars:
                      subscription.user.role.discount >= 100
                        ? 0
                        : subscription.nextRenewalStars,
                    usedTraffic: subscription.usedTraffic / 1024 / 1024,
                    dataLimit: subscription.dataLimit / 1024 / 1024,
                    lifeTimeUsedTraffic:
                      subscription.lifeTimeUsedTraffic / 1024 / 1024,
                    onlineAt: subscription.onlineAt
                      ? new Date(subscription.onlineAt + 'Z')
                      : null,
                    marzbanData: subscription.marzbanData,
                    ...(isRemovalAt ? { removalAt } : {}),
                    ...(announce === undefined ? {} : { announce }),
                    ...(isTrafficOrTrialExhausted && {
                      isActive: false,
                    }),
                  },
                })
              }),
            )

            updatedCount += updatedBatch.length

            this.logger.info({
              msg: `Updated batch of ${updatedBatch.length} subscriptions`,
              service: this.serviceName,
            })
          }

          this.logger.info({
            msg: `Successfully updated ${updatedCount} subscriptions`,
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
