import { LoggerTelegramService } from '@core/logger/logger-telegram.service'
import { Prisma } from '@core/prisma/generated/client'
import { PrismaService } from '@core/prisma/prisma.service'
import { RedisService } from '@core/redis/redis.service'
import { UserInBotInterface } from '@integrations/telegram/types/user-in-bot.interface'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { BalanceTypeEnum } from '@shared/enums/balance-type.enum'
import { CurrencyEnum } from '@shared/enums/currency.enum'
import { DefaultEnum } from '@shared/enums/default.enum'
import { TransactionReasonEnum } from '@shared/enums/transaction-reason.enum'
import { TransactionTypeEnum } from '@shared/enums/transaction-type.enum'
import { UserRolesEnum } from '@shared/enums/user-roles.enum'
import { TelegramInitDataInterface } from '@shared/types/telegram-init-data.interface'
import {
  PremiumStatusMethodInterface,
  PremiumStatusPeriodInterface,
  UserDataInterface,
} from '@shared/types/user-data.interface'
import { TelegramPlatformEnum } from '@shared/utils/detect-platform.util'
import { isRtl } from '@shared/utils/is-rtl.util'
import { parseStartParamUtil } from '@shared/utils/parse-start-param.util'
import { addHours, isBefore } from 'date-fns'
import { PinoLogger } from 'nestjs-pino'
import { InjectBot } from 'nestjs-telegraf'
import { Markup, Telegraf } from 'telegraf'
import { EventType } from '../types/event-type.enum'
import {
  PayPremiumMethodsEnum,
  PayPremiumPeriodEnum,
} from '../types/pay-premium.dto'
import {
  periodHoursCalculateUtil,
  periodMonthsCalculateUtil,
  periodRatioCalculateUtil,
} from '../util/period-calculate.util'
import { EventsService } from './events.service'

type BalanceMutationType =
  | BalanceTypeEnum.PAYMENT
  | BalanceTypeEnum.HOLD
  | BalanceTypeEnum.USDT

interface MutateBalanceExtra {
  holdExpiredAt?: Date
}

interface MutateBalanceResult {
  success: boolean
  transactionId?: string
}

