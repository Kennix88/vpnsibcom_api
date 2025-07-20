import { RedisService } from '@core/redis/redis.service'
import { PaymentsService } from '@modules/payments/services/payments.service'
import { PlansEnum } from '@modules/plans/types/plans.enum'
import { PlansInterface } from '@modules/plans/types/plans.interface'
import { UsersService } from '@modules/users/users.service'
import { forwardRef, Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { BalanceTypeEnum } from '@shared/enums/balance-type.enum'
import { DefaultEnum } from '@shared/enums/default.enum'
import { PaymentMethodEnum } from '@shared/enums/payment-method.enum'
import { SubscriptionPeriodEnum } from '@shared/enums/subscription-period.enum'
import { TransactionReasonEnum } from '@shared/enums/transaction-reason.enum'
import { TransactionTypeEnum } from '@shared/enums/transaction-type.enum'
import { genToken } from '@shared/utils/gen-token.util'
import { addHours } from 'date-fns'
import { I18nService } from 'nestjs-i18n'
import { PinoLogger } from 'nestjs-pino'
import { PrismaService } from 'nestjs-prisma'
import { InjectBot } from 'nestjs-telegraf'
import { Telegraf } from 'telegraf'
import { UserCreate } from '../types/marzban.types'
import { ServerDataInterface } from '../types/servers-data.interface'
import {
  GetSubscriptionConfigResponseInterface,
  MarzbanResponseInterface,
  SubscriptionDataInterface,
  SubscriptionResponseInterface,
} from '../types/subscription-data.interface'
import { calculateSubscriptionCost } from '../utils/calculate-subscription-cost.util'
import { filterConfig } from '../utils/filter-config.util'
import { getXrayConfigFormat } from '../utils/get-xray-config-fromat.util'
import { periodHours } from '../utils/period-hours.util'
import { MarzbanService } from './marzban.service'

/**
 * Сервис для работы с Xray
 */
@Injectable()
export class XrayService {
  getLocalizedPeriodText(arg0: SubscriptionPeriodEnum, iso6391: string): any {
    throw new Error('Method not implemented.')
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
        planKey: PlansEnum.TRIAL,
        period: SubscriptionPeriodEnum.TRIAL,
        periodMultiplier: 1,
        isPremium: false,
        isFixedPrice: false,
        devicesCount: plan.devicesCount,
        isAllBaseServers: plan.isAllBaseServers,
        isAllPremiumServers: plan.isAllPremiumServers,
        isUnlimitTraffic: plan.isUnlimitTraffic,
        trafficLimitGb: plan.trafficLimitGb,
        trialDays: user.freePlanDays,
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
      // Логируем входные параметры
      this.logger.info({
        msg: `Get subscriptions - Input params: token=${token}, id=${id}, isToken=${isToken}, agent=${agent}`,
        service: this.serviceName,
      })

      this.logger.info({
        msg: `Get subscriptions: ${token || id}`,
        service: this.serviceName,
      })

      // Логируем условие поиска
      const whereCondition = isToken && token ? { token: token } : { id: id }
      this.logger.info({
        msg: `Search condition: ${JSON.stringify(whereCondition)}`,
        service: this.serviceName,
      })

      this.logger.info({
        msg: `Logick: ${JSON.stringify(isToken && token ? { token } : { id })}`,
        service: this.serviceName,
      })

      // Выполняем запрос к базе данных
      this.logger.info({
        msg: `Executing database query with where: ${JSON.stringify(
          whereCondition,
        )}`,
        service: this.serviceName,
      })

      const subscription = await this.prismaService.subscriptions.findUnique({
        where: { ...whereCondition, isCreated: true, isInvoicing: false },
        include: {
          servers: {
            include: {
              greenList: true,
            },
          },
        },
      })

      // Логируем результат поиска для отладки
      this.logger.info({
        msg: `Search result: ${
          subscription ? 'Subscription found' : 'Subscription not found'
        }`,
        service: this.serviceName,
      })

      // Если подписка найдена, логируем её ID и токен
      if (subscription) {
        this.logger.info({
          msg: `Found subscription with ID: ${subscription.id}, token: ${subscription.token}`,
          service: this.serviceName,
        })
      } else {
        this.logger.warn({
          msg: `Subscription not found with ${isToken ? 'token' : 'id'}: ${
            isToken ? token : id
          }`,
          service: this.serviceName,
        })
        return
      }

      // Формируем список кодов серверов
      const serverCodes =
        subscription.isAllBaseServers && subscription.isAllPremiumServers
          ? []
          : subscription.servers
              ?.flatMap((server) => server.greenList.code)
              .filter(Boolean)

      // Логируем информацию о серверах
      this.logger.info({
        msg: `Server configuration - isAllServers: ${subscription.isAllBaseServers}, isAllPremiumServers: ${subscription.isAllPremiumServers}`,
        service: this.serviceName,
      })

      this.logger.info({
        msg: `Server codes: ${
          serverCodes?.length ? serverCodes.join(', ') : 'all servers'
        }`,
        service: this.serviceName,
      })

      // Регулярное выражение для определения клиента
      const regexAllClients = new RegExp(
        /^([Cc]lash-verge|[Cc]lash[-.]?[Mm]eta|[Ff][Ll][Cc]lash|[Cc]lash|[Ss]tash|[Mm]ihomo|[Ss]tash|SFA|SFI|SFM|SFT|[Hh]app|[Ss]treisand|v2box|v2ray[Nn][Gg]|v2ray[Nn]|[Kk]aring|[Hh]iddify|v2ray|[Hh]iddify[Nn]ext|[Hh]iddify|sing-box|SS|SSR|SSD|SSS|Outline|Shadowsocks|SSconf|TelegramBot|TwitterBot|NekoBox|[Xx]ray-[Cc]hecker)/,
      )

      // Логируем информацию о клиенте
      this.logger.info({
        msg: `Client agent: ${agent}, matches regex: ${regexAllClients.test(
          agent,
        )}`,
        service: this.serviceName,
      })

      let marzbanSubRes: MarzbanResponseInterface

      if (agent && regexAllClients.test(agent!)) {
        this.logger.info({
          msg: `Processing Marzban configuration for agent: ${agent}`,
          service: this.serviceName,
        })

        const marzbanData = subscription.marzbanData

        // Проверяем наличие данных Marzban
        if (!marzbanData) {
          this.logger.warn({
            msg: `Marzban data not found`,
            service: this.serviceName,
          })
          return
        }

        // Преобразуем marzbanData в объект, если он строка JSON
        let marzbanDataObj: Record<string, any>
        try {
          marzbanDataObj =
            typeof marzbanData === 'string'
              ? JSON.parse(marzbanData)
              : (marzbanData as Record<string, any>)
        } catch (error) {
          this.logger.warn({
            msg: `Failed to parse Marzban data: ${error.message}`,
            service: this.serviceName,
          })
          return
        }

        // Проверяем наличие subscription_url в данных Marzban
        if (!marzbanDataObj || !marzbanDataObj.subscription_url) {
          this.logger.warn({
            msg: `Invalid Marzban data format: subscription_url not found`,
            service: this.serviceName,
          })
          return
        }

        // Логируем оригинальный subscription_url для отладки
        this.logger.info({
          msg: `Original subscription_url: ${marzbanDataObj.subscription_url}`,
          service: this.serviceName,
        })

        // Очищаем subscription_url от лишних пробелов и кавычек
        const cleanSubscriptionUrl = String(marzbanDataObj.subscription_url)
          .trim()
          .replace(/[`"'\s]+/g, '')

        this.logger.info({
          msg: `Cleaned subscription_url: ${cleanSubscriptionUrl}`,
          service: this.serviceName,
        })

        // Проверяем, содержит ли очищенный URL '/sub/'
        if (!cleanSubscriptionUrl.includes('/sub/')) {
          this.logger.warn({
            msg: `Invalid subscription_url format: ${cleanSubscriptionUrl}`,
            service: this.serviceName,
          })
          return
        }

        const tokenSub = cleanSubscriptionUrl.split('/sub/')[1]
        const configFormat = getXrayConfigFormat(agent)

        this.logger.info({
          msg: `Marzban token: ${tokenSub}, config format: ${configFormat}`,
          service: this.serviceName,
        })

        // Получаем конфигурацию от Marzban
        this.logger.info({
          msg: `Requesting Marzban subscription config`,
          service: this.serviceName,
        })

        const marzbanRes = await this.marzbanService.getSubscriptionConfig(
          tokenSub,
          configFormat,
          agent,
        )

        if (!marzbanRes) {
          this.logger.warn({
            msg: `Failed to get Marzban subscription config`,
            service: this.serviceName,
          })
          return
        }

        this.logger.info({
          msg: `Marzban response received, content-type: ${marzbanRes.headers['content-type']}`,
          service: this.serviceName,
        })

        // Формируем ответ с конфигурацией
        const filterType =
          configFormat == 'clash' || configFormat == 'clash-meta'
            ? 'clash'
            : configFormat == 'sing-box'
            ? 'sing-box'
            : 'base64'
        // : configFormat == 'v2ray-json'
        // 'json'
        this.logger.info({
          msg: `Filtering config with type: ${filterType}, server codes count: ${
            serverCodes?.length || 0
          }`,
          service: this.serviceName,
        })

        marzbanSubRes = {
          headers: {
            'content-disposition': marzbanRes.headers['content-disposition'],
            'content-type': marzbanRes.headers['content-type'],
          },
          body: filterConfig(filterType, marzbanRes.data, serverCodes),
        }

        this.logger.info({
          msg: `Marzban configuration processed successfully`,
          service: this.serviceName,
          marzbanSubRes,
        })
      } else {
        this.logger.info({
          msg: `Skipping Marzban configuration - agent not matching or not provided`,
          service: this.serviceName,
        })
      }

      // Получаем разрешенный источник из конфигурации
      this.logger.info({
        msg: `Getting allowed origin from config`,
        service: this.serviceName,
      })

      const allowedOrigin = this.configService.get<string>('ALLOWED_ORIGIN')
      if (!allowedOrigin) {
        this.logger.error({
          msg: `ALLOWED_ORIGIN not configured`,
          service: this.serviceName,
        })
        throw new Error('ALLOWED_ORIGIN не настроен в конфигурации')
      }

      this.logger.info({
        msg: `Allowed origin: ${allowedOrigin}`,
        service: this.serviceName,
      })

      // Получаем список всех активных серверов
      this.logger.info({
        msg: `Fetching all active servers from database`,
        service: this.serviceName,
      })

      const getAllServers = await this.prismaService.greenList.findMany({
        where: {
          isActive: true,
        },
      })

      this.logger.info({
        msg: `Found ${getAllServers.length} active servers`,
        service: this.serviceName,
      })

      // Преобразуем данные серверов в нужный формат
      this.logger.info({
        msg: `Mapping server data to response format`,
        service: this.serviceName,
      })

      const allServersMapped = getAllServers.map(
        (server): ServerDataInterface => ({
          code: server.code,
          name: server.name,
          flagKey: server.flagKey,
          flagEmoji: server.flagEmoji,
          network: server.network,
          isActive: server.isActive,
          isPremium: server.isPremium,
        }),
      )

      // Логируем количество базовых и премиум серверов
      const baseServersCount = getAllServers.filter(
        (server) => !server.isPremium,
      ).length
      const premiumServersCount = getAllServers.filter(
        (server) => server.isPremium,
      ).length

      this.logger.info({
        msg: `Server statistics - Total: ${getAllServers.length}, Base: ${baseServersCount}, Premium: ${premiumServersCount}`,
        service: this.serviceName,
      })

      // Формируем итоговый ответ
      this.logger.info({
        msg: `Preparing final response for subscription ${subscription.id}`,
        service: this.serviceName,
      })

      return {
        subscription: {
          id: subscription.id,
          planKey: subscription.planKey as PlansEnum,
          period: subscription.period as SubscriptionPeriodEnum,
          periodMultiplier: subscription.periodMultiplier,
          isActive: subscription.isActive,
          isInvoicing: subscription.isInvoicing,
          isCreated: subscription.isCreated,
          isAutoRenewal: subscription.isAutoRenewal,
          nextRenewalStars: subscription.nextRenewalStars,
          isFixedPrice: subscription.isFixedPrice,
          fixedPriceStars: subscription.fixedPriceStars,
          devicesCount: subscription.devicesCount,
          isAllBaseServers: subscription.isAllBaseServers,
          isAllPremiumServers: subscription.isAllPremiumServers,
          trafficLimitGb: subscription.trafficLimitGb,
          isUnlimitTraffic: subscription.isUnlimitTraffic,
          lastUserAgent: subscription.lastUserAgent,
          dataLimit: subscription.dataLimit * 1024 * 1024,
          usedTraffic: subscription.usedTraffic * 1024 * 1024,
          lifeTimeUsedTraffic: subscription.lifeTimeUsedTraffic * 1024 * 1024,
          links: subscription.links as string[],
          servers:
            subscription.isAllBaseServers && subscription.isAllPremiumServers
              ? allServersMapped
              : subscription.isAllBaseServers &&
                !subscription.isAllPremiumServers
              ? allServersMapped.filter((server) => !server.isPremium)
              : subscription.servers.map(
                  (server): ServerDataInterface => ({
                    code: server.greenList.code,
                    name: server.greenList.name,
                    flagKey: server.greenList.flagKey,
                    flagEmoji: server.greenList.flagEmoji,
                    network: server.greenList.network,
                    isActive: server.greenList.isActive,
                    isPremium: server.greenList.isPremium,
                  }),
                ),
          baseServersCount: subscription.isAllBaseServers
            ? getAllServers.filter((server) => !server.isPremium).length
            : subscription.servers.filter(
                (server) =>
                  !server.greenList.isPremium && server.greenList.isActive,
              ).length,
          premiumServersCount: subscription.isAllPremiumServers
            ? getAllServers.filter((server) => server.isPremium).length
            : subscription.servers.filter(
                (server) =>
                  server.greenList.isPremium && server.greenList.isActive,
              ).length,
          createdAt: subscription.createdAt,
          updatedAt: subscription.updatedAt,
          expiredAt: subscription.expiredAt,
          onlineAt: subscription.onlineAt,
          token: subscription.token,
          subscriptionUrl: `${allowedOrigin}/sub/${subscription.token}`,
        },
        marzbanSubRes,
      }
    } catch (error) {
      // Детальное логирование ошибки
      this.logger.error({
        msg: `Error when receiving a subscription: ${token || id}`,
        error,
        stack: error instanceof Error ? error.stack : undefined,
        service: this.serviceName,
      })

      // Дополнительная информация об ошибке
      if (error instanceof Error) {
        this.logger.error({
          msg: `Error details - Name: ${error.name}, Message: ${error.message}`,
          service: this.serviceName,
        })
      }

      // Логируем параметры запроса, которые привели к ошибке
      this.logger.error({
        msg: `Request parameters that caused error - token: ${token}, id: ${id}, isToken: ${isToken}, agent: ${agent}`,
        service: this.serviceName,
      })

      return
    }

    // Логируем успешное завершение метода
    this.logger.info({
      msg: `Successfully completed getSubscriptionByTokenOrId for ${
        token || id
      }`,
      service: this.serviceName,
    })
  }

  /**
   * Получает список подписок пользователя
   * @param userId - ID пользователя
   * @returns Массив подписок с дополнительной информацией или undefined в случае ошибки
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
          isCreated: true,
          isInvoicing: false,
        },
        include: {
          servers: {
            include: {
              greenList: true,
            },
          },
        },
      })

      // Получаем разрешенный источник из конфигурации
      this.logger.info({
        msg: `Getting allowed origin from config`,
        service: this.serviceName,
      })

      const allowedOrigin = this.configService.get<string>('ALLOWED_ORIGIN')
      if (!allowedOrigin) {
        this.logger.error({
          msg: `ALLOWED_ORIGIN not configured`,
          service: this.serviceName,
        })
        throw new Error('ALLOWED_ORIGIN не настроен в конфигурации')
      }

      this.logger.info({
        msg: `Allowed origin: ${allowedOrigin}`,
        service: this.serviceName,
      })

      // Получаем список всех активных серверов
      this.logger.info({
        msg: `Fetching all active servers from database`,
        service: this.serviceName,
      })

      const getAllServers = await this.prismaService.greenList.findMany({
        where: {
          isActive: true,
        },
      })

      this.logger.info({
        msg: `Found ${getAllServers.length} active servers`,
        service: this.serviceName,
      })

      // Преобразуем данные серверов в нужный формат
      this.logger.info({
        msg: `Mapping server data to response format`,
        service: this.serviceName,
      })

      const allServersMapped = getAllServers.map(
        (server): ServerDataInterface => ({
          code: server.code,
          name: server.name,
          flagKey: server.flagKey,
          flagEmoji: server.flagEmoji,
          network: server.network,
          isActive: server.isActive,
          isPremium: server.isPremium,
        }),
      )

      // Логируем количество базовых и премиум серверов
      const baseServersCount = getAllServers.filter(
        (server) => !server.isPremium,
      ).length
      const premiumServersCount = getAllServers.filter(
        (server) => server.isPremium,
      ).length

      this.logger.info({
        msg: `Server statistics - Total: ${getAllServers.length}, Base: ${baseServersCount}, Premium: ${premiumServersCount}`,
        service: this.serviceName,
      })

      const result: SubscriptionDataInterface[] = subscriptions.map(
        (subscription) => ({
          id: subscription.id,
          planKey: subscription.planKey as PlansEnum,
          period: subscription.period as SubscriptionPeriodEnum,
          periodMultiplier: subscription.periodMultiplier,
          isActive: subscription.isActive,
          isInvoicing: subscription.isInvoicing,
          isCreated: subscription.isCreated,
          isAutoRenewal: subscription.isAutoRenewal,
          nextRenewalStars: subscription.nextRenewalStars,
          isFixedPrice: subscription.isFixedPrice,
          fixedPriceStars: subscription.fixedPriceStars,
          devicesCount: subscription.devicesCount,
          isAllBaseServers: subscription.isAllBaseServers,
          isAllPremiumServers: subscription.isAllPremiumServers,
          trafficLimitGb: subscription.trafficLimitGb,
          isUnlimitTraffic: subscription.isUnlimitTraffic,
          lastUserAgent: subscription.lastUserAgent,
          dataLimit: subscription.dataLimit * 1024 * 1024,
          usedTraffic: subscription.usedTraffic * 1024 * 1024,
          lifeTimeUsedTraffic: subscription.lifeTimeUsedTraffic * 1024 * 1024,
          links: subscription.links as string[],
          servers:
            subscription.isAllBaseServers && subscription.isAllPremiumServers
              ? allServersMapped
              : subscription.isAllBaseServers &&
                !subscription.isAllPremiumServers
              ? allServersMapped.filter((server) => !server.isPremium)
              : subscription.servers.map(
                  (server): ServerDataInterface => ({
                    code: server.greenList.code,
                    name: server.greenList.name,
                    flagKey: server.greenList.flagKey,
                    flagEmoji: server.greenList.flagEmoji,
                    network: server.greenList.network,
                    isActive: server.greenList.isActive,
                    isPremium: server.greenList.isPremium,
                  }),
                ),
          baseServersCount: subscription.isAllBaseServers
            ? getAllServers.filter((server) => !server.isPremium).length
            : subscription.servers.filter(
                (server) =>
                  !server.greenList.isPremium && server.greenList.isActive,
              ).length,
          premiumServersCount: subscription.isAllPremiumServers
            ? getAllServers.filter((server) => server.isPremium).length
            : subscription.servers.filter(
                (server) =>
                  server.greenList.isPremium && server.greenList.isActive,
              ).length,
          createdAt: subscription.createdAt,
          updatedAt: subscription.updatedAt,
          expiredAt: subscription.expiredAt,
          onlineAt: subscription.onlineAt, // Already processed in subscription-manager.service.ts
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
        fixedPriceStars: settings.fixedPriceStars,
        telegramPartnerProgramRatio: settings.telegramPartnerProgramRatio,
        subscriptions: result,
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
   * @param {Object} params - Параметры для создания подписки
   * @param {string} params.telegramId - Telegram ID пользователя
   * @param {SubscriptionPeriodEnum} params.period - Период подписки
   * @param {number} params.periodMultiplier - Множитель периода подписки
   * @param {boolean} params.isPremium - Флаг премиум-подписки
   * @param {boolean} params.isFixedPrice - Флаг фиксированной цены
   * @param {number} [params.fixedPriceStars] - Фиксированная цена в звездах (опционально)
   * @param {number} params.devicesCount - Количество устройств
   * @param {boolean} params.isAllServers - Флаг доступа ко всем серверам
   * @param {boolean} params.isAllPremiumServers - Флаг доступа ко всем премиум-серверам
   * @param {number} [params.trafficLimitGb] - Лимит трафика в ГБ (опционально)
   * @param {boolean} params.isUnlimitTraffic - Флаг безлимитного трафика
   * @param {number} [params.trialDays] - Количество дней для пробного периода (опционально)
   * @returns {Promise<Subscriptions|false>} Созданная подписка или false в случае ошибки
   */
  public async createSubscription({
    telegramId,
    planKey,
    period,
    periodMultiplier,
    isPremium,
    isFixedPrice,
    fixedPriceStars,
    nextRenewalStars,
    devicesCount,
    isAllBaseServers,
    isAllPremiumServers,
    trafficLimitGb,
    isUnlimitTraffic,
    trialDays,
    servers,
    isAutoRenewal = true,
    isInvoice = false,
  }: {
    telegramId: string
    planKey: PlansEnum
    period: SubscriptionPeriodEnum
    periodMultiplier: number
    isPremium: boolean
    isFixedPrice: boolean
    fixedPriceStars?: number
    nextRenewalStars?: number
    devicesCount: number
    isAllBaseServers: boolean
    isAllPremiumServers: boolean
    trafficLimitGb?: number
    isUnlimitTraffic: boolean
    servers: string[]
    trialDays?: number
    isAutoRenewal?: boolean
    isInvoice?: boolean
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

      const token = genToken()
      const username = `${user.telegramId}_${Math.random()
        .toString(36)
        .substring(2)}`
      const isIndefinitely = period === SubscriptionPeriodEnum.INDEFINITELY

      if (isInvoice) {
        const subscriptionData = {
          username,
          isPremium,
          planKey,
          isAutoRenewal: isIndefinitely ? false : isAutoRenewal,
          isFixedPrice,
          fixedPriceStars: isIndefinitely ? null : fixedPriceStars,
          devicesCount,
          isAllBaseServers,
          isAllPremiumServers,
          trafficLimitGb,
          isUnlimitTraffic,
          userId: user.id,
          period,
          periodMultiplier,
          isActive: false,
          isInvoicing: true,
          isCreated: false,
          token,
          dataLimit: 0,
          usedTraffic: 0,
          lifeTimeUsedTraffic: 0,
          nextRenewalStars: isIndefinitely ? null : nextRenewalStars,
          servers: {
            create: getServers.map((server) => ({
              greenListId: server.green,
            })),
          },
        }
        // Создание подписки в базе данных
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

        return subscription
      }

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
        ...(!isUnlimitTraffic && {
          data_limit_reset_strategy: 'day',
          data_limit: trafficLimitGb * 1024 * 1024 * 1024,
        }),
        note: `${user.id}/${user.telegramId}/${
          user.telegramData?.username || ''
        }/${user.telegramData?.firstName || ''}/${
          user.telegramData?.lastName || ''
        }`,
      }

      // Добавление пользователя в Marzban
      const marzbanData = await this.marzbanService.addUser(marbanDataStart)
      if (!marzbanData) {
        this.logger.error({
          msg: `Не удалось добавить пользователя в Marzban для Telegram ID: ${telegramId}`,
          service: this.serviceName,
        })
        return false
      }

      await this.marzbanService.restartCore()

      // Расчет времени истечения подписки
      const hours = periodHours(period, periodMultiplier, trialDays)
      if (period !== SubscriptionPeriodEnum.INDEFINITELY && hours <= 0) {
        this.logger.error({
          msg: `Некорректный период подписки: ${period}`,
          service: this.serviceName,
        })
        return false
      }

      const subscriptionData = {
        username,
        isPremium,
        planKey,
        // Для INDEFINITELY всегда отключаем автопродление
        isAutoRenewal: isIndefinitely ? false : isAutoRenewal,
        isFixedPrice,
        // Для INDEFINITELY обнуляем fixedPriceStars
        fixedPriceStars: isIndefinitely ? null : fixedPriceStars,
        devicesCount,
        isAllBaseServers,
        isAllPremiumServers,
        trafficLimitGb,
        isUnlimitTraffic,
        userId: user.id,
        period,
        periodMultiplier,
        isActive: true,
        isInvoicing: false,
        isCreated: true,
        token,
        links: marzbanData.links,
        dataLimit: marzbanData.data_limit / 1024 / 1024,
        usedTraffic: marzbanData.used_traffic / 1024 / 1024,
        lifeTimeUsedTraffic: marzbanData.used_traffic / 1024 / 1024,
        // Для INDEFINITELY устанавливаем expiredAt в null
        expiredAt: isIndefinitely ? null : addHours(new Date(), hours),
        // Для INDEFINITELY обнуляем nextRenewalStars
        nextRenewalStars: isIndefinitely ? null : nextRenewalStars,
        marzbanData: JSON.parse(JSON.stringify(marzbanData)),
        servers: {
          create: getServers.map((server) => ({
            greenListId: server.green,
          })),
        },
      }

      // Создание подписки в базе данных
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

      // Обработка реферальной системы
      await this.processReferrals(user)

      this.logger.info({
        msg: `Подписка успешно создана для пользователя с Telegram ID: ${telegramId}`,
        subscriptionId: subscription.id,
        service: this.serviceName,
      })

      try {
        if (subscription.isActive && !subscription.isInvoicing)
          await this.bot.telegram
            .sendMessage(
              Number(process.env.TELEGRAM_LOG_CHAT_ID),
              `<b>👍 НОВАЯ ПОДПИСКА СОЗДАНА</b>
<b>Пользователь:</b> <code>${subscription.userId}</code>
<b>Username :</b> <code>${subscription.username}</code>
<b>Тариф:</b> <code>${subscription.planKey}</code>
<b>Дата истечения:</b> <code>${subscription.expiredAt}</code>
<b>Автопродление:</b> <code>${subscription.isAutoRenewal}</code>
<b>Множитель периода:</b> <code>${subscription.periodMultiplier}</code>
<b>Цена следующей оплаты:</b> <code>${subscription.nextRenewalStars}</code>
<b>Премиум:</b> <code>${subscription.isPremium}</code>
<b>Цена фиксирована:</b> <code>${subscription.isFixedPrice}</code>
<b>Фикс цена:</b> <code>${subscription.fixedPriceStars}</code>
<b>Устройства:</b> <code>${subscription.devicesCount}</code>
<b>Все базовые сервера:</b> <code>${subscription.isAllBaseServers}</code>
<b>Все премиум сервера:</b> <code>${subscription.isAllPremiumServers}</code>
<b>Лимит трафика:</b> <code>${subscription.trafficLimitGb}</code>
<b>Безлимит:</b> <code>${subscription.isUnlimitTraffic}</code>
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
   * Обрабатывает реферальную систему для пользователя
   * @param user - Пользователь
   * @private
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
   * Покупка подписки пользователем
   * @param telegramId - Telegram ID пользователя
   * @param period - Период подписки
   * @param isAutoRenewal - Флаг автопродления (опционально)
   * @returns Результат покупки подписки или false в случае ошибки
   */
  public async purchaseSubscription({
    telegramId,
    planKey,
    period,
    periodMultiplier,
    isFixedPrice,
    devicesCount,
    isAllBaseServers,
    isAllPremiumServers,
    trafficLimitGb,
    isUnlimitTraffic,
    servers = [],
    isAutoRenewal = true,
    method,
    isInvoice = false,
  }: {
    telegramId: string
    planKey: PlansEnum
    period: SubscriptionPeriodEnum
    periodMultiplier: number
    isFixedPrice: boolean
    devicesCount: number
    isAllBaseServers: boolean
    isAllPremiumServers: boolean
    trafficLimitGb?: number
    isUnlimitTraffic: boolean
    servers?: string[]
    isAutoRenewal?: boolean
    method?: PaymentMethodEnum
    isInvoice?: boolean
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

      // Расчет стоимости подписки
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

      // Расчет стоимости с учетом периода и скидки пользователя
      const cost = calculateSubscriptionCost({
        period: period,
        plan: getPlan as PlansInterface,
        isPremium: user.telegramData.isPremium,
        periodMultiplier,
        devicesCount,
        isAllBaseServers,
        isAllPremiumServers,
        isUnlimitTraffic,
        userDiscount: user.role.discount,
        settings: settings,
        serversCount: baseServers.length,
        premiumServersCount: premiumServers.length,
        trafficLimitGb,
      })

      const finalCost = isFixedPrice ? cost + settings.fixedPriceStars : cost
      const nextFinalCost = user.isTgProgramPartner
        ? finalCost * settings.telegramPartnerProgramRatio
        : finalCost

      const partnerCost = user.isTgProgramPartner
        ? cost * settings.telegramPartnerProgramRatio
        : cost

      if (isInvoice) {
        if (!method) {
          return { success: false, message: 'payment_method_required' }
        }

        const subscription = await this.createSubscription({
          isPremium: user.telegramData.isPremium,
          planKey,
          period,
          periodMultiplier,
          isFixedPrice,
          fixedPriceStars: partnerCost,
          nextRenewalStars: partnerCost,
          devicesCount,
          isAllBaseServers,
          isAllPremiumServers,
          trafficLimitGb,
          isUnlimitTraffic,
          servers,
          isAutoRenewal,
          telegramId,
          isInvoice: true,
        })

        if (!subscription) {
          this.logger.error({
            msg: `Не удалось создать инвойс на подписку для пользователя с Telegram ID: ${telegramId}`,
            service: this.serviceName,
          })
          return { success: false, message: 'subscription_creation_failed' }
        }

        const invoice = await this.paymentsService.createInvoice(
          Math.ceil(nextFinalCost),
          method,
          user.telegramId,
          subscription.id,
        )

        return { success: true, invoice }
      }

      // Проверяем баланс и списываем средства с помощью UsersService
      // Предварительная проверка баланса для вывода информативного сообщения
      const totalAvailableBalance =
        user.balance.paymentBalance +
        (user.balance.isUseWithdrawalBalance
          ? user.balance.withdrawalBalance
          : 0)

      if (totalAvailableBalance < nextFinalCost) {
        this.logger.warn({
          msg: `Недостаточно средств для покупки подписки. Требуется: ${nextFinalCost}, доступно: ${totalAvailableBalance}`,
          service: this.serviceName,
        })
        return {
          success: false,
          message: 'insufficient_balance',
          requiredAmount: nextFinalCost,
          currentBalance: totalAvailableBalance,
        }
      }

      // Создание подписки и списание средств в транзакции
      // Используем метод deductUserBalance из UsersService для списания средств
      const deductResult = await this.userService.deductUserBalance(
        user.id,
        nextFinalCost,
        TransactionReasonEnum.SUBSCRIPTIONS,
        BalanceTypeEnum.PAYMENT,
        { forceUseWithdrawalBalance: user.balance.isUseWithdrawalBalance },
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

      // Логируем информацию о списании
      this.logger.info({
        msg: `Успешно списаны средства для подписки`,
        userId: user.id,
        paymentAmount: deductResult.paymentAmount,
        withdrawalAmount: deductResult.withdrawalAmount,
        service: this.serviceName,
      })

      const subscription = await this.createSubscription({
        isPremium: user.telegramData.isPremium,
        planKey,
        period,
        periodMultiplier,
        isFixedPrice,
        fixedPriceStars: partnerCost,
        nextRenewalStars: partnerCost,
        devicesCount,
        isAllBaseServers,
        isAllPremiumServers,
        trafficLimitGb,
        isUnlimitTraffic,
        servers,
        isAutoRenewal,
        telegramId,
      })

      if (!subscription) {
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
   * Изменяет условия существующей подписки пользователя
   * @param telegramId - Telegram ID пользователя
   * @param subscriptionId - ID подписки для изменения
   * @param newConditions - Новые условия подписки
   * @returns Результат операции изменения условий
   */
  public async changeSubscriptionConditions(
    telegramId: string,
    subscriptionId: string,
    {
      planKey,
      period,
      periodMultiplier,
      isFixedPrice,
      devicesCount,
      isAllBaseServers,
      isAllPremiumServers,
      trafficLimitGb,
      isUnlimitTraffic,
      servers = [],
      isAutoRenewal = true,
    }: {
      planKey: PlansEnum
      period: SubscriptionPeriodEnum
      periodMultiplier: number
      isFixedPrice: boolean
      devicesCount: number
      isAllBaseServers: boolean
      isAllPremiumServers: boolean
      trafficLimitGb?: number
      isUnlimitTraffic: boolean
      servers?: string[]
      isAutoRenewal?: boolean
    },
  ) {
    try {
      this.logger.info({
        msg: `Запрос на изменение условий подписки ${subscriptionId} от пользователя с Telegram ID: ${telegramId}`,
        service: this.serviceName,
      })

      // Получаем пользователя
      const user = await this.userService.getUserByTgId(telegramId)
      if (!user) {
        this.logger.warn({
          msg: `Пользователь с Telegram ID ${telegramId} не найден`,
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
          msg: `Подписка с ID ${subscriptionId} не найдена или не принадлежит пользователю с Telegram ID ${telegramId}`,
          service: this.serviceName,
        })
        return { success: false, message: 'subscription_not_found' }
      }

      // Проверяем, истек ли срок подписки
      const now = new Date()
      if (subscription.expiredAt > now) {
        this.logger.warn({
          msg: `Невозможно изменить условия подписки ${subscriptionId}, так как срок её действия ещё не истек`,
          service: this.serviceName,
        })
        return { success: false, message: 'subscription_not_expired' }
      }

      // Получаем серверы
      const getServers = await this.prismaService.greenList.findMany({
        where: {
          code: {
            in: servers,
          },
        },
      })

      const baseServers = getServers.filter((server) => !server.isPremium)
      const premiumServers = getServers.filter((server) => server.isPremium)

      // Расчет стоимости подписки
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

      // Расчет стоимости с учетом периода и скидки пользователя
      const cost = calculateSubscriptionCost({
        period: period,
        plan: getPlan as PlansInterface,
        isPremium: user.telegramData.isPremium,
        periodMultiplier,
        devicesCount,
        isAllBaseServers,
        isAllPremiumServers,
        isUnlimitTraffic,
        userDiscount: user.role.discount,
        settings: settings,
        serversCount: baseServers.length,
        premiumServersCount: premiumServers.length,
        trafficLimitGb,
      })

      // Проверяем баланс и списываем средства с помощью UsersService
      // Предварительная проверка баланса для вывода информативного сообщения
      const totalAvailableBalance =
        user.balance.paymentBalance +
        (user.balance.isUseWithdrawalBalance
          ? user.balance.withdrawalBalance
          : 0)

      if (totalAvailableBalance < cost) {
        this.logger.warn({
          msg: `Недостаточно средств для изменения условий подписки. Требуется: ${cost}, доступно: ${totalAvailableBalance}`,
          service: this.serviceName,
        })
        return {
          success: false,
          message: 'insufficient_balance',
          requiredAmount: cost,
          currentBalance: totalAvailableBalance,
        }
      }

      // Расчет времени истечения подписки
      const hours = periodHours(period, periodMultiplier)
      if (hours <= 0) {
        this.logger.error({
          msg: `Некорректный период подписки: ${period}`,
          service: this.serviceName,
        })
        return { success: false, message: 'invalid_period' }
      }

      // Удаляем пользователя из Marzban
      const marzbanRemoveResult = await this.marzbanService.removeUser(
        subscription.username,
      )
      if (!marzbanRemoveResult) {
        this.logger.error({
          msg: `Не удалось удалить пользователя ${subscription.username} из Marzban`,
          service: this.serviceName,
        })
        // Продолжаем обновление, даже если не удалось удалить из Marzban
      }

      // Создаем нового пользователя в Marzban с тем же username
      const marbanDataStart: UserCreate = {
        username: subscription.username,
        proxies: {
          vless: {
            flow: 'xtls-rprx-vision',
          },
        },
        inbounds: {
          vless: ['VLESS'],
        },
        status: 'active',
        ...(!isUnlimitTraffic && {
          data_limit_reset_strategy: 'day',
          data_limit: trafficLimitGb * 1024 * 1024 * 1024,
        }),
        note: `${user.id}/${user.telegramId}/${
          user.telegramData?.username || ''
        }/${user.telegramData?.firstName || ''}/${
          user.telegramData?.lastName || ''
        }`,
      }

      // Добавление пользователя в Marzban
      const marzbanData = await this.marzbanService.addUser(marbanDataStart)
      if (!marzbanData) {
        this.logger.error({
          msg: `Не удалось добавить пользователя в Marzban для Telegram ID: ${telegramId}`,
          service: this.serviceName,
        })
        return { success: false, message: 'marzban_error' }
      }

      // Списание средств и обновление подписки в транзакции
      const updatedSubscription = await this.prismaService.$transaction(
        async (tx) => {
          // Списываем средства
          const deductResult = await this.userService.deductUserBalance(
            user.id,
            cost,
            TransactionReasonEnum.SUBSCRIPTIONS,
            BalanceTypeEnum.PAYMENT,
            { forceUseWithdrawalBalance: user.balance.isUseWithdrawalBalance },
          )

          if (!deductResult.success) {
            this.logger.warn({
              msg: `Недостаточно средств для изменения условий подписки`,
              userId: user.id,
              cost,
              service: this.serviceName,
            })
            throw new Error('insufficient_balance')
          }

          // Логируем информацию о списании
          this.logger.info({
            msg: `Успешно списаны средства для изменения условий подписки`,
            userId: user.id,
            paymentAmount: deductResult.paymentAmount,
            withdrawalAmount: deductResult.withdrawalAmount,
            service: this.serviceName,
          })

          // Удаляем существующие связи с серверами
          await tx.subscriptionToGreenList.deleteMany({
            where: {
              subscriptionId: subscription.id,
            },
          })

          // Обновляем подписку
          return await tx.subscriptions.update({
            where: {
              id: subscriptionId,
            },
            data: {
              isPremium: user.telegramData.isPremium,
              isAutoRenewal,
              isFixedPrice,
              fixedPriceStars: isFixedPrice ? cost : undefined,
              nextRenewalStars: cost,
              devicesCount,
              isAllBaseServers,
              isAllPremiumServers,
              trafficLimitGb,
              isUnlimitTraffic,
              period,
              periodMultiplier,
              isActive: true,
              links: marzbanData.links,
              dataLimit: marzbanData.data_limit,
              usedTraffic: marzbanData.used_traffic,
              lifeTimeUsedTraffic: marzbanData.used_traffic,
              expiredAt: addHours(now, hours),
              marzbanData: JSON.parse(JSON.stringify(marzbanData)),
              servers: {
                create: getServers.map((server) => ({
                  greenListId: server.green,
                })),
              },
            },
          })
        },
      )

      this.logger.info({
        msg: `Условия подписки ${subscriptionId} успешно изменены для пользователя ${telegramId}`,
        service: this.serviceName,
      })

      return { success: true, subscription: updatedSubscription }
    } catch (error) {
      this.logger.error({
        msg: `Ошибка при изменении условий подписки для пользователя с Telegram ID: ${telegramId}`,
        error,
        stack: error instanceof Error ? error.stack : undefined,
        service: this.serviceName,
      })
      return {
        success: false,
        message: error instanceof Error ? error.message : 'internal_error',
      }
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
      const cost = subscription.nextRenewalStars

      // Проверка баланса пользователя с учетом возможности использования withdrawalBalance
      const totalAvailableBalance =
        user.balance.paymentBalance +
        (user.balance.isUseWithdrawalBalance
          ? user.balance.withdrawalBalance
          : 0)

      if (totalAvailableBalance < cost) {
        this.logger.warn({
          msg: `Insufficient balance for subscription renewal. Required: ${cost}, available: ${totalAvailableBalance}`,
          service: this.serviceName,
        })
        return {
          success: false,
          message: 'insufficient_balance',
          requiredAmount: cost,
          currentBalance: totalAvailableBalance,
        }
      }

      // Расчет времени истечения подписки
      const hours = periodHours(
        subscription.period as SubscriptionPeriodEnum,
        subscription.periodMultiplier,
      )
      if (hours <= 0) {
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
          ? addHours(subscription.expiredAt, hours)
          : addHours(now, hours)

      // Продление подписки и списание средств в транзакции
      const updatedSubscription = await this.prismaService.$transaction(
        async (tx) => {
          const deductResult = await this.userService.deductUserBalance(
            user.id,
            cost,
            TransactionReasonEnum.SUBSCRIPTIONS,
            BalanceTypeEnum.PAYMENT,
            { forceUseWithdrawalBalance: user.balance.isUseWithdrawalBalance },
          )

          if (!deductResult.success) {
            this.logger.warn({
              msg: `Insufficient funds for subscription purchase`,
              userId: user.id,
              cost,
              service: this.serviceName,
            })
            return { success: false, message: 'insufficient_balance' }
          }

          this.logger.info({
            msg: `Successfully deducted funds for subscription`,
            userId: user.id,
            paymentAmount: deductResult.paymentAmount,
            withdrawalAmount: deductResult.withdrawalAmount,
            service: this.serviceName,
          })

          // Обновление даты истечения подписки
          return await tx.subscriptions.update({
            where: {
              id: subscription.id,
            },
            data: {
              period:
                subscription.period == SubscriptionPeriodEnum.TRIAL
                  ? SubscriptionPeriodEnum.MONTH
                  : (subscription.period as SubscriptionPeriodEnum),
              expiredAt: newExpiredAt,
              isActive: true, // Активируем подписку, если она была неактивна
            },
          })
        },
      )

      this.logger.info({
        msg: `Subscription successfully renewed by user with Telegram ID: ${telegramId}`,
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
          marzbanData: JSON.parse(JSON.stringify(marzbanResult)),
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
