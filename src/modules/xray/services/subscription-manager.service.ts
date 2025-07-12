import { I18nTranslations } from '@core/i18n/i18n.type'
import { RedisService } from '@core/redis/redis.service'
import { PlansInterface } from '@modules/plans/types/plans.interface'
import { UsersService } from '@modules/users/users.service'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Cron, CronExpression } from '@nestjs/schedule'
import { Subscriptions } from '@prisma/client'
import { BalanceTypeEnum } from '@shared/enums/balance-type.enum'
import { SubscriptionPeriodEnum } from '@shared/enums/subscription-period.enum'
import { TransactionReasonEnum } from '@shared/enums/transaction-reason.enum'
import { differenceInDays, format } from 'date-fns'
import { I18nService } from 'nestjs-i18n'
import { PinoLogger } from 'nestjs-pino'
import { PrismaService } from 'nestjs-prisma'
import { InjectBot } from 'nestjs-telegraf'
import { Telegraf } from 'telegraf'
import { calculateSubscriptionCost } from '../utils/calculate-subscription-cost.util'
import { periodHours } from '../utils/period-hours.util'
import { MarzbanService } from './marzban.service'
import { XrayService } from './xray.service'

/**
 * Interface for subscription with user data
 */
interface SubscriptionWithUser extends Subscriptions {
  user: {
    id: string
    telegramId: string
    telegramData: {
      isPremium: boolean
    }
    language: {
      iso6391: string
    }
    balance: {
      id: string
      paymentBalance: number
      isUseWithdrawalBalance: boolean
      withdrawalBalance: number
    }
    role: {
      discount: number
    }
  }
  servers?: {
    greenList: {
      code: string
    }
  }[]
}

/**
 * Service for managing subscriptions lifecycle
 */
