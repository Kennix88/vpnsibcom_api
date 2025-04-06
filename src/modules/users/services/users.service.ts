import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { CurrencyEnum } from '@shared/enums/currency.enum'
import { UserRolesEnum } from '@shared/enums/user-roles.enum'
import { TelegramInitDataInterface } from '@shared/types/telegram-init-data.interface'
import { isRtl } from '@shared/utils/is-rtl.util'
import { PinoLogger } from 'nestjs-pino'
import { PrismaService } from 'nestjs-prisma'

@Injectable()
export class UsersService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly logger: PinoLogger,
  ) {}

  public async getUserByTgId(telegramId: string) {
    try {
      return await this.prismaService.users.findUnique({
        where: {
          telegramId,
        },
        include: {
          balance: true,
          giftSubscriptions: true,
          subscriptions: true,
          referrals: true,
          telegramData: true,
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

  public async createUser({
    telegramId,
    referralKey,
    giftKey,
    initData,
  }: {
    telegramId: string
    referralKey?: string
    giftKey?: string
    initData?: TelegramInitDataInterface
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
          data: !initData
            ? {
                firstName: 'ANONIM',
                languageCode: 'ru',
                isLive: true,
              }
            : {
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
        const language = await tx.language.findUnique({
          where: {
            iso6391: initData.user.language_code || 'en',
          },
        })

        // TODO: Add referral logic and gift logic

        return tx.users.create({
          data: {
            telegramId,
            languageId: language.id,
            balanceId: balance.id,
            roleId: UserRolesEnum.USER,
            telegramDataId: tdata.id,
            currencyKey: CurrencyEnum.USD,
          },
        })
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
}
