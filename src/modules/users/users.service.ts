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
import { PinoLogger } from 'nestjs-pino'
import { InjectBot } from 'nestjs-telegraf'
import { Markup, Telegraf } from 'telegraf'

@Injectable()
export class UsersService {
  private USER_ACTIVITY_PREFIX = 'user_activity:'
  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly logger: PinoLogger,
    private readonly redis: RedisService,
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
    const key = `${this.USER_ACTIVITY_PREFIX}${userId}`
    const now = Math.floor(Date.now() / 1000) // Unix timestamp в секундах

    await this.redis
      .multi()
      .set(key, now, 'EX', 86400) // TTL 24 часа
      .zadd('recent_activities', now, userId) // Сортированный набор для быстрого доступа
      .exec()
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
            id: 'test',
            photo_url:
              'https://kennix88.github.io/vpnsib-tonconnect-manifest/welcome.jpg',
            thumbnail_url:
              'https://kennix88.github.io/vpnsib-tonconnect-manifest/welcome.jpg',
            caption: 'Use a VPN and play games in one place!',
            reply_markup: {
              inline_keyboard: [
                [
                  Markup.button.url(
                    'VPN&GAMES',
                    `${this.configService.get('TMA_URL')}?startapp=r-${
                      user.telegramId
                    }`,
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
        trialGb:
          user.inviters.length <= 0
            ? settings.trialGb
            : user.telegramData.isPremium
            ? settings.trialGbForPremiumReferrals
            : settings.trialGbForReferrals,
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
          payment: user.balance.paymentBalance,
          hold: user.balance.holdBalance,
          tickets: user.balance.tickets,
          ad: user.balance.ad,
          traffic: user.balance.traffic,
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
          subscriptions: true,
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
  }: {
    telegramId: string
    referralKey?: string
    initData?: TelegramInitDataInterface
    userInBotData?: UserInBotInterface
    isTelegramPartner?: boolean
  }) {
    try {
      const user = await this.prismaService.$transaction(async (tx) => {
        const balance = await tx.userBalance.create({
          data: {},
        })
        const isRTL = !initData
          ? false
          : isRtl([initData?.user.first_name, initData?.user.last_name])

        const tdata = await tx.userTelegramData.create({
          data:
            !initData && !userInBotData
              ? {
                  firstName: 'ANONIM',
                  languageCode: 'ru',
                  isLive: true,
                }
              : initData && !userInBotData
              ? {
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
                }
              : userInBotData && !initData
              ? {
                  isLive: true,
                  isRtl: isRTL,
                  firstName: userInBotData.first_name,
                  lastName: userInBotData.last_name,
                  username: userInBotData.username,
                  languageCode: userInBotData.language_code,
                  isPremium: userInBotData.is_premium,
                  isBot: userInBotData.is_bot,
                  addedToAttachmentMenu: userInBotData.added_to_attachment_menu,
                }
              : {
                  firstName: 'ANONIM',
                  languageCode: 'ru',
                  isLive: true,
                },
        })

        const language = await tx.language.findUnique({
          where: {
            iso6391:
              initData.user.language_code ||
              userInBotData.language_code ||
              'en',
          },
        })

        const adsData = await tx.userAdsData.create({
          data: {
            lastFullscreenViewedAt: null,
            lastMessageAt: null,
            lastMessageNetwork: null,
          },
        })

        const createUser = await tx.users.create({
          data: {
            telegramId,
            languageId: language.id,
            balanceId: balance.id,
            roleId: UserRolesEnum.USER,
            telegramDataId: tdata.id,
            adsDataId: adsData.id,
            currencyKey: CurrencyEnum.USD,
            lastStartedAt: new Date(),
            isTgProgramPartner: isTelegramPartner,
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
          }
        }

        if (referrals.length > 0) {
          await tx.referrals.createMany({
            data: referrals,
            skipDuplicates: true,
          })
        }

        try {
          await this.bot.telegram
            .sendMessage(
              Number(process.env.TELEGRAM_LOG_CHAT_ID),
              `<b>😁 НОВЫЙ ПОЛЬЗОВАТЕЛЬ</b>
<b>Пользователь:</b> <code>${createUser.id}</code>
<b>Telegram ID:</b> <code>${createUser.telegramId}</code>
<b>По партнерке телеграм:</b> <code>${createUser.isTgProgramPartner}</code>
<b>По рефералке:</b> <code>${referrals.length !== 0}</code>
<b>Премиум:</b> <code>${tdata.isPremium}</code>
<b>Имя:</b> <code>${tdata.firstName}</code>
<b>Фамилия:</b> <code>${tdata.lastName}</code>
<b>Username:</b> @${tdata.username}
<b>Язык:</b> <code>${tdata.languageCode}</code>
`,
              {
                parse_mode: 'HTML',
                message_thread_id: Number(process.env.TELEGRAM_THREAD_ID_USERS),
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

        return createUser
      })

      if (!user) {
        this.logger.error({
          msg: `Error while creating user`,
        })
      } else {
        return await this.getUserByTgId(telegramId)
      }
    } catch (e) {
      this.logger.error({
        msg: `Error while creating user`,
        e,
      })
    }
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
    balanceType: BalanceTypeEnum = BalanceTypeEnum.PAYMENT,
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
        (balanceType === BalanceTypeEnum.TRAFFIC &&
          user.balance.traffic < amount) ||
        (balanceType === BalanceTypeEnum.TICKETS &&
          user.balance.tickets < amount) ||
        (balanceType === BalanceTypeEnum.PAYMENT &&
          user.balance.paymentBalance < amount) ||
        (balanceType === BalanceTypeEnum.HOLD &&
          user.balance.holdBalance < amount) ||
        (balanceType === BalanceTypeEnum.AD && user.balance.ad < amount)
      )
        return { success: false }

      // Perform deduction in transaction
      const result = await this.prismaService.$transaction(async (tx) => {
        await tx.userBalance.update({
          where: { id: user.balance.id },
          data: {
            ...(balanceType == BalanceTypeEnum.TICKETS
              ? { tickets: { decrement: amount } }
              : balanceType == BalanceTypeEnum.PAYMENT
              ? { paymentBalance: { decrement: amount } }
              : {}),
            ...(balanceType == BalanceTypeEnum.TRAFFIC
              ? { traffic: { decrement: amount } }
              : {}),
            ...(balanceType == BalanceTypeEnum.AD
              ? { ad: { decrement: amount } }
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
    balanceType: BalanceTypeEnum = BalanceTypeEnum.PAYMENT,
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
            ...(balanceType == BalanceTypeEnum.TICKETS
              ? { tickets: { increment: amount } }
              : balanceType == BalanceTypeEnum.PAYMENT
              ? { paymentBalance: { increment: amount } }
              : {}),
            ...(balanceType == BalanceTypeEnum.TRAFFIC
              ? { traffic: { increment: amount } }
              : {}),
            ...(balanceType == BalanceTypeEnum.AD
              ? { ad: { increment: amount } }
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