@Injectable()
export class SubscriptionManagerService {
  private readonly serviceName = 'SubscriptionManagerService'
  private readonly notificationDays = [1, 3, 7] // Days before expiration to send notifications
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
    private readonly configService: ConfigService,
    private readonly userService: UsersService,
    @InjectBot() private readonly bot: Telegraf,
  ) {}

  /**
   * Updates subscription data with information from Marzban service
   * @returns Promise<void>
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async subscriptionsUpdater() {
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

      // Fetch data in parallel for better performance
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

      this.logger.info({
        msg: `Found ${subscriptions.length} subscriptions to update`,
        service: this.serviceName,
      })

      // Process subscriptions in batches to avoid memory issues with large datasets
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
              subscription.isAllBaseServers && subscription.isAllPremiumServers
                ? []
                : subscription.servers
                    ?.flatMap((server) => {
                      if (server.greenList.isPremium) premiumServers++
                      else baseServers++
                      return server.greenList.code
                    })
                    .filter(Boolean)

            const filteredLinks = marzbanUser.links.filter((link) => {
              if (!serverCodes.length) return true
              return serverCodes.some((code) => link.includes(code))
            })

            // Для INDEFINITELY не рассчитываем стоимость продления
            let nextRenewalStars = null

            // Только для подписок с периодом, отличным от INDEFINITELY
            if (
              subscription.period !== SubscriptionPeriodEnum.INDEFINITELY &&
              subscription.period !== SubscriptionPeriodEnum.TRIAL
            ) {
              const cost = calculateSubscriptionCost({
                plan: subscription.plan as PlansInterface,
                period: subscription.period as SubscriptionPeriodEnum,
                isPremium: subscription.isPremium,
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

              const partnerCost = subscription.user.isTgProgramPartner
                ? cost * settings.telegramPartnerProgramRatio
                : cost

              nextRenewalStars = subscription.isFixedPrice
                ? subscription.fixedPriceStars
                : partnerCost
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
              marzbanData: JSON.stringify(marzbanUser),
            }
          }),
        )

        // Используем транзакцию для обновления каждой подписки индивидуально
        await this.prismaService.$transaction(
          updatedBatch.map((subscription) =>
            this.prismaService.subscriptions.update({
              where: { id: subscription.id },
              data: {
                links: subscription.links,
                nextRenewalStars: subscription.nextRenewalStars,
                usedTraffic: subscription.usedTraffic / 1024 / 1024,
                lastUserAgent: subscription.lastUserAgent,
                dataLimit: subscription.dataLimit / 1024 / 1024,
                lifeTimeUsedTraffic:
                  subscription.lifeTimeUsedTraffic / 1024 / 1024,
                onlineAt: subscription.onlineAt
                  ? new Date(subscription.onlineAt + 'Z')
                  : null, // Adding 'Z' to indicate UTC timezone
                marzbanData: subscription.marzbanData,
              },
            }),
          ),
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
  }

  /**
   * Cron job to process expired subscriptions
   * Runs every hour
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async processExpiredSubscriptions() {
    this.logger.info({
      msg: 'Starting expired subscriptions processing',
      service: this.serviceName,
    })

    try {
      // Get all active subscriptions that have expired
      // Исключаем подписки с периодом INDEFINITELY, так как у них expiredAt = null
      const expiredSubscriptions =
        await this.prismaService.subscriptions.findMany({
          where: {
            isActive: true,
            isInvoicing: false,
            period: {
              not: SubscriptionPeriodEnum.INDEFINITELY,
            },
            expiredAt: {
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
          subscription.period !== SubscriptionPeriodEnum.TRIAL
        ) {
          await this.processAutoRenewal(
            subscription as unknown as SubscriptionWithUser,
          )
        } else {
          await this.deactivateSubscription(
            subscription as unknown as SubscriptionWithUser,
          )
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
   * Process auto-renewal for a subscription
   * @param subscription - The subscription to process
   * @private
   */
  private async processAutoRenewal(subscription: SubscriptionWithUser) {
    this.logger.info({
      msg: `Processing auto-renewal for subscription ${subscription.id}`,
      userId: subscription.userId,
      service: this.serviceName,
    })

    try {
      const user = subscription.user
      const renewalPeriod = subscription.period as SubscriptionPeriodEnum
      const hours = periodHours(renewalPeriod, subscription.periodMultiplier)

      // Calculate the cost based on subscription period and user role discount
      const cost = subscription.nextRenewalStars

      // Используем сервис UsersService для списания средств
      const deductResult = await this.userService.deductUserBalance(
        user.id,
        cost,
        TransactionReasonEnum.SUBSCRIPTIONS,
        BalanceTypeEnum.PAYMENT,
        { forceUseWithdrawalBalance: user.balance.isUseWithdrawalBalance },
      )

      if (deductResult.success) {
        // Успешное списание средств, продлеваем подписку
        await this.prismaService.subscriptions.update({
          where: {
            id: subscription.id,
          },
          data: {
            expiredAt: new Date(Date.now() + hours * 60 * 60 * 1000),
            period: renewalPeriod, // Update period if it was TRIAL
          },
        })

        // Логируем информацию о списании средств
        if (deductResult.paymentAmount > 0) {
          this.logger.info({
            msg: `Used ${deductResult.paymentAmount} from payment balance for subscription renewal`,
            userId: user.id,
            subscriptionId: subscription.id,
            service: this.serviceName,
          })
        }

        if (deductResult.withdrawalAmount > 0) {
          this.logger.info({
            msg: `Used ${deductResult.withdrawalAmount} from withdrawal balance for subscription renewal`,
            userId: user.id,
            subscriptionId: subscription.id,
            service: this.serviceName,
          })
        }

        // Send notification about successful renewal
        await this.sendRenewalSuccessNotification(user, {
          ...subscription,
          period: renewalPeriod, // Use the new period for notification
        })

        this.logger.info({
          msg: `Successfully renewed subscription ${subscription.id}`,
          userId: user.id,
          period: renewalPeriod,
          service: this.serviceName,
        })
      } else {
        // Not enough balance, deactivate subscription
        await this.deactivateSubscription(subscription)

        // Send notification about failed renewal due to insufficient balance
        await this.sendInsufficientBalanceNotification(user, subscription, cost)
      }
    } catch (error) {
      this.logger.error({
        msg: `Error during auto-renewal of subscription ${subscription.id}`,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        userId: subscription.userId,
        service: this.serviceName,
      })

      // В случае ошибки деактивируем подписку
      await this.deactivateSubscription(subscription)
    }
  }

  /**
   * Deactivate an expired subscription
   * @param subscription - The subscription to deactivate
   * @private
   */
  private async deactivateSubscription(subscription: SubscriptionWithUser) {
    this.logger.info({
      msg: `Deactivating subscription ${subscription.id}`,
      userId: subscription.userId,
      service: this.serviceName,
    })

    try {
      // First, deactivate in Marzban

      if (subscription.isCreated) {
        const marzbanResult = await this.marzbanService.deactivateUser(
          subscription.username,
        )

        if (!marzbanResult) {
          throw new Error(
            `Failed to deactivate user ${subscription.username} in Marzban`,
          )
        }
      }

      // Then update database status
      await this.prismaService.subscriptions.update({
        where: {
          id: subscription.id,
        },
        data: {
          isActive: false,
        },
      })

      // Send notification to user
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

  /**
   * Send notification about successful subscription renewal
   * @param user - User to notify
   * @param subscription - Renewed subscription
   * @private
   */
  private async sendRenewalSuccessNotification(
    user: SubscriptionWithUser['user'],
    subscription: SubscriptionWithUser,
  ) {
    try {
      const message = await this.i18n.t('subscription.renewed', {
        lang: user.language.iso6391,
        args: {
          period: await this.xrayService.getLocalizedPeriodText(
            subscription.period as SubscriptionPeriodEnum,
            user.language.iso6391,
          ),
          expiredAt: format(subscription.expiredAt, 'dd.MM.yyyy HH:mm'),
        },
      })

      await this.bot.telegram.sendMessage(user.telegramId, message)
    } catch (error) {
      this.logger.error({
        msg: 'Error sending renewal success notification',
        userId: user.id,
        error,
        service: this.serviceName,
      })
    }
  }

  /**
   * Send notification about insufficient balance for renewal
   * @param user - User to notify
   * @param subscription - Subscription that failed to renew
   * @param requiredAmount - Amount required for renewal
   * @private
   */
  private async sendInsufficientBalanceNotification(
    user: SubscriptionWithUser['user'],
    subscription: SubscriptionWithUser,
    requiredAmount: number,
  ) {
    try {
      const message = await this.i18n.t('subscription.renewal_failed_balance', {
        lang: user.language.iso6391,
        args: {
          period: await this.xrayService.getLocalizedPeriodText(
            subscription.period as SubscriptionPeriodEnum,
            user.language.iso6391,
          ),
          requiredAmount,
          currentBalance: user.balance.paymentBalance,
        },
      })

      await this.bot.telegram.sendMessage(user.telegramId, message)
    } catch (error) {
      this.logger.error({
        msg: 'Error sending insufficient balance notification',
        userId: user.id,
        error,
        service: this.serviceName,
      })
    }
  }

  /**
   * Send notification about subscription deactivation
   * @param user - User to notify
   * @param subscription - Deactivated subscription
   * @private
   */
  private async sendDeactivationNotification(
    user: SubscriptionWithUser['user'],
    subscription: SubscriptionWithUser,
  ) {
    try {
      const message = await this.i18n.t('subscription.deactivated', {
        lang: user.language.iso6391,
        args: {
          period: await this.xrayService.getLocalizedPeriodText(
            subscription.period as SubscriptionPeriodEnum,
            user.language.iso6391,
          ),
        },
      })

      await this.bot.telegram.sendMessage(user.telegramId, message)
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

      // Get all active subscriptions with auto-renewal enabled
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
        // Skip short-term subscriptions (hour, day)
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

        // Check if we need to send a reminder for this subscription
        if (this.notificationDays.includes(daysUntilExpiration)) {
          await this.sendExpirationReminder(
            subscription as unknown as SubscriptionWithUser,
            daysUntilExpiration,
          )
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

  /**
   * Send expiration reminder to user
   * @param subscription - Subscription about to expire
   * @param daysLeft - Days left until expiration
   * @private
   */
  private async sendExpirationReminder(
    subscription: SubscriptionWithUser,
    daysLeft: number,
  ) {
    const user = subscription.user
    const redisKey = `subscription:reminder:${subscription.id}:${daysLeft}`

    try {
      // Check if we already sent this reminder (using Redis)
      const alreadySent = await this.redis.get(redisKey)
      if (alreadySent) {
        return
      }

      // Calculate required amount for renewal
      const renewalPeriod =
        subscription.period === SubscriptionPeriodEnum.TRIAL
          ? SubscriptionPeriodEnum.MONTH
          : subscription.period

      const requiredAmount = subscription.nextRenewalStars

      const hasEnoughBalance =
        typeof requiredAmount === 'number' &&
        user.balance.paymentBalance >= requiredAmount

      // Get appropriate message based on balance status
      const messageKey = hasEnoughBalance
        ? 'subscription.expiration_reminder'
        : 'subscription.expiration_reminder_low_balance'

      const message = await this.i18n.t(messageKey, {
        lang: user.language.iso6391,
        args: {
          days: daysLeft,
          daysText: await this.i18n.t(
            `time.days.${this.xrayService.getDeclension(
              daysLeft,
            )}` as keyof I18nTranslations,
            { lang: user.language.iso6391 },
          ),
          period: await this.xrayService.getLocalizedPeriodText(
            renewalPeriod as SubscriptionPeriodEnum,
            user.language.iso6391,
          ),
          expiredAt: format(subscription.expiredAt, 'dd.MM.yyyy HH:mm'),
          requiredAmount,
          currentBalance: user.balance.paymentBalance,
        },
      })

      await this.bot.telegram.sendMessage(user.telegramId, message as string)

      // Store in Redis that we sent this reminder (expire after 2 days)
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
   * Cron job to delete inactive subscriptions that haven't been renewed for more than a week
   * Runs every day at 3:00 AM
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async deleteInactiveSubscriptions() {
    this.logger.info({
      msg: 'Starting inactive subscriptions cleanup',
      service: this.serviceName,
    })

    try {
      // Calculate date one week ago
      const oneWeekAgo = new Date()
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)

      // Get all inactive subscriptions that expired more than a week ago
      const inactiveSubscriptions =
        await this.prismaService.subscriptions.findMany({
          where: {
            isActive: false,
            expiredAt: {
              lt: oneWeekAgo,
            },
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
        msg: `Found ${inactiveSubscriptions.length} inactive subscriptions to delete (expired more than a week ago)`,
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

  /**
   * Delete an inactive subscription
   * @param subscription - The subscription to delete
   * @private
   */
  private async deleteInactiveSubscription(subscription: any) {
    this.logger.info({
      msg: `Deleting inactive subscription ${subscription.id}`,
      userId: subscription.userId,
      service: this.serviceName,
    })

    try {
      // Try to remove user from Marzban
      const marzbanResult = await this.marzbanService.removeUser(
        subscription.username,
      )

      if (!marzbanResult) {
        this.logger.warn({
          msg: `Failed to remove user ${subscription.username} from Marzban, continuing with database deletion`,
          service: this.serviceName,
        })
        // Continue with deletion even if Marzban removal fails
      }

      // Delete subscription from database
      await this.prismaService.subscriptions.delete({
        where: {
          id: subscription.id,
        },
      })

      // Send notification to user
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

  /**
   * Send notification about subscription deletion
   * @param user - User to notify
   * @param subscription - Deleted subscription
   * @private
   */
  private async sendSubscriptionDeletedNotification(
    user: any,
    subscription: any,
  ) {
    try {
      const message = await this.i18n.t('subscription.deleted_auto', {
        lang: user.language.iso6391,
        args: {
          period: await this.xrayService.getLocalizedPeriodText(
            subscription.period,
            user.language.iso6391,
          ),
        },
      })

      await this.bot.telegram.sendMessage(user.telegramId, message)
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
