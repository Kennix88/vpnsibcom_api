import { LoggerTelegramService } from '@core/logger/logger-telegram.service'
import { Prisma } from '@core/prisma/generated/client'
import { PrismaService } from '@core/prisma/prisma.service'
import { RedisService } from '@core/redis/redis.service'
import { UserInBotInterface } from '@integrations/telegram/types/user-in-bot.interface'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Cron } from '@nestjs/schedule'
import { BalanceTypeEnum } from '@shared/enums/balance-type.enum'
import { CurrencyEnum } from '@shared/enums/currency.enum'
import { DefaultEnum } from '@shared/enums/default.enum'
import { TransactionReasonEnum } from '@shared/enums/transaction-reason.enum'
import { TransactionTypeEnum } from '@shared/enums/transaction-type.enum'
import { UserRolesEnum } from '@shared/enums/user-roles.enum'
import { TelegramInitDataInterface } from '@shared/types/telegram-init-data.interface'
import { UserDataInterface } from '@shared/types/user-data.interface'
import { isRtl } from '@shared/utils/is-rtl.util'
import { parseStartParamUtil } from '@shared/utils/parse-start-param.util'
import { PinoLogger } from 'nestjs-pino'
import { InjectBot } from 'nestjs-telegraf'
import { Markup, Telegraf } from 'telegraf'
import { EventType } from '../types/event-type.enum'
import { EventsService } from './events.service'

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
        where: {
          iso6391: language,
        },
        select: {
          id: true,
        },
      })

      return await this.prismaService.users.update({
        where: {
          telegramId: tgId,
        },
        data: {
          languageId: languageId.id,
        },
      })
    } catch (e) {
      this.logger.error({
        msg: `Error while updating user language`,
        e,
      })
    }
  }

  public async updateCurrency(tgId: string, currency: CurrencyEnum) {
    try {
      return await this.prismaService.users.update({
        where: {
          telegramId: tgId,
        },
        data: {
          currencyKey: currency,
        },
      })
    } catch (e) {
      this.logger.error({
        msg: `Error while updating user currency`,
        e,
      })
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

  @Cron('*/5 * * * *')
  public async syncActivities() {
    const now = Math.floor(Date.now() / 1000)
    const FIVE_MIN_AGO = now - 300
    const ONE_HOUR_AGO = now - 3600

    // 1. Получаем пользователей без активности >5 минут
    const inactiveUsers = await this.redis.zrangebyscore(
      'recent_activities',
      '-inf',
      FIVE_MIN_AGO,
    )

    if (inactiveUsers.length === 0) return

    // 2. Пакетно получаем временные метки
    const pipeline = this.redis.pipeline()
    inactiveUsers.forEach((userId) =>
      pipeline.get(`${this.USER_ACTIVITY_PREFIX}${userId}`),
    )
    const results = await pipeline.exec()

    // 3. Формируем данные для обновления
    const updates = inactiveUsers
      .map((userId, i) => ({
        userId,
        lastActive: parseInt(<string>results[i][1]) * 1000, // Конвертируем в ms
      }))
      .filter((u) => u.lastActive <= Date.now() - 300000) // Точная проверка 5 минут

    // 4. Пакетное обновление в PostgreSQL
    if (updates.length > 0) {
      await this.prismaService.$transaction(
        updates.map((user) =>
          this.prismaService.users.update({
            where: { id: user.userId },
            data: { lastStartedAt: new Date(user.lastActive) },
          }),
        ),
      )
    }

    // 5. Очистка данных старше 1 часа (но оставляем свежие)
    await this.redis.zremrangebyscore('recent_activities', '-inf', ONE_HOUR_AGO)

    // Для каждого удаленного из zset проверяем нужно ли удалять ключ
    const hourOldKeys = updates
      .filter((u) => u.lastActive <= Date.now() - 3600000)
      .map((u) => `${this.USER_ACTIVITY_PREFIX}${u.userId}`)

    if (hourOldKeys.length > 0) {
      await this.redis.del(hourOldKeys)
    }
  }

  public async getResUserById(id: string): Promise<UserDataInterface> {
    const user = await this.prismaService.users.findUnique({
      where: {
        id,
      },
    })
    return this.getResUserByTgId(user.telegramId)
  }

  public async getResUserByTgId(
    telegramId: string,
  ): Promise<UserDataInterface> {
    try {
      const user = await this.getUserByTgId(telegramId)
      if (!user) return

      const settings = await this.prismaService.settings.findUnique({
        where: {
          key: DefaultEnum.DEFAULT,
        },
      })

      const messageId: string = await this.bot.telegram
        // @ts-ignore
        .callApi('savePreparedInlineMessage', {
          user_id: user.telegramId, // для какого пользователя готовим сообщение
          result: {
            type: 'photo',
            id: crypto.randomUUID(),
            photo_url:
              'https://kennix88.github.io/vpnsib-tonconnect-manifest/welcome-2.jpg',
            thumbnail_url:
              'https://kennix88.github.io/vpnsib-tonconnect-manifest/welcome-2.jpg',
            caption:
              '<b>Бесплатный, быстрый и безопасный VPN для всех!\nОставайся всегда на связи и получай доступ к интернету с VPNsib!</b>',
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
                [
                  {
                    ...Markup.button.url(
                      '📰 Заказать рекламу через Taddy',
                      'https://taddy.pro/vpnsibcom_bot',
                    ),
                    // @ts-ignore
                    style: 'danger',
                  },
                ],
                [
                  Markup.button.url(
                    '🤝 Сотрудничество и Реклама',
                    this.configService.get<string>('CHANNEL_URL') + '?direct',
                  ),
                ],
                [
                  Markup.button.url(
                    '📢 Канал',
                    this.configService.get<string>('CHANNEL_URL'),
                  ),
                  Markup.button.url(
                    '💬 Чат и Поддержка',
                    this.configService.get<string>('CHAT_URL'),
                  ),
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

      return {
        id: user.id,
        telegramId: user.telegramId,
        isTgProgramPartner: user.isTgProgramPartner,
        isFreePlanAvailable: user.isFreePlanAvailable,
        trialGb: 5000,
        isBanned: user.isBanned,
        isDeleted: user.isDeleted,
        banExpiredAt: user.banExpiredAt,
        deletedAt: user.deletedAt,
        tgProgramPartnerExpiredAt: user.tgProgramPartnerExpiredAt,
        role: user.role.key as UserRolesEnum,
        roleName: user.role.name,
        roleDiscount: user.role.discount,
        limitSubscriptions: user.role.limitSubscriptions,
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
      }
    } catch (e) {
      this.logger.error({
        msg: `Error while getting user by tgId`,
        e,
      })
    }
  }

  public async getUserByTgId(telegramId: string) {
    try {
      return await this.prismaService.users.findUnique({
        where: {
          telegramId,
        },
        include: {
          balance: true,
          subscriptions: {
            where: {
              deletedAt: null,
            },
          },
          referrals: true,
          inviters: {
            include: {
              inviter: {
                include: {
                  balance: true,
                },
              },
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
      this.logger.error({
        msg: `Error while getting user by tgId`,
        e,
      })
    }
  }

  public async updateTelegramDataUser(
    telegramId: string,
    initData: TelegramInitDataInterface,
    birth?: {
      year?: number
      month: number
      day: number
    },
  ) {
    try {
      const user = await this.prismaService.users.findUnique({
        where: {
          telegramId,
        },
        select: {
          telegramDataId: true,
        },
      })
      if (!user) return

      const isRTL = !initData
        ? false
        : isRtl([initData?.user.first_name, initData?.user.last_name])
      await this.prismaService.userTelegramData.update({
        where: {
          id: user.telegramDataId,
        },
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
  }: {
    telegramId: string
    referralKey?: string
    initData?: TelegramInitDataInterface
    userInBotData?: UserInBotInterface
    isTelegramPartner?: boolean
    birth?: {
      year?: number
      month: number
      day: number
    }
    country?: string
    startParam?: string
    ua?: string
    ip?: string
  }) {
    try {
      const user = await this.prismaService.$transaction(async (tx) => {
        const parseStartParams = parseStartParamUtil(startParam ?? '')
        const balance = await tx.userBalance.create({
          data: {},
        })
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
          }
        }

        const tdata = await tx.userTelegramData.create({
          data: telegramDataPayload,
        })

        const language = await tx.language.findUnique({
          where: {
            iso6391: requestedLanguageCode,
          },
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
            ...((Object.keys(parseStartParams.params).length > 0 ||
              parseStartParams.none.length > 0) && {
              firstOtherData: {
                ...parseStartParams.params,
                ...parseStartParams.none,
              },
              lastOtherData: {
                ...parseStartParams.params,
                ...parseStartParams.none,
              },
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
                  inviter: {
                    include: {
                      inviters: true,
                    },
                  },
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
`,
        })

        return createUser
      })

      if (!user) {
        this.logger.error({
          msg: `Error while creating user`,
        })
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

  /**
   * Deducts funds from user balance considering balance type
   * @param userId - User ID
   * @param amount - Amount to deduct
   * @param reason - Transaction reason
   * @param balanceType - Type of balance to deduct from (PAYMENT, HOLD, WAGER, TICKETS)
   * @returns Object with transaction information or null if error
   */
  public async deductUserBalance(
    userId: string,
    amount: number,
    reason: TransactionReasonEnum,
    balanceType:
      | BalanceTypeEnum.PAYMENT
      | BalanceTypeEnum.HOLD
      | BalanceTypeEnum.USDT,
  ): Promise<{
    success: boolean
  }> {
    try {
      if (amount <= 0) return { success: true }
      // Get user data with balance information
      const user = await this.prismaService.users.findUnique({
        where: { id: userId },
        select: {
          id: true,
          balance: true,
          language: {
            select: {
              iso6391: true,
            },
          },
        },
      })

      if (!user || !user.balance) {
        this.logger.error({
          msg: `User or balance not found for deduction`,
          userId,
          balanceType,
        })
        return { success: false }
      }

      // Check if user has enough balance based on balance type
      if (
        (balanceType === BalanceTypeEnum.USDT &&
          Number(user.balance.usdt) < amount) ||
        (balanceType === BalanceTypeEnum.PAYMENT &&
          Number(user.balance.paymentBalance) < amount) ||
        (balanceType === BalanceTypeEnum.HOLD &&
          Number(user.balance.holdBalance) < amount)
      )
        return { success: false }

      // Perform deduction in transaction
      const result = await this.prismaService.$transaction(async (tx) => {
        await tx.userBalance.update({
          where: { id: user.balance.id },
          data: {
            ...(balanceType == BalanceTypeEnum.USDT
              ? { usdt: { decrement: amount } }
              : balanceType == BalanceTypeEnum.PAYMENT
              ? { paymentBalance: { decrement: amount } }
              : {}),
          },
        })

        await tx.transactions.create({
          data: {
            amount: amount,
            type: TransactionTypeEnum.MINUS,
            reason: reason,
            balanceType: balanceType,
            balanceId: user.balance.id,
          },
        })

        return {
          success: true,
        }
      })

      return result
    } catch (error) {
      this.logger.error({
        msg: `Error while deducting user balance`,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        userId,
        amount,
        reason,
        balanceType,
      })

      return { success: false }
    }
  }

  public async addUserBalance(
    userId: string,
    amount: number,
    reason: TransactionReasonEnum,
    balanceType:
      | BalanceTypeEnum.PAYMENT
      | BalanceTypeEnum.HOLD
      | BalanceTypeEnum.USDT,
  ): Promise<{
    success: boolean
  }> {
    try {
      if (amount <= 0) return { success: true }
      // Get user data with balance information
      const user = await this.prismaService.users.findUnique({
        where: { id: userId },
        select: {
          id: true,
          balance: true,
          language: {
            select: {
              iso6391: true,
            },
          },
        },
      })

      if (!user || !user.balance) {
        this.logger.error({
          msg: `User or balance not found for deduction`,
          userId,
          balanceType,
        })
        return { success: false }
      }

      // Perform deduction in transaction
      const result = await this.prismaService.$transaction(async (tx) => {
        await tx.userBalance.update({
          where: { id: user.balance.id },
          data: {
            ...(balanceType == BalanceTypeEnum.USDT
              ? { usdt: { increment: amount } }
              : balanceType == BalanceTypeEnum.PAYMENT
              ? { paymentBalance: { increment: amount } }
              : {}),
          },
        })

        await tx.transactions.create({
          data: {
            amount: amount,
            type: TransactionTypeEnum.PLUS,
            reason: reason,
            balanceType: balanceType,
            balanceId: user.balance.id,
          },
        })

        return {
          success: true,
        }
      })

      return result
    } catch (error) {
      this.logger.error({
        msg: `Error while deducting user balance`,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        userId,
        amount,
        reason,
        balanceType,
      })

      return { success: false }
    }
  }
}
