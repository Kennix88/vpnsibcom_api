import { I18nTranslations } from '@core/i18n/i18n.type'
import { RedisService } from '@core/redis/redis.service'
import { UsersService } from '@modules/users/users.service'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { BalanceTypeEnum } from '@shared/enums/balance-type.enum'
import { DefaultEnum } from '@shared/enums/default.enum'
import { SubscriptionPeriodEnum } from '@shared/enums/subscription-period.enum'
import { TransactionReasonEnum } from '@shared/enums/transaction-reason.enum'
import { TransactionTypeEnum } from '@shared/enums/transaction-type.enum'
import { genToken } from '@shared/utils/gen-token.util'
import { addHours, format } from 'date-fns'
import { I18nService } from 'nestjs-i18n'
import { PinoLogger } from 'nestjs-pino'
import { PrismaService } from 'nestjs-prisma'
import { InjectBot } from 'nestjs-telegraf'
import { Telegraf } from 'telegraf'
import { UserCreate } from '../types/marzban.types'
import {
  SubscriptionDataInterface,
  SubscriptionDataListInterface,
} from '../types/subscription-data.interface'
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
    private readonly i18n: I18nService,
    @InjectBot() private readonly bot: Telegraf,
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
  ): Promise<SubscriptionDataInterface> {
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
        return
      }

      const allowedOrigin = this.configService.get<string>('ALLOWED_ORIGIN')
      if (!allowedOrigin) {
        throw new Error('ALLOWED_ORIGIN не настроен в конфигурации')
      }

      const result: SubscriptionDataListInterface[] = subscriptions.map(
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
        priceSubscriptionStars: settings.priceSubscriptionStars,
        hourRatioPayment: settings.hourRatioPayment,
        dayRatioPayment: settings.dayRatioPayment,
        threeMouthesRatioPayment: settings.threeMouthesRatioPayment,
        sixMouthesRatioPayment: settings.sixMouthesRatioPayment,
        oneYearRatioPayment: settings.oneYearRatioPayment,
        twoYearRatioPayment: settings.twoYearRatioPayment,
        threeYearRatioPayment: settings.threeYearRatioPayment,
        list: result,
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
      const username = `${user.telegramId}_${Math.random()
        .toString(36)
        .substring(2)}`

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

      // Отправка уведомления пользователю в Telegram о создании подписки
      try {
        const allowedOrigin = this.configService.get<string>('ALLOWED_ORIGIN')
        const subscriptionUrl = `${allowedOrigin}/sub/${token}`
        const periodText = await this.getLocalizedPeriodText(
          period,
          user.language.iso6391,
          trialDays,
        )

        const message = await this.i18n.t('subscription.created', {
          lang: user.language.iso6391,
          args: {
            period: periodText,
            expiredAt: format(subscription.expiredAt, 'dd.MM.yyyy HH:mm'),
            subscriptionUrl: subscriptionUrl,
          },
        })

        await this.bot.telegram.sendMessage(telegramId, message)

        this.logger.info({
          msg: `Уведомление о создании подписки отправлено пользователю с Telegram ID: ${telegramId}`,
          service: this.serviceName,
        })
      } catch (error) {
        this.logger.error({
          msg: `Ошибка при отправке уведомления о создании подписки пользователю с Telegram ID: ${telegramId}`,
          error,
          stack: error instanceof Error ? error.stack : undefined,
          service: this.serviceName,
        })
        // Не прерываем выполнение, так как основная операция создания подписки уже выполнена
      }

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

              // Создаем транзакцию для реферальной комиссии
              const transactions = [
                {
                  amount: plusPaymentsRewarded,
                  type: TransactionTypeEnum.PLUS,
                  reason: TransactionReasonEnum.REFERRAL,
                  balanceType: BalanceTypeEnum.PAYMENT,
                  isHold: false,
                  balanceId: inviter.inviter.balanceId,
                },
              ]

              await tx.transactions.createMany({
                data: transactions,
              })
            })

            // Отправляем уведомление инвайтеру о полученном вознаграждении
            try {
              const inviterUser = await this.userService.getUserByTgId(
                inviter.inviter.telegramId,
              )
              if (!inviterUser) {
                throw new Error(
                  `Инвайтер с Telegram ID ${inviter.inviter.telegramId} не найден`,
                )
              }

              const inviterTelegramId = inviter.inviter.telegramId
              const referralName =
                user.telegramData.firstName ||
                (await this.i18n.t('referral.defaultName', {
                  lang: inviterUser.language.iso6391,
                }))

              const message = await this.i18n.t('referral.rewardReceived', {
                lang: inviterUser.language.iso6391,
                args: {
                  starsAmount: plusPaymentsRewarded,
                  referralName: referralName,
                  level: inviter.level,
                },
              })

              await this.bot.telegram.sendMessage(inviterTelegramId, message)
            } catch (err) {
              this.logger.error({
                msg: `Error sending notification to inviter`,
                error: err instanceof Error ? err.message : String(err),
                inviterId: inviter.inviter.id,
                service: this.serviceName,
              })
            }

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
  public periodHours(
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
   * Возвращает локализованное текстовое описание периода подписки
   * @param period - Период подписки
   * @param lang - Код языка пользователя
   * @param trialDays - Количество дней для пробного периода (опционально)
   * @returns Локализованное текстовое описание периода
   * @private
   */
  public async getLocalizedPeriodText(
    period: SubscriptionPeriodEnum,
    lang: string,
    trialDays?: number,
  ): Promise<string> {
    const periodKey = `subscription.period.${period.toLowerCase()}`

    if (period === SubscriptionPeriodEnum.TRIAL && trialDays && trialDays > 0) {
      return this.i18n.t('subscription.period.trial_with_days', {
        lang,
        args: {
          days: trialDays,
          daysText: await this.i18n.t(
            `time.days.${this.getDeclension(
              trialDays,
            )}` as keyof I18nTranslations,
            { lang },
          ),
        },
      })
    }

    return this.i18n.t(periodKey as keyof I18nTranslations, { lang })
  }

  /**
   * Определяет склонение для числительных
   * @param count - Количество
   * @returns Индекс склонения (0, 1 или 2)
   * @private
   */
  public getDeclension(count: number): number {
    // Для русского языка
    const lastDigit = count % 10
    const lastTwoDigits = count % 100

    if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
      return 2 // много (дней)
    }

    if (lastDigit === 1) {
      return 0 // один (день)
    }

    if (lastDigit >= 2 && lastDigit <= 4) {
      return 1 // несколько (дня)
    }

    return 2 // много (дней)
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

  /**
   * Покупка подписки пользователем
   * @param telegramId - Telegram ID пользователя
   * @param period - Период подписки
   * @param isAutoRenewal - Флаг автопродления (опционально)
   * @returns Результат покупки подписки или false в случае ошибки
   */
  public async purchaseSubscription(
    telegramId: string,
    period: SubscriptionPeriodEnum,
    isAutoRenewal: boolean = false,
  ) {
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

      // Расчет стоимости подписки
      const settings = await this.prismaService.settings.findFirst()
      if (!settings) {
        this.logger.error({
          msg: 'Настройки не найдены',
          service: this.serviceName,
        })
        return { success: false, message: 'settings_not_found' }
      }

      // Расчет стоимости с учетом периода и скидки пользователя
      const cost = await this.calculateSubscriptionCost(
        period,
        user.role.discount,
      )

      // Проверка баланса пользователя
      if (user.balance.paymentBalance < cost) {
        this.logger.warn({
          msg: `Недостаточно средств для покупки подписки. Требуется: ${cost}, доступно: ${user.balance.paymentBalance}`,
          service: this.serviceName,
        })
        return {
          success: false,
          message: 'insufficient_balance',
          requiredAmount: cost,
          currentBalance: user.balance.paymentBalance,
        }
      }

      // Создание подписки и списание средств в транзакции
      const subscription = await this.prismaService.$transaction(async (tx) => {
        // Списание средств с баланса
        await tx.userBalance.update({
          where: {
            id: user.balance.id,
          },
          data: {
            paymentBalance: {
              decrement: cost,
            },
          },
        })

        // Создание записи о транзакции
        await tx.transactions.create({
          data: {
            amount: cost,
            type: TransactionTypeEnum.MINUS,
            reason: TransactionReasonEnum.SUBSCRIPTIONS,
            balanceType: BalanceTypeEnum.PAYMENT,
            isHold: false,
            balanceId: user.balance.id,
          },
        })

        // Создание подписки
        const token = genToken()
        const username = `${user.telegramId}_${Math.random()
          .toString(36)
          .substring(2)}`

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
          throw new Error(
            `Не удалось добавить пользователя в Marzban для Telegram ID: ${telegramId}`,
          )
        }

        // Расчет времени истечения подписки
        const periodHours = this.periodHours(period)
        if (periodHours <= 0) {
          throw new Error(`Некорректный период подписки: ${period}`)
        }

        // Создание подписки в базе данных
        return await tx.subscriptions.create({
          data: {
            username,
            userId: user.id,
            period,
            isActive: true,
            isAutoRenewal,
            token,
            expiredAt: addHours(new Date(), periodHours),
          },
        })
      })

      // Отправка уведомления пользователю в Telegram о покупке подписки
      try {
        const allowedOrigin = this.configService.get<string>('ALLOWED_ORIGIN')
        const subscriptionUrl = `${allowedOrigin}/sub/${subscription.token}`
        const periodText = await this.getLocalizedPeriodText(
          period,
          user.language.iso6391,
        )

        const message = await this.i18n.t('subscription.purchased', {
          lang: user.language.iso6391,
          args: {
            period: periodText,
            cost,
            expiredAt: format(subscription.expiredAt, 'dd.MM.yyyy HH:mm'),
            subscriptionUrl: subscriptionUrl,
          },
        })

        await this.bot.telegram.sendMessage(telegramId, message)

        this.logger.info({
          msg: `Уведомление о покупке подписки отправлено пользователю с Telegram ID: ${telegramId}`,
          service: this.serviceName,
        })
      } catch (error) {
        this.logger.error({
          msg: `Ошибка при отправке уведомления о покупке подписки пользователю с Telegram ID: ${telegramId}`,
          error,
          stack: error instanceof Error ? error.stack : undefined,
          service: this.serviceName,
        })
        // Не прерываем выполнение, так как основная операция покупки подписки уже выполнена
      }

      this.logger.info({
        msg: `Подписка успешно куплена пользователем с Telegram ID: ${telegramId}`,
        subscriptionId: subscription.id,
        service: this.serviceName,
      })

      return { success: true, subscription }
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

  /**
   * Расчет стоимости подписки на основе периода и скидки пользователя
   * @param period - Период подписки
   * @param userDiscount - Скидка пользователя
   * @returns Стоимость в Stars
   * @private
   */
  private async calculateSubscriptionCost(
    period: SubscriptionPeriodEnum,
    userDiscount: number = 1,
  ): Promise<number> {
    // Получение цен из настроек
    const settings = await this.prismaService.settings.findFirst()

    if (!settings) {
      this.logger.warn({
        msg: 'Настройки не найдены, используем цену по умолчанию',
        service: this.serviceName,
      })
      return 699 // Цена по умолчанию, если настройки не найдены
    }

    // Базовая цена за месяц
    const basePrice = settings.priceSubscriptionStars

    // Применение коэффициента периода
    let periodRatio = 1
    switch (period) {
      case SubscriptionPeriodEnum.HOUR:
        periodRatio = settings.hourRatioPayment
        break
      case SubscriptionPeriodEnum.DAY:
        periodRatio = settings.dayRatioPayment
        break
      case SubscriptionPeriodEnum.MONTH:
        periodRatio = 1 // Базовая цена уже за 1 месяц
        break
      case SubscriptionPeriodEnum.THREE_MONTH:
        periodRatio = settings.threeMouthesRatioPayment * 3
        break
      case SubscriptionPeriodEnum.SIX_MONTH:
        periodRatio = settings.sixMouthesRatioPayment * 6
        break
      case SubscriptionPeriodEnum.YEAR:
        periodRatio = settings.oneYearRatioPayment * 12
        break
      case SubscriptionPeriodEnum.TWO_YEAR:
        periodRatio = settings.twoYearRatioPayment * 24
        break
      case SubscriptionPeriodEnum.THREE_YEAR:
        periodRatio = settings.threeYearRatioPayment * 36
        break
      case SubscriptionPeriodEnum.TRIAL:
        return 0 // Пробный период бесплатный
      default:
        periodRatio = 1
    }

    // Расчет цены с учетом коэффициента периода и скидки пользователя
    const price = basePrice * periodRatio * userDiscount

    return Math.round(price) // Округление до ближайшего целого
  }

  /**
   * Удаляет подписку пользователя
   * @param telegramId - Telegram ID пользователя
   * @param subscriptionId - ID подписки для удаления
   * @returns Объект с результатом операции
   */
  public async deleteSubscription(
    telegramId: string,
    subscriptionId: string,
  ): Promise<{ success: boolean; message?: string }> {
    try {
      this.logger.info({
        msg: `Запрос на удаление подписки ${subscriptionId} от пользователя с Telegram ID: ${telegramId}`,
        service: this.serviceName,
      })

      // Проверяем существование пользователя
      const user = await this.userService.getUserByTgId(telegramId)
      if (!user) {
        this.logger.warn({
          msg: `Пользователь с Telegram ID ${telegramId} не найден`,
          service: this.serviceName,
        })
        return { success: false, message: 'user_not_found' }
      }

      // Находим подписку и проверяем, принадлежит ли она пользователю
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

      // Удаляем пользователя из Marzban
      const marzbanResult = await this.marzbanService.removeUser(
        subscription.username,
      )
      if (!marzbanResult) {
        this.logger.error({
          msg: `Не удалось удалить пользователя ${subscription.username} из Marzban`,
          service: this.serviceName,
        })
        // Продолжаем удаление из БД даже если не удалось удалить из Marzban
      }

      // Удаляем подписку из базы данных
      await this.prismaService.subscriptions.delete({
        where: {
          id: subscriptionId,
        },
      })

      // Отправляем уведомление пользователю
      await this.sendSubscriptionDeletedNotification(user, subscription)

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

  /**
   * Отправляет уведомление пользователю об удалении подписки
   * @param user - Пользователь
   * @param subscription - Удаленная подписка
   * @private
   */
  private async sendSubscriptionDeletedNotification(
    user: any,
    subscription: any,
  ): Promise<void> {
    try {
      const message = await this.i18n.t('subscription.deleted', {
        lang: user.language.iso6391,
        args: {
          period: await this.getLocalizedPeriodText(
            subscription.period,
            user.language.iso6391,
          ),
        },
      })

      await this.bot.telegram.sendMessage(user.telegramId, message)
    } catch (error) {
      this.logger.error({
        msg: `Ошибка при отправке уведомления об удалении подписки`,
        userId: user.id,
        error,
        stack: error instanceof Error ? error.stack : undefined,
        service: this.serviceName,
      })
    }
  }

  /**
   * Продлевает существующую подписку пользователя
   * @param telegramId - Telegram ID пользователя
   * @param subscriptionId - ID подписки для продления
   * @returns Результат операции продления
   */
  public async renewSubscription(telegramId: string, subscriptionId: string) {
    try {
      this.logger.info({
        msg: `Manual subscription renewal requested for user with Telegram ID: ${telegramId}, subscription ID: ${subscriptionId}`,
        service: this.serviceName,
      })

      // Получаем пользователя
      const user = await this.userService.getUserByTgId(telegramId)
      if (!user) {
        this.logger.warn({
          msg: `User with Telegram ID ${telegramId} not found`,
          service: this.serviceName,
        })
        return { success: false, message: 'user_not_found' }
      }

      // Получаем подписку и проверяем, принадлежит ли она пользователю
      const subscription = await this.prismaService.subscriptions.findFirst({
        where: {
          id: subscriptionId,
          userId: user.id,
        },
      })

      if (!subscription) {
        this.logger.warn({
          msg: `Subscription with ID ${subscriptionId} not found or does not belong to user with Telegram ID ${telegramId}`,
          service: this.serviceName,
        })
        return { success: false, message: 'subscription_not_found' }
      }

      // Расчет стоимости подписки
      const cost = await this.calculateSubscriptionCost(
        subscription.period as SubscriptionPeriodEnum,
        user.role.discount,
      )

      // Проверка баланса пользователя
      if (user.balance.paymentBalance < cost) {
        this.logger.warn({
          msg: `Insufficient balance for subscription renewal. Required: ${cost}, available: ${user.balance.paymentBalance}`,
          service: this.serviceName,
        })
        return {
          success: false,
          message: 'insufficient_balance',
          requiredAmount: cost,
          currentBalance: user.balance.paymentBalance,
        }
      }

      // Расчет времени истечения подписки
      const periodHours = this.periodHours(
        subscription.period as SubscriptionPeriodEnum,
      )
      if (periodHours <= 0) {
        this.logger.error({
          msg: `Invalid subscription period: ${subscription.period}`,
          service: this.serviceName,
        })
        return { success: false, message: 'invalid_period' }
      }

      // Определение новой даты истечения подписки
      // Если текущая дата истечения в будущем, добавляем период к ней
      // Иначе добавляем период к текущей дате
      const now = new Date()
      const newExpiredAt =
        subscription.expiredAt > now
          ? addHours(subscription.expiredAt, periodHours)
          : addHours(now, periodHours)

      // Продление подписки и списание средств в транзакции
      const updatedSubscription = await this.prismaService.$transaction(
        async (tx) => {
          // Списание средств с баланса
          await tx.userBalance.update({
            where: {
              id: user.balance.id,
            },
            data: {
              paymentBalance: {
                decrement: cost,
              },
            },
          })

          // Создание записи о транзакции
          await tx.transactions.create({
            data: {
              amount: cost,
              type: TransactionTypeEnum.MINUS,
              reason: TransactionReasonEnum.SUBSCRIPTIONS,
              balanceType: BalanceTypeEnum.PAYMENT,
              isHold: false,
              balanceId: user.balance.id,
            },
          })

          // Обновление даты истечения подписки
          return await tx.subscriptions.update({
            where: {
              id: subscription.id,
            },
            data: {
              expiredAt: newExpiredAt,
              isActive: true, // Активируем подписку, если она была неактивна
            },
          })
        },
      )

      // Отправка уведомления пользователю в Telegram о продлении подписки
      try {
        const allowedOrigin = this.configService.get<string>('ALLOWED_ORIGIN')
        const subscriptionUrl = `${allowedOrigin}/sub/${updatedSubscription.token}`
        const periodText = await this.getLocalizedPeriodText(
          updatedSubscription.period as SubscriptionPeriodEnum,
          user.language.iso6391,
        )

        const message = await this.i18n.t('subscription.renewed_user', {
          lang: user.language.iso6391,
          args: {
            period: periodText,
            cost,
            expiredAt: format(
              updatedSubscription.expiredAt,
              'dd.MM.yyyy HH:mm',
            ),
            subscriptionUrl: subscriptionUrl,
          },
        })

        await this.bot.telegram.sendMessage(telegramId, message)

        this.logger.info({
          msg: `Renewal notification sent to user with Telegram ID: ${telegramId}`,
          service: this.serviceName,
        })
      } catch (error) {
        this.logger.error({
          msg: `Error sending renewal notification to user with Telegram ID: ${telegramId}`,
          error,
          stack: error instanceof Error ? error.stack : undefined,
          service: this.serviceName,
        })
        // Не прерываем выполнение, так как основная операция продления подписки уже выполнена
      }

      this.logger.info({
        msg: `Subscription successfully renewed by user with Telegram ID: ${telegramId}`,
        subscriptionId: updatedSubscription.id,
        service: this.serviceName,
      })

      return { success: true, subscription: updatedSubscription }
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

  /**
   * Сбрасывает токен подписки пользователя
   * @param telegramId - Telegram ID пользователя
   * @param subscriptionId - ID подписки
   * @returns Объект с результатом операции
   */
  public async resetSubscriptionToken(
    telegramId: string,
    subscriptionId: string,
  ): Promise<{ success: boolean; message?: string; subscriptionUrl?: string }> {
    try {
      this.logger.info({
        msg: `Запрос на сброс токена подписки ${subscriptionId} от пользователя с Telegram ID: ${telegramId}`,
        service: this.serviceName,
      })

      // Проверяем существование пользователя
      const user = await this.userService.getUserByTgId(telegramId)
      if (!user) {
        this.logger.warn({
          msg: `Пользователь с Telegram ID ${telegramId} не найден`,
          service: this.serviceName,
        })
        return { success: false, message: 'user_not_found' }
      }

      // Находим подписку и проверяем, принадлежит ли она пользователю
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

      // Отзываем подписку в Marzban
      const marzbanResult = await this.marzbanService.revokeSubscription(
        subscription.username,
      )
      if (!marzbanResult) {
        this.logger.error({
          msg: `Не удалось отозвать подписку для пользователя ${subscription.username} в Marzban`,
          service: this.serviceName,
        })
        // Продолжаем сброс токена даже если не удалось отозвать подписку в Marzban
      }

      // Генерируем новый токен
      const newToken = genToken()

      // Обновляем токен в базе данных
      await this.prismaService.subscriptions.update({
        where: {
          id: subscriptionId,
        },
        data: {
          token: newToken,
        },
      })

      // Формируем новый URL подписки
      const allowedOrigin = this.configService.get<string>('ALLOWED_ORIGIN')
      if (!allowedOrigin) {
        throw new Error('ALLOWED_ORIGIN не настроен в конфигурации')
      }

      const subscriptionUrl = `${allowedOrigin}/sub/${newToken}`

      // Отправляем уведомление пользователю
      await this.sendTokenResetNotification(user, subscription, subscriptionUrl)

      this.logger.info({
        msg: `Токен подписки ${subscriptionId} успешно сброшен для пользователя ${telegramId}`,
        service: this.serviceName,
      })

      return { success: true, subscriptionUrl }
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

  /**
   * Отправляет уведомление о сбросе токена подписки
   * @param user - Пользователь
   * @param subscription - Подписка
   * @param subscriptionUrl - Новый URL подписки
   * @private
   */
  private async sendTokenResetNotification(
    user: any,
    subscription: any,
    subscriptionUrl: string,
  ): Promise<void> {
    try {
      const message = await this.i18n.t('subscription.token_reset', {
        lang: user.language.iso6391,
        args: {
          subscriptionUrl,
          expiredAt: format(subscription.expiredAt, 'dd.MM.yyyy HH:mm'),
        },
      })

      await this.bot.telegram.sendMessage(user.telegramId, message)

      this.logger.info({
        msg: `Уведомление о сбросе токена подписки отправлено пользователю с Telegram ID: ${user.telegramId}`,
        service: this.serviceName,
      })
    } catch (error) {
      this.logger.error({
        msg: `Ошибка при отправке уведомления о сбросе токена подписки пользователю с Telegram ID: ${user.telegramId}`,
        error,
        stack: error instanceof Error ? error.stack : undefined,
        service: this.serviceName,
      })
    }
  }

  /**
   * Переключает статус автоматического продления подписки
   * @param subscriptionId - ID подписки
   * @param telegramId - Telegram ID пользователя
   * @returns Объект с результатом операции
   */
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

      // Проверяем, принадлежит ли подписка пользователю
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

      // Переключаем статус автопродления
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

      // Отправляем уведомление пользователю
      try {
        const userLang = user.language.iso6391 || 'ru'

        const messageKey = updatedSubscription.isAutoRenewal
          ? 'subscription.auto_renewal_enabled'
          : 'subscription.auto_renewal_disabled'

        const message = await this.i18n.t(messageKey, {
          lang: userLang,
        })

        await this.bot.telegram.sendMessage(telegramId, message)

        this.logger.info({
          msg: `Уведомление о смене статуса автопродления отправлено пользователю ${telegramId}`,
          service: this.serviceName,
        })
      } catch (notificationError) {
        this.logger.error({
          msg: `Ошибка при отправке уведомления пользователю ${telegramId}`,
          error: notificationError,
          stack:
            notificationError instanceof Error
              ? notificationError.stack
              : undefined,
          service: this.serviceName,
        })
        // Продолжаем выполнение, даже если уведомление не отправлено
      }

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
