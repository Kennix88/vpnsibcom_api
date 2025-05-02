import { RedisService } from '@core/redis/redis.service'
import { UsersService } from '@modules/users/users.service'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DefaultEnum } from '@shared/enums/default.enum'
import { SubscriptionPeriodEnum } from '@shared/enums/subscription-period.enum'
import { genToken } from '@shared/utils/gen-token.util'
import { addHours } from 'date-fns'
import { PinoLogger } from 'nestjs-pino'
import { PrismaService } from 'nestjs-prisma'
import { UserCreate } from '../types/marzban.types'
import { SubscriptionDataInterface } from '../types/subscription-data.interface'
import { MarzbanService } from './marzban.service'

/**
 * Сервис для работы с Xray
 */
@Injectable()
export class XrayService {
  private readonly serviceName = 'XrayService'

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly userService: UsersService,
    private readonly logger: PinoLogger,
    private readonly redis: RedisService,
    private readonly marzbanService: MarzbanService,
  ) {}

  /**
   * Активирует бесплатный план для пользователя
   * @param telegramId - Telegram ID пользователя
   * @returns Подписка или false в случае ошибки
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

      const subscription = await this.createSubscription(
        telegramId,
        SubscriptionPeriodEnum.TRIAL,
        user.freePlanDays,
      )

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

  /**
   * Получает список подписок пользователя
   * @param userId - ID пользователя
   * @returns Массив подписок с дополнительной информацией или undefined в случае ошибки
   */
  public async getSubscriptions(
    userId: string,
  ): Promise<SubscriptionDataInterface[]> {
    try {
      this.logger.info({
        msg: `Получение подписок для пользователя с ID: ${userId}`,
        service: this.serviceName,
      })

      const subscriptions = await this.prismaService.subscriptions.findMany({
        where: {
          userId: userId,
        },
      })

      if (!subscriptions || subscriptions.length === 0) {
        this.logger.info({
          msg: `Подписки для пользователя с ID ${userId} не найдены`,
          service: this.serviceName,
        })
        return []
      }

      const allowedOrigin = this.configService.get<string>('ALLOWED_ORIGIN')
      if (!allowedOrigin) {
        throw new Error('ALLOWED_ORIGIN не настроен в конфигурации')
      }

      const result: SubscriptionDataInterface[] = subscriptions.map(
        (subscription) => ({
          id: subscription.id,
          period: subscription.period as SubscriptionPeriodEnum,
          isActive: subscription.isActive,
          isAutoRenewal: subscription.isAutoRenewal,
          createdAt: subscription.createdAt,
          updatedAt: subscription.updatedAt,
          expiredAt: subscription.expiredAt,
          subscriptionUrl: `${allowedOrigin}/sub/${subscription.token}`,
        }),
      )

      this.logger.info({
        msg: `Успешно получены ${result.length} подписок для пользователя с ID: ${userId}`,
        service: this.serviceName,
      })

      return result
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
   * Создает новую подписку для пользователя
   * @param telegramId - Telegram ID пользователя
   * @param period - Период подписки
   * @param trialDays - Количество дней для пробного периода (опционально)
   * @returns Созданная подписка или false в случае ошибки
   */
  public async createSubscription(
    telegramId: string,
    period: SubscriptionPeriodEnum,
    trialDays?: number,
  ) {
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

      const token = genToken()
      const username = `${user.telegramId}_${Date.now()}`

      // Подготовка данных для Marzban
      const marbanDataStart: UserCreate = {
        username,
        proxies: {
          vless: {
            flow: 'xtls-rprx-vision',
          },
        },
        inbounds: {
          vless: ['VLESS'],
        },
        status: 'active',
        note: `${user.id}/${user.telegramId}/${
          user.telegramData?.username || ''
        }/${user.telegramData?.firstName || ''}/${
          user.telegramData?.lastName || ''
        }`,
      }

      // Добавление пользователя в Marzban
      const marbanData = await this.marzbanService.addUser(marbanDataStart)
      if (!marbanData) {
        this.logger.error({
          msg: `Не удалось добавить пользователя в Marzban для Telegram ID: ${telegramId}`,
          service: this.serviceName,
        })
        return false
      }

      // Расчет времени истечения подписки
      const periodHours = this.periodHours(period, trialDays)
      if (periodHours <= 0) {
        this.logger.error({
          msg: `Некорректный период подписки: ${period}`,
          service: this.serviceName,
        })
        return false
      }

      // Создание подписки в базе данных
      const subscription = await this.prismaService.subscriptions.create({
        data: {
          username,
          userId: user.id,
          period,
          isActive: true,
          token,
          expiredAt: addHours(new Date(), periodHours),
        },
      })

      if (!subscription) {
        this.logger.error({
          msg: `Не удалось создать подписку в базе данных для пользователя с Telegram ID: ${telegramId}`,
          service: this.serviceName,
        })
        return false
      }

      // Обработка реферальной системы
      await this.processReferrals(user)

      this.logger.info({
        msg: `Подписка успешно создана для пользователя с Telegram ID: ${telegramId}`,
        subscriptionId: subscription.id,
        service: this.serviceName,
      })

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
   * Обрабатывает реферальную систему для пользователя
   * @param user - Пользователь
   * @private
   */
  private async processReferrals(user: any) {
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
          let plusPaymentsRewarded = 0

          plusPaymentsRewarded = user.telegramData?.isPremium
            ? settings.referralInvitePremiumRewardStars
            : settings.referralInviteRewardStars

          try {
            await this.prismaService.$transaction(async (tx) => {
              // Обновляем статус реферала
              await tx.referrals.update({
                where: {
                  id: inviter.id,
                },
                data: {
                  totalPaymentsRewarded:
                    inviter.totalPaymentsRewarded + plusPaymentsRewarded,
                  isActivated: true,
                },
              })

              // Проверяем наличие баланса и ID баланса
              if (!inviter.inviter || !inviter.inviter.balanceId) {
                throw new Error(
                  `Отсутствует balanceId для инвайтера с ID: ${inviter.inviter?.id}`,
                )
              }

              // Проверяем наличие данных о балансе
              if (!inviter.inviter.balance) {
                throw new Error(
                  `Отсутствуют данные о балансе для инвайтера с ID: ${inviter.inviter.id}`,
                )
              }

              // Обновляем баланс реферера
              await tx.userBalance.update({
                where: {
                  id: inviter.inviter.balanceId,
                },
                data: {
                  paymentBalance:
                    inviter.inviter.balance.paymentBalance +
                    plusPaymentsRewarded,
                },
              })
            })

            this.logger.info({
              msg: `Успешно обновлен реферальный баланс для инвайтера с ID: ${inviter.inviter?.id}`,
              reward: plusPaymentsRewarded,
              service: this.serviceName,
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
   * Рассчитывает количество часов для периода подписки
   * @param period - Период подписки
   * @param trialDays - Количество дней для пробного периода (опционально)
   * @returns Количество часов
   * @private
   */
  private periodHours(
    period: SubscriptionPeriodEnum,
    trialDays?: number,
  ): number {
    switch (period) {
      case SubscriptionPeriodEnum.HOUR:
        return 1
      case SubscriptionPeriodEnum.DAY:
        return 24
      case SubscriptionPeriodEnum.MONTH:
        return 30 * 24
      case SubscriptionPeriodEnum.THREE_MONTH:
        return 90 * 24
      case SubscriptionPeriodEnum.SIX_MONTH:
        return 180 * 24
      case SubscriptionPeriodEnum.YEAR:
        return 365 * 24
      case SubscriptionPeriodEnum.TWO_YEAR:
        return 365 * 2 * 24
      case SubscriptionPeriodEnum.THREE_YEAR:
        return 365 * 3 * 24
      case SubscriptionPeriodEnum.TRIAL:
        return trialDays && trialDays > 0 ? trialDays * 24 : 0
      default:
        this.logger.warn({
          msg: `Неизвестный период подписки: ${period}`,
          service: this.serviceName,
        })
        return 0
    }
  }

  /**
   * Проверяет, находится ли IP в зеленом списке
   * @param ip - IP-адрес для проверки
   * @returns true, если IP в зеленом списке, иначе false
   */
  public async greenCheck(ip: string): Promise<boolean> {
    try {
      if (!ip || typeof ip !== 'string') {
        this.logger.warn({
          msg: `Некорректный IP-адрес для проверки: ${ip}`,
          service: this.serviceName,
        })
        return false
      }

      this.logger.info({
        msg: `Проверка IP в зеленом списке: ${ip}`,
        service: this.serviceName,
      })

      const getIp = await this.prismaService.greenList.findUnique({
        where: {
          green: ip,
        },
      })

      const result = !!getIp

      this.logger.info({
        msg: `Результат проверки IP ${ip} в зеленом списке: ${
          result ? 'найден' : 'не найден'
        }`,
        service: this.serviceName,
      })

      return result
    } catch (error) {
      this.logger.error({
        msg: `Ошибка при проверке IP в зеленом списке: ${ip}`,
        error,
        stack: error instanceof Error ? error.stack : undefined,
        service: this.serviceName,
      })
      return false
    }
  }
}
