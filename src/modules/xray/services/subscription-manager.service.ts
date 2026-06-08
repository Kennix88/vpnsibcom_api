import { I18nTranslations } from '@core/i18n/i18n.type'
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
import { BalanceTypeEnum } from '@shared/enums/balance-type.enum'
import { SubscriptionPeriodEnum } from '@shared/enums/subscription-period.enum'
import { TrafficResetEnum } from '@shared/enums/traffic-reset.enum'
import { TransactionReasonEnum } from '@shared/enums/transaction-reason.enum'
import { add, differenceInDays, intlFormat } from 'date-fns'
import { I18nService } from 'nestjs-i18n'
import { PinoLogger } from 'nestjs-pino'
import { calculateSubscriptionCost } from '../utils/calculate-subscription-cost.util'
import { periodHours } from '../utils/period-hours.util'
import { MarzbanService } from './marzban.service'
import { XrayService } from './xray.service'

/**
 * Service for managing subscriptions lifecycle
 */
@Injectable()
export class SubscriptionManagerService {
  private readonly serviceName = 'SubscriptionManagerService'
  private readonly notificationDays = [1, 3, 7]
  private readonly shortTermPeriods = [
    SubscriptionPeriodEnum.HOUR,
    SubscriptionPeriodEnum.DAY,
  ]

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