@Injectable()
export class UsersService {
  private USER_ACTIVITY_PREFIX = 'user_activity:'
  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly logger: PinoLogger,
    private readonly telegramLogger: LoggerTelegramService,
    private readonly redis: RedisService,
    private readonly eventsService: EventsService,
    @InjectBot() private readonly bot: Telegraf,
  ) {}

  public async updateLanguage(tgId: string, language: string) {
    try {
      const languageId = await this.prismaService.language.findUnique({
        where: { iso6391: language },
        select: { id: true },
      })

      return await this.prismaService.users.update({
        where: { telegramId: tgId },
        data: { languageId: languageId.id },
      })
    } catch (e) {
      this.logger.error({ msg: `Error while updating user language`, e })
    }
  }

  public async updateCurrency(tgId: string, currency: CurrencyEnum) {
    try {
      return await this.prismaService.users.update({
        where: { telegramId: tgId },
        data: { currencyKey: currency },
      })
    } catch (e) {
      this.logger.error({ msg: `Error while updating user currency`, e })
    }
  }

  public async updateUserActivity(userId: string) {
    try {
      await this.prismaService.users.update({
        where: { id: userId },
        data: { lastStartedAt: new Date() },
      })
    } catch (e) {
      this.logger.error({
        msg: `Error while touching user lastStartedAt`,
        userId,
        e,
      })
    }
  }

  public async getResUserById(id: string): Promise<UserDataInterface> {
    const user = await this.prismaService.users.findUnique({ where: { id } })
    return this.getResUserByTgId(user.telegramId)
  }

  public async getResUserByTgId(
    telegramId: string,
  ): Promise<UserDataInterface> {
    try {
      const user = await this.getUserByTgId(telegramId)
      if (!user) return

      const settings = await this.prismaService.settings.findUnique({
        where: { key: DefaultEnum.DEFAULT },
      })

      const messageId: string = await this.bot.telegram
        // @ts-ignore
        .callApi('savePreparedInlineMessage', {
          user_id: user.telegramId,
          result: {
            type: 'photo',
            id: crypto.randomUUID(),
            photo_url:
              'https://kennix88.github.io/vpnsib-tonconnect-manifest/welcome-2.jpg',
            thumbnail_url:
              'https://kennix88.github.io/vpnsib-tonconnect-manifest/welcome-2.jpg',
            caption:
              '<b>VPN, который думает за тебя 🧠\nЗаблокированное — открывает. Российские сайты — пускает напрямую. Игры — без потери пинга.\nИ всё это бесплатно, прямо в Telegram</b>',
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    ...Markup.button.url(
                      '🛡️ Подключить VPN бесплатно',
                      `${this.configService.get('TMA_URL')}?startapp=r-${
                        user.telegramId
                      }`,
                    ),
                    // @ts-ignore
                    style: 'success',
                  },
                ],
              ],
            },
          },
          allow_user_chats: true,
          allow_bot_chats: true,
          allow_group_chats: true,
          allow_channel_chats: true,
        })
        .then((res) => {
          // @ts-ignore
          return res?.id as string
        })

      const amountStars =
        settings.premiumStatusPriceStars *
        settings.premiumStatusDiscountRatio *
        user.role.discount

      const normolize = (amount) => Number(amount.toFixed(2))

      const methods: PremiumStatusMethodInterface[] = [
        {
          method: PayPremiumMethodsEnum.BALANCE_STARS,
          price: settings.premiumStatusPriceStars,
          finalPrice: normolize(amountStars),
          icon: 'star',
        },
        {
          method: PayPremiumMethodsEnum.BALANCE_USDT,
          price: normolize(
            settings.premiumStatusPriceStars * settings.tgStarsToUSD,
          ),
          finalPrice: normolize(amountStars * settings.tgStarsToUSD),
          icon: 'usdt',
        },
      ]
      const periods: PremiumStatusPeriodInterface[] = [
        {
          period: PayPremiumPeriodEnum.MONTH,
          name: '1 месяц',
          discount: periodRatioCalculateUtil(
            PayPremiumPeriodEnum.MONTH,
            settings,
          ),
        },
        {
          period: PayPremiumPeriodEnum.THREE_MONTH,
          name: '3 месяца',
          discount: periodRatioCalculateUtil(
            PayPremiumPeriodEnum.THREE_MONTH,
            settings,
          ),
        },
        {
          period: PayPremiumPeriodEnum.SIX_MONTH,
          name: '6 месяцев',
          discount: periodRatioCalculateUtil(
            PayPremiumPeriodEnum.SIX_MONTH,
            settings,
          ),
        },
        {
          period: PayPremiumPeriodEnum.YEAR,
          name: '1 год',
          discount: periodRatioCalculateUtil(
            PayPremiumPeriodEnum.YEAR,
            settings,
          ),
        },
        {
          period: PayPremiumPeriodEnum.TWO_YEAR,
          name: '2 года',
          discount: periodRatioCalculateUtil(
            PayPremiumPeriodEnum.TWO_YEAR,
            settings,
          ),
        },
        {
          period: PayPremiumPeriodEnum.THREE_YEAR,
          name: '3 года',
          discount: periodRatioCalculateUtil(
            PayPremiumPeriodEnum.THREE_YEAR,
            settings,
          ),
        },
        {
          period: PayPremiumPeriodEnum.INDEFINITELY,
          name: 'Пожизненно',
          discount: periodRatioCalculateUtil(
            PayPremiumPeriodEnum.INDEFINITELY,
            settings,
          ),
        },
      ]

      return {
        id: user.id,
        telegramId: user.telegramId,
        isTgProgramPartner: user.isTgProgramPartner,
        isBanned: user.isBanned,
        isDeleted: user.isDeleted,
        banExpiredAt: user.banExpiredAt,
        premiumExpiredAt: user.premiumExpiredAt,
        deletedAt: user.deletedAt,
        tgProgramPartnerExpiredAt: user.tgProgramPartnerExpiredAt,
        role: user.role.key as UserRolesEnum,
        roleName: user.role.name,
        roleDiscount: user.role.discount,
        isPremium: user.telegramData.isPremium,
        fullName: `${user.telegramData.firstName}${
          user.telegramData.lastName ? ` ${user.telegramData.lastName}` : ''
        }`,
        username: user.telegramData.username,
        photoUrl: user.telegramData.photoUrl,
        languageCode: user.language.iso6391,
        currencyCode: user.currency.key as CurrencyEnum,
        referralsCount: user.referrals.length,
        balance: {
          payment: Number(user.balance.paymentBalance),
          hold: Number(user.balance.holdBalance),
          usdt: Number(user.balance.usdt),
        },
        inviteUrl: `${this.configService.get('TMA_URL')}?startapp=r-${
          user.telegramId
        }`,
        inviteMessageId: messageId,
        nextAdsRewardAt: user.nextAdsRewardAt,
        nextAdsgramTaskAt: user.nextAdsgramTaskAt,
        minPayStars: user.role.minPayStars,
        lastFullscreenViewedAt: user.adsData.lastFullscreenViewedAt,
        premium: {
          methods,
          periods,
        },
      }
    } catch (e) {
      this.logger.error({ msg: `Error while getting user by tgId`, e })
    }
  }

  public async getUserByTgId(telegramId: string) {
    try {
      return await this.prismaService.users.findUnique({
        where: { telegramId },
        include: {
          balance: true,
          subscription: true,
          referrals: true,
          inviters: {
            include: {
              inviter: { include: { balance: true } },
            },
          },
          telegramData: true,
          adsData: true,
          currency: true,
          language: true,
          role: true,
          acquisition: true,
        },
      })
    } catch (e) {
      this.logger.error({ msg: `Error while getting user by tgId`, e })
    }
  }

  public async updateTelegramDataUser(
    telegramId: string,
    initData: TelegramInitDataInterface,
    birth?: { year?: number; month: number; day: number },
    bio?: string,
  ) {
    try {
      const user = await this.prismaService.users.findUnique({
        where: { telegramId },
        select: { telegramDataId: true },
      })
      if (!user) return

      const isRTL = !initData
        ? false
        : isRtl([initData?.user.first_name, initData?.user.last_name])

      await this.prismaService.userTelegramData.update({
        where: { id: user.telegramDataId },
        data: {
          isLive: true,
          isRtl: isRTL,
          firstName: initData.user.first_name,
          lastName: initData.user.last_name,
          username: initData.user.username,
          languageCode: initData.user.language_code,
          isPremium: initData.user.is_premium,
          isBot: initData.user.is_bot,
          photoUrl: initData.user.photo_url,
          addedToAttachmentMenu: initData.user.added_to_attachment_menu,
          allowsWriteToPm: initData.user.allows_write_to_pm,
          ...(birth && {
            birthDay: birth?.day ?? null,
            birthMonth: birth?.month ?? null,
            birthYear: birth?.year ?? null,
          }),
          ...(bio && {
            bio,
          }),
        },
      })
    } catch (e) {
      this.logger.error({
        msg: `Error while updating telegram data user by tgId`,
        e,
      })
    }
  }

  public async createUser({
    telegramId,
    referralKey,
    initData,
    userInBotData,
    isTelegramPartner,
    birth,
    country,
    startParam,
    ua,
    ip,
    telegramPlatform,
    bio,
  }: {
    telegramId: string
    referralKey?: string
    initData?: TelegramInitDataInterface
    userInBotData?: UserInBotInterface
    isTelegramPartner?: boolean
    birth?: { year?: number; month: number; day: number }
    country?: string
    startParam?: string
    ua?: string
    ip?: string
    telegramPlatform?: TelegramPlatformEnum
    bio?: string
  }) {
    try {
      // Исключаем пользователей с отрицательным Telegram ID (боты, каналы и т.д.)
      if (Number(telegramId) < 0) {
        this.logger.warn({
          msg: 'Registration rejected: negative Telegram ID',
          telegramId,
        })
        return null
      }
      const user = await this.prismaService.$transaction(async (tx) => {
        const parseStartParams = parseStartParamUtil(startParam ?? '')
        const balance = await tx.userBalance.create({ data: {} })
        const isRTL = !initData
          ? false
          : isRtl([initData?.user.first_name, initData?.user.last_name])
        const requestedLanguageCode =
          initData?.user?.language_code ?? userInBotData?.language_code ?? 'en'

        const defaultTelegramData: Prisma.UserTelegramDataCreateInput = {
          firstName: 'ANONIM',
          languageCode: 'ru',
          isLive: true,
        }
        const birthData = {
          birthDay: birth?.day ?? null,
          birthMonth: birth?.month ?? null,
          birthYear: birth?.year ?? null,
        }

        let telegramDataPayload: Prisma.UserTelegramDataCreateInput = {
          ...defaultTelegramData,
        }

        if (initData && !userInBotData) {
          telegramDataPayload = {
            isLive: true,
            isRtl: isRTL,
            firstName: initData.user.first_name ?? 'ANONIM',
            lastName: initData.user.last_name,
            username: initData.user.username,
            languageCode: requestedLanguageCode,
            isPremium: initData.user.is_premium,
            isBot: initData.user.is_bot,
            photoUrl: initData.user.photo_url,
            addedToAttachmentMenu: initData.user.added_to_attachment_menu,
            allowsWriteToPm: initData.user.allows_write_to_pm,
            ...birthData,
            ...(bio && {
              bio,
            }),
          }
        } else if (userInBotData && !initData) {
          telegramDataPayload = {
            isLive: true,
            isRtl: isRTL,
            firstName: userInBotData.first_name ?? 'ANONIM',
            lastName: userInBotData.last_name,
            username: userInBotData.username,
            languageCode: requestedLanguageCode,
            isPremium: userInBotData.is_premium,
            isBot: userInBotData.is_bot,
            addedToAttachmentMenu: userInBotData.added_to_attachment_menu,
            ...birthData,
            ...(bio && {
              bio,
            }),
          }
        }

        const tdata = await tx.userTelegramData.create({
          data: telegramDataPayload,
        })

        const language = await tx.language.findUnique({
          where: { iso6391: requestedLanguageCode },
        })
        if (!language) {
          throw new Error(`Language not found: ${requestedLanguageCode}`)
        }

        const adsData = await tx.userAdsData.create({
          data: {
            lastFullscreenViewedAt: null,
            lastMessageAt: null,
            lastMessageNetwork: null,
          },
        })

        const hasOtherData =
          Object.keys(parseStartParams.params).length > 0 ||
          parseStartParams.none.length > 0

        // [БАГ #6] Единый формат none[]: храним как поле `none`,
        // а не спредим с числовыми ключами ({ 0: "value" }).
        const otherDataValue = hasOtherData
          ? {
              ...parseStartParams.params,
              ...(parseStartParams.none.length > 0 && {
                none: parseStartParams.none,
              }),
            }
          : undefined

        const acquisition = await tx.acquisition.create({
          data: {
            firstAt: new Date(),
            lastAt: new Date(),
            ...(parseStartParams.params.source && {
              firstSource: parseStartParams.params.source,
              lastSource: parseStartParams.params.source,
            }),
            ...(referralKey && {
              firstReferralId: referralKey,
              lastReferralId: referralKey,
            }),
            ...(startParam && {
              firstStartParams: startParam,
              lastStartParams: startParam,
            }),
            ...(parseStartParams.params.compaing && {
              firstCompaingId: parseStartParams.params.compaing,
              lastCompaingId: parseStartParams.params.compaing,
            }),
            ...(parseStartParams.params.record && {
              firstRecordId: parseStartParams.params.record,
              lastRecordId: parseStartParams.params.record,
            }),
            ...(otherDataValue && {
              firstOtherData: otherDataValue,
              lastOtherData: otherDataValue,
            }),
            ...(ip && {
              lastIp: ip,
            }),
            ...(ua && {
              lastUserAgent: ua,
            }),
            ...(telegramPlatform && {
              lastTelegramPlatform: telegramPlatform,
            }),
          },
        })

        const createUser = await tx.users.create({
          data: {
            telegramId,
            languageId: language.id,
            balanceId: balance.id,
            acquisitionId: acquisition.id,
            roleId: UserRolesEnum.USER,
            telegramDataId: tdata.id,
            adsDataId: adsData.id,
            currencyKey: CurrencyEnum.USD,
            lastStartedAt: new Date(),
            isTgProgramPartner: isTelegramPartner,
            ...(country && { countryRegistration: country.toUpperCase() }),
          },
        })

        const referrals = []
        const isPremium = tdata.isPremium

        if (referralKey) {
          const inviterLvl1 = await tx.users.findUnique({
            where: { telegramId: referralKey },
            include: {
              inviters: {
                include: {
                  inviter: { include: { inviters: true } },
                },
              },
            },
          })

          if (inviterLvl1) {
            referrals.push({
              level: 1,
              inviterId: inviterLvl1.id,
              referralId: createUser.id,
              isPremium,
            })

            for (const lvl2 of inviterLvl1.inviters) {
              referrals.push({
                level: 2,
                inviterId: lvl2.inviter.id,
                referralId: createUser.id,
                isPremium,
              })

              for (const lvl3 of lvl2.inviter.inviters) {
                referrals.push({
                  level: 3,
                  inviterId: lvl3.inviterId,
                  referralId: createUser.id,
                  isPremium,
                })
              }
            }
          } else {
            this.logger.warn({
              msg: 'Referral key present but inviter not found',
              telegramId,
              referralKey,
            })
          }
        }

        if (referrals.length > 0) {
          await tx.referrals.createMany({
            data: referrals,
            skipDuplicates: true,
          })
        }

        const normalizedStartParam = startParam?.trim()
        const normalizedUa = ua?.trim()
        const normalizedIp = ip?.trim()
        const normalizedCountry = country?.trim()

        this.telegramLogger.sendMessage({
          chatId: Number(process.env.TELEGRAM_LOG_CHAT_ID),
          threadId: Number(process.env.TELEGRAM_THREAD_ID_USERS),
          parseMode: 'HTML',
          text: `<b>😁 НОВЫЙ ПОЛЬЗОВАТЕЛЬ</b>
<b>👱 Пользователь:</b> <code>${this.escapeHtml(createUser.id)}</code>
<b>🪪 Telegram ID:</b> <code>${this.escapeHtml(createUser.telegramId)}</code>
<b>По партнерке телеграм:</b> <code>${
            createUser.isTgProgramPartner ? '✅' : '❌'
          }</code>
<b>По рефералке:</b> <code>${referrals.length !== 0 ? '✅' : '❌'}</code>${
            referralKey
              ? `\n<b>ReferralKey:</b> <code>${this.escapeHtml(
                  referralKey,
                )}</code>`
              : ''
          }
<b>StartParams:</b> <code>${this.escapeHtml(
            normalizedStartParam || 'Не передан',
          )}</code>
<b>💐 Дата рождения:</b> <code>${
            birth ? `${birth.day}-${birth.month}-${birth.year}` : 'Не указана'
          }</code>${
            normalizedCountry
              ? `\n<b>Страна:</b> <code>${this.escapeHtml(
                  normalizedCountry.toUpperCase(),
                )}</code>`
              : ''
          }
<b>Премиум:</b> <code>${tdata.isPremium ? '⭐' : '❌'}</code>
<b>Имя:</b> <code>${this.escapeHtml(tdata.firstName)}</code>${
            tdata.lastName
              ? `\n<b>Фамилия:</b> <code>${this.escapeHtml(
                  tdata.lastName,
                )}</code>`
              : ''
          }${
            tdata.username
              ? `\n<b>Username:</b> @${this.escapeHtml(tdata.username)}`
              : ''
          }
<b>Язык:</b> <code>${this.escapeHtml(tdata.languageCode)}</code>
<b>User-Agent:</b> <code>${this.escapeHtml(normalizedUa || 'Не передан')}</code>
<b>IP:</b> <code>${this.escapeHtml(normalizedIp || 'Не передан')}</code>
<b>Platform:</b> <code>${telegramPlatform || 'Не передан'}</code>
`,
        })

        return createUser
      })

      if (!user) {
        this.logger.error({ msg: `Error while creating user` })
      } else {
        await this.eventsService.createEvent({
          userId: user.id,
          eventType: EventType.REGISTRATION,
        })
        return await this.getUserByTgId(telegramId)
      }
    } catch (e) {
      this.logger.error({
        msg: `Error while creating user`,
        telegramId,
        referralKey,
        startParam,
        ip,
        ua,
        e,
      })
      throw e
    }
  }

  private escapeHtml(value?: string | number | null) {
    if (value === null || value === undefined) return ''

    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }

  private balanceColumn(balanceType: BalanceMutationType) {
    switch (balanceType) {
      case BalanceTypeEnum.USDT:
        return 'usdt' as const
      case BalanceTypeEnum.PAYMENT:
        return 'paymentBalance' as const
      case BalanceTypeEnum.HOLD:
        return 'holdBalance' as const
    }
  }

  /**
   * Единая точка изменения баланса + записи транзакции.
   * Amount может быть Prisma.Decimal (для вызовов из сервисов, где сумма уже
   * посчитана через Decimal-арифметику, например ReferralsService) — так мы
   * не теряем точность на конвертации в number до апдейта колонки.
   */
  private async mutateBalance(
    tx: Prisma.TransactionClient,
    userId: string,
    amount: number | Prisma.Decimal,
    reason: TransactionReasonEnum,
    balanceType: BalanceMutationType,
    direction: 'increment' | 'decrement',
    extra?: MutateBalanceExtra,
  ): Promise<MutateBalanceResult> {
    const decimalAmount =
      amount instanceof Prisma.Decimal ? amount : new Prisma.Decimal(amount)

    if (decimalAmount.lessThanOrEqualTo(0)) return { success: true }

    const user = await tx.users.findUnique({
      where: { id: userId },
      select: { balanceId: true },
    })

    if (!user?.balanceId) {
      this.logger.error({
        msg: `User balance not found for ${direction}`,
        userId,
        balanceType,
      })
      return { success: false }
    }

    const column = this.balanceColumn(balanceType)

    const where: Prisma.UserBalanceWhereInput = {
      id: user.balanceId,
      ...(direction === 'decrement'
        ? { [column]: { gte: decimalAmount } }
        : {}),
    }

    const { count } = await tx.userBalance.updateMany({
      where,
      data: { [column]: { [direction]: decimalAmount } },
    })

    if (count === 0) return { success: false }

    const transaction = await tx.transactions.create({
      data: {
        amount: decimalAmount.toNumber(),
        type:
          direction === 'decrement'
            ? TransactionTypeEnum.MINUS
            : TransactionTypeEnum.PLUS,
        reason,
        balanceType,
        balanceId: user.balanceId,
        ...(extra?.holdExpiredAt && { holdExpiredAt: extra.holdExpiredAt }),
      },
    })

    return { success: true, transactionId: transaction.id }
  }

  public async addUserBalance(
    userId: string,
    amount: number | Prisma.Decimal,
    reason: TransactionReasonEnum,
    balanceType: BalanceMutationType,
    tx: Prisma.TransactionClient = this
      .prismaService as unknown as Prisma.TransactionClient,
    extra?: MutateBalanceExtra,
  ): Promise<MutateBalanceResult> {
    try {
      return await this.mutateBalance(
        tx,
        userId,
        amount,
        reason,
        balanceType,
        'increment',
        extra,
      )
    } catch (error) {
      this.logger.error({
        msg: `Error while adding user balance`,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        userId,
        reason,
        balanceType,
      })
      return { success: false }
    }
  }

  public async deductUserBalance(
    userId: string,
    amount: number | Prisma.Decimal,
    reason: TransactionReasonEnum,
    balanceType: BalanceMutationType,
    tx: Prisma.TransactionClient = this
      .prismaService as unknown as Prisma.TransactionClient,
    extra?: MutateBalanceExtra,
  ): Promise<MutateBalanceResult> {
    try {
      return await this.mutateBalance(
        tx,
        userId,
        amount,
        reason,
        balanceType,
        'decrement',
        extra,
      )
    } catch (error) {
      this.logger.error({
        msg: `Error while deducting user balance`,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        userId,
        reason,
        balanceType,
      })
      return { success: false }
    }
  }

  public async payPremiumSub({
    userId,
    method,
    period,
  }: {
    userId: string
    method: PayPremiumMethodsEnum
    period: PayPremiumPeriodEnum
  }): Promise<boolean> {
    try {
      const lockKey = `lock:premium-sub:${userId}`

      // FIX: обёртка в Redis distributed lock — без него два почти
      // одновременных вызова (двойной тап по кнопке, повторный webhook,
      // параллельный запрос с другого устройства) могли пройти проверку
      // и списание баланса независимо друг от друга, что могло привести
      // к двойному продлению подписки или гонке при пересчёте
      // premiumExpiredAt (обе операции читают один и тот же startDate
      // до того, как первая успеет его обновить).
      const result = await this.redis.withLock(
        lockKey,
        10, // ttlSeconds — с запасом над временем транзакции
        async () => {
          const [user, settings] = await Promise.all([
            this.prismaService.users.findUnique({
              where: { id: userId },
              include: { role: true },
            }),
            this.prismaService.settings.findUnique({
              where: { key: DefaultEnum.DEFAULT },
            }),
          ])
          if (!user || !settings) return false

          const ratio = periodRatioCalculateUtil(period, settings)
          const months = periodMonthsCalculateUtil(period)

          this.logger.info({
            msg: 'Premium calc debug',
            period,
            months,
            ratio,
            premiumStatusPriceStars: settings.premiumStatusPriceStars,
            premiumStatusDiscountRatio: settings.premiumStatusDiscountRatio,
            roleDiscount: user.role.discount,
          })

          const amountStars =
            settings.premiumStatusPriceStars *
            months *
            settings.premiumStatusDiscountRatio *
            ratio *
            user.role.discount

          const amount =
            method === PayPremiumMethodsEnum.BALANCE_STARS
              ? amountStars
              : amountStars * settings.tgStarsToUSD

          // Защита от NaN/Infinity, если один из множителей задан
          // некорректно (например, роль без discount в БД).
          if (!Number.isFinite(amount) || amount < 0) {
            this.logger.error({
              msg: `Invalid computed amount for premium subscription`,
              userId,
              method,
              period,
              amountStars,
              amount,
            })
            return false
          }

          const amountNormalize = Number(amount.toFixed(2))
          const balanceType =
            method === PayPremiumMethodsEnum.BALANCE_STARS
              ? BalanceTypeEnum.PAYMENT
              : BalanceTypeEnum.USDT

          const startDate =
            user.premiumExpiredAt === null ||
            isBefore(user.premiumExpiredAt, new Date())
              ? new Date()
              : user.premiumExpiredAt

          const premiumExpiredAt = addHours(
            startDate,
            periodHoursCalculateUtil(period),
          )

          return await this.prismaService.$transaction(async (tx) => {
            // FIX: при 100% скидке (amountNormalize === 0) списывать баланс
            // не нужно — mutateBalance/deductUserBalance может трактовать
            // amount <= 0 как невалидный вход и возвращать success: false,
            // из-за чего продление premium срывалось даже при корректной
            // нулевой итоговой цене.
            if (amountNormalize > 0) {
              const deduct = await this.deductUserBalance(
                userId,
                amountNormalize,
                TransactionReasonEnum.PREMIUM,
                balanceType,
                tx,
              )
              if (!deduct.success) return false
            } else {
              this.logger.info({
                msg: `Premium subscription granted for free (100% discount)`,
                userId,
                method,
                period,
              })
            }

            await tx.users.update({
              where: { id: userId },
              data: { premiumExpiredAt },
            })

            return true
          })
        },
        { retries: 2, retryDelayMs: 300 },
      )

      // result === null означает, что лок не удалось получить даже
      // после ретраев (например, параллельный запрос уже выполняется) —
      // трактуем как неуспех, а не тихо продолжаем без гарантий.
      if (result === null) {
        this.logger.warn({
          msg: `Could not acquire lock for premium subscription payment`,
          userId,
        })
        return false
      }

      return result
    } catch (error) {
      this.logger.error({
        msg: `Error while paying premium subscription`,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        userId,
        method,
        period,
      })
      return false
    }
  }
}