  // FIX #13: wrapped in Redis lock to prevent parallel execution in multi-pod deployments
  @Cron('0 0 */6 * * *')
  async rebootTelegramConfig() {
    await this.redis.withLock(
      'rebootTelegramConfigLock',
      30,
      async () => {
        try {
          await this.marzbanService.revokeSubscription('telegram')
        } catch (error) {
          this.logger.error({
            msg: 'Failed to reboot Telegram config',
            service: this.serviceName,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      },
      { retries: 0, retryDelayMs: 0, autoRenewIntervalSec: 0 },
    )
  }

  /**
   * Updates subscription data with information from Marzban service
   */
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

  /**
   * Cron job to process expired subscriptions
   * Runs every 5 minutes
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async processExpiredSubscriptions() {
    this.logger.info({
      msg: 'Starting expired subscriptions processing',
      service: this.serviceName,
    })

    try {
      // FIX #1: was using `||` operator which only evaluated to INDEFINITELY.
      // Now correctly uses `notIn` to exclude all three special plan types.
      const expiredSubscriptions =
        await this.prismaService.subscriptions.findMany({
          where: {
            isActive: true,
            period: {
              notIn: [
                SubscriptionPeriodEnum.INDEFINITELY,
                SubscriptionPeriodEnum.TRIAL,
                SubscriptionPeriodEnum.TRAFFIC,
              ],
            },
            planKey: {
              notIn: [PlansEnum.TRAFFIC, PlansEnum.TRIAL],
            },
            expiredAt: {
              not: null,
              lt: new Date(),
            },
          },
          include: {
            servers: {
              include: {
                greenList: true,
              },
            },
            user: {
              include: {
                language: true,
                balance: true,
                role: true,
                telegramData: true,
              },
            },
          },
        })

      this.logger.info({
        msg: `Found ${expiredSubscriptions.length} expired subscriptions`,
        service: this.serviceName,
      })

      for (const subscription of expiredSubscriptions) {
        if (
          subscription.isAutoRenewal &&
          subscription.period !== SubscriptionPeriodEnum.TRIAL &&
          subscription.period !== SubscriptionPeriodEnum.TRAFFIC
        ) {
          await this.processAutoRenewal(subscription)
        } else {
          await this.deactivateSubscription(subscription)
        }
      }

      this.logger.info({
        msg: 'Expired subscriptions processing completed',
        service: this.serviceName,
      })
    } catch (error) {
      this.logger.error({
        msg: 'Error processing expired subscriptions',
        error,
        stack: error instanceof Error ? error.stack : undefined,
        service: this.serviceName,
      })
    }
  }

  /**
   * Process auto-renewal for a subscription.
   * FIX #5: now calls marzbanService.modifyUser to actually re-activate
   * the user after a successful balance deduction.
   */
  private async processAutoRenewal(subscription) {
    this.logger.info({
      msg: `Processing auto-renewal for subscription ${subscription.id}`,
      userId: subscription.userId,
      service: this.serviceName,
    })

    try {
      const user = subscription.user
      const renewalPeriod = subscription.period as SubscriptionPeriodEnum
      const hours = periodHours(renewalPeriod, subscription.periodMultiplier)

      const cost = subscription.nextRenewalStars

      // FIX #12: deduct nothing only when the role grants a 100% discount
      const chargeAmount = subscription.user.role.discount >= 100 ? 0 : cost

      const deductResult = await this.userService.deductUserBalance(
        user.id,
        chargeAmount,
        TransactionReasonEnum.SUBSCRIPTIONS,
        BalanceTypeEnum.PAYMENT,
      )

      if (deductResult.success) {
        // FIX #5: activate the user in Marzban so the VPN actually works
        const marzbanResult = await this.marzbanService.modifyUser(
          subscription.username,
          {
            status: 'active',
            ...(!subscription.isUnlimitTraffic && {
              data_limit_reset_strategy: (
                subscription.trafficReset as string
              ).toLowerCase(),
              data_limit:
                subscription.trafficLimitGb *
                1024 *
                1024 *
                1024 *
                (subscription.trafficReset === TrafficResetEnum.DAY
                  ? 1
                  : subscription.trafficReset === TrafficResetEnum.WEEK
                  ? 7
                  : subscription.trafficReset === TrafficResetEnum.MONTH
                  ? 30
                  : subscription.trafficReset === TrafficResetEnum.YEAR
                  ? 365
                  : 1),
            }),
          },
        )

        if (!marzbanResult) {
          // Balance was deducted but Marzban activation failed — roll back
          this.logger.error({
            msg: `Failed to activate subscription ${subscription.id} in Marzban during auto-renewal; rolling back balance`,
            userId: user.id,
            service: this.serviceName,
          })

          await this.userService.addUserBalance(
            user.id,
            chargeAmount,
            TransactionReasonEnum.SUBSCRIPTIONS,
            BalanceTypeEnum.PAYMENT,
          )

          await this.deactivateSubscription(subscription)
          return
        }

        await this.prismaService.subscriptions.update({
          where: {
            id: subscription.id,
          },
          data: {
            expiredAt: new Date(Date.now() + hours * 60 * 60 * 1000),
            period: renewalPeriod,
            isActive: true,
            announce: null,
          },
        })

        this.logger.info({
          msg: `Successfully renewed subscription ${subscription.id}`,
          userId: user.id,
          period: renewalPeriod,
          service: this.serviceName,
        })
      } else {
        // Not enough balance — deactivate
        await this.deactivateSubscription(subscription)
      }
    } catch (error) {
      this.logger.error({
        msg: `Error during auto-renewal of subscription ${subscription.id}`,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        userId: subscription.userId,
        service: this.serviceName,
      })

      await this.deactivateSubscription(subscription)
    }
  }

  /**
   * Deactivate an expired subscription
   */
  private async deactivateSubscription(subscription) {
    this.logger.info({
      msg: `Deactivating subscription ${subscription.id}`,
      userId: subscription.userId,
      service: this.serviceName,
    })

    try {
      const marzbanResult = await this.marzbanService.deactivateUser(
        subscription.username,
      )

      if (!marzbanResult) {
        throw new Error(
          `Failed to deactivate user ${subscription.username} in Marzban`,
        )
      }

      const removalAt = new Date(add(new Date(), { days: 30 }))

      const settings = await this.prismaService.settings.findFirst({
        where: { key: DefaultEnum.DEFAULT },
      })

      const telegramConfigLinks =
        settings && typeof settings.telegramConfigLinks === 'object'
          ? (settings.telegramConfigLinks as { links?: unknown })
          : null

      const globalTelegramOnlyLinks = Array.isArray(telegramConfigLinks?.links)
        ? telegramConfigLinks.links.filter(
            (link): link is string => typeof link === 'string',
          )
        : []

      await this.prismaService.subscriptions.update({
        where: {
          id: subscription.id,
        },
        data: {
          links: globalTelegramOnlyLinks,
          isActive: false,
          removalAt,
        },
      })

      await this.sendDeactivationNotification(subscription.user, subscription)

      this.logger.info({
        msg: `Successfully deactivated subscription ${subscription.id}`,
        userId: subscription.userId,
        service: this.serviceName,
      })
    } catch (error) {
      this.logger.error({
        msg: `Error deactivating subscription ${subscription.id}`,
        userId: subscription.userId,
        error,
        stack: error instanceof Error ? error.stack : undefined,
        service: this.serviceName,
      })
      throw error
    }
  }

  private async sendDeactivationNotification(user, subscription) {
    try {
      const message = await this.i18n.t('subscription.deactivated', {
        lang: user.language.iso6391,
        args: {
          name: subscription.name,
        },
      })

      this.telegramLogger.sendMessage({
        chatId: Number(user.telegramId),
        text: message,
      })
    } catch (error) {
      this.logger.error({
        msg: 'Error sending deactivation notification',
        userId: user.id,
        error,
        service: this.serviceName,
      })
    }
  }

  /**
   * Cron job to send expiration reminders
   * Runs every day at midnight
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async sendExpirationReminders() {
    this.logger.info({
      msg: 'Starting expiration reminders processing',
      service: this.serviceName,
    })

    try {
      const now = new Date()

      const activeSubscriptions =
        await this.prismaService.subscriptions.findMany({
          where: {
            isActive: true,
            isAutoRenewal: true,
            expiredAt: {
              gt: now,
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
          },
        })

      this.logger.info({
        msg: `Found ${activeSubscriptions.length} active subscriptions to check for reminders`,
        service: this.serviceName,
      })

      for (const subscription of activeSubscriptions) {
        if (
          this.shortTermPeriods.includes(
            subscription.period as SubscriptionPeriodEnum,
          )
        ) {
          continue
        }

        const daysUntilExpiration = differenceInDays(
          subscription.expiredAt,
          now,
        )

        if (this.notificationDays.includes(daysUntilExpiration)) {
          await this.sendExpirationReminder(subscription, daysUntilExpiration)
        }
      }

      this.logger.info({
        msg: 'Expiration reminders processing completed',
        service: this.serviceName,
      })
    } catch (error) {
      this.logger.error({
        msg: 'Error processing expiration reminders',
        error,
        stack: error instanceof Error ? error.stack : undefined,
        service: this.serviceName,
      })
    }
  }

  private async sendExpirationReminder(subscription, daysLeft: number) {
    const user = subscription.user
    const redisKey = `subscription:reminder:${subscription.id}:${daysLeft}`

    try {
      const alreadySent = await this.redis.get(redisKey)
      if (alreadySent) {
        return
      }

      const requiredAmount = subscription.nextRenewalStars

      const hasEnoughBalance =
        typeof requiredAmount === 'number' &&
        user.balance.paymentBalance >= requiredAmount

      // FIX #2: was always using 'subscription.expiration_reminder' regardless
      // of hasEnoughBalance. Now selects the correct i18n key.
      const messageKey = hasEnoughBalance
        ? 'subscription.expiration_reminder'
        : 'subscription.expiration_reminder_low_balance'

      const message = await this.i18n.t(messageKey as keyof I18nTranslations, {
        lang: user.language.iso6391,
        args: {
          days: daysLeft,
          daysText: await this.i18n.t(
            `time.days.${this.xrayService.getDeclension(
              daysLeft,
            )}` as keyof I18nTranslations,
            { lang: user.language.iso6391 },
          ),
          name: subscription.name,
          expiredAt: intlFormat(
            new Date(subscription.expiredAt),
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
      })

      this.telegramLogger.sendMessage({
        chatId: Number(user.telegramId),
        text: message as string,
      })

      await this.redis.set(redisKey, 'sent', 'EX', 60 * 60 * 24 * 2)

      this.logger.info({
        msg: `Sent expiration reminder to user ${user.id}, ${daysLeft} days left`,
        subscriptionId: subscription.id,
        service: this.serviceName,
      })
    } catch (error) {
      this.logger.error({
        msg: 'Error sending expiration reminder',
        userId: user.id,
        subscriptionId: subscription.id,
        daysLeft,
        error,
        service: this.serviceName,
      })
    }
  }

  /**
   * Cron job to delete inactive subscriptions
   * Runs every day at 3:00 AM
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async deleteInactiveSubscriptions() {
    this.logger.info({
      msg: 'Starting inactive subscriptions cleanup',
      service: this.serviceName,
    })

    try {
      const oneWeekAgo = new Date()
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)

      const inactiveSubscriptions =
        await this.prismaService.subscriptions.findMany({
          where: {
            isActive: false,
            OR: [
              {
                expiredAt: {
                  not: null,
                  lt: oneWeekAgo,
                },
              },
              {
                removalAt: {
                  not: null,
                  lt: new Date(),
                },
              },
            ],
          },
          include: {
            user: {
              include: {
                language: true,
              },
            },
          },
        })

      this.logger.info({
        msg: `Found ${inactiveSubscriptions.length} inactive subscriptions to delete`,
        service: this.serviceName,
      })

      for (const subscription of inactiveSubscriptions) {
        await this.deleteInactiveSubscription(subscription)
      }

      this.logger.info({
        msg: 'Inactive subscriptions cleanup completed',
        service: this.serviceName,
      })
    } catch (error) {
      this.logger.error({
        msg: 'Error cleaning up inactive subscriptions',
        error,
        stack: error instanceof Error ? error.stack : undefined,
        service: this.serviceName,
      })
    }
  }

  private async deleteInactiveSubscription(subscription: any) {
    this.logger.info({
      msg: `Deleting inactive subscription ${subscription.id}`,
      userId: subscription.userId,
      service: this.serviceName,
    })

    try {
      const marzbanResult = await this.marzbanService.removeUser(
        subscription.username,
      )

      if (!marzbanResult) {
        this.logger.warn({
          msg: `Failed to remove user ${subscription.username} from Marzban, continuing with database deletion`,
          service: this.serviceName,
        })
      }

      await this.prismaService.subscriptions.delete({
        where: {
          id: subscription.id,
        },
      })

      await this.sendSubscriptionDeletedNotification(
        subscription.user,
        subscription,
      )

      this.logger.info({
        msg: `Successfully deleted inactive subscription ${subscription.id}`,
        userId: subscription.userId,
        service: this.serviceName,
      })
    } catch (error) {
      this.logger.error({
        msg: `Error deleting inactive subscription ${subscription.id}`,
        userId: subscription.userId,
        error,
        stack: error instanceof Error ? error.stack : undefined,
        service: this.serviceName,
      })
    }
  }

  private async sendSubscriptionDeletedNotification(
    user: any,
    subscription: any,
  ) {
    try {
      const message = await this.i18n.t('subscription.deleted_auto', {
        lang: user.language.iso6391,
        args: {
          name: subscription.name,
        },
      })

      this.telegramLogger.sendMessage({
        chatId: Number(user.telegramId),
        text: message,
      })
    } catch (error) {
      this.logger.error({
        msg: 'Error sending subscription deletion notification',
        userId: user.id,
        error,
        service: this.serviceName,
      })
    }
  }
}
