import { UsersService } from '@modules/users/users.service'
import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { CurrencyEnum } from '@shared/enums/currency.enum'
import { UserRolesEnum } from '@shared/enums/user-roles.enum'
import { JwtPayload } from '@shared/types/jwt-payload.interface'
import { TelegramInitDataInterface } from '@shared/types/telegram-init-data.interface'
import { UserDataInterface } from '@shared/types/user-data.interface'
import { parse } from '@telegram-apps/init-data-node'
import { PinoLogger } from 'nestjs-pino'
import { TokenService } from './token.service'

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private tokenService: TokenService,
    private configService: ConfigService,
    private readonly logger: PinoLogger,
    private userService: UsersService,
  ) {}

  public async updateUserActivity(token: string) {
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      })
      if (!payload) return

      await this.userService.updateUserActivity(payload.sub)
    } catch (e) {
      this.logger.error({
        msg: `Error udapte user activity`,
        e,
      })
    }
  }

  async telegramLogin(initData: string): Promise<{
    accessToken: string
    refreshToken: string
    user: UserDataInterface
  }> {
    const userData = parse(initData) as TelegramInitDataInterface

    let user = await this.userService.getUserByTgId(userData.user.id.toString())

    if (!user) {
      user = await this.userService.createUser({
        telegramId: userData.user.id.toString(),
        initData: userData,
      })
    }

    await this.userService.updateTelegramDataUser(
      userData.user.id.toString(),
      userData,
    )

    const payload: JwtPayload = {
      sub: user.id,
      telegramId: user.telegramId,
      role: user.role.key as UserRolesEnum,
    }

    const tokens = await this.tokenService.generateTokens(payload)

    return {
      ...tokens,
      user: {
        id: user.id,
        telegramId: user.telegramId,
        tonWallet: user.tonWallet,
        isFreePlanAvailable: user.isFreePlanAvailable,
        isBanned: user.isBanned,
        isDeleted: user.isDeleted,
        banExpiredAt: user.banExpiredAt,
        deletedAt: user.deletedAt,
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
        giftsCount: user.activateGiftSubscriptions.length,
        referralsCount: user.referrals.length,
        balance: {
          paymentBalance: user.balance.paymentBalance,
          holdBalance: user.balance.holdBalance,
          totalEarnedWithdrawalBalance:
            user.balance.totalEarnedWithdrawalBalance,
          withdrawalBalance: user.balance.withdrawalBalance,
          isUseWithdrawalBalance: user.balance.isUseWithdrawalBalance,
        },
      },
    }
  }

  async refreshTokens(refreshToken: string): Promise<{
    accessToken: string
    refreshToken: string
    user: UserDataInterface
  }> {
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(
        refreshToken,
        { secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET') },
      )

      const tokens = await this.tokenService.rotateTokens(
        payload.sub,
        refreshToken,
      )

      const user = await this.userService.getUserByTgId(payload.telegramId)

      return {
        ...tokens,
        user: {
          id: user.id,
          telegramId: user.telegramId,
          tonWallet: user.tonWallet,
          isFreePlanAvailable: user.isFreePlanAvailable,
          isBanned: user.isBanned,
          isDeleted: user.isDeleted,
          banExpiredAt: user.banExpiredAt,
          deletedAt: user.deletedAt,
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
          giftsCount: user.activateGiftSubscriptions.length,
          referralsCount: user.referrals.length,
          balance: {
            paymentBalance: user.balance.paymentBalance,
            holdBalance: user.balance.holdBalance,
            totalEarnedWithdrawalBalance:
              user.balance.totalEarnedWithdrawalBalance,
            withdrawalBalance: user.balance.withdrawalBalance,
            isUseWithdrawalBalance: user.balance.isUseWithdrawalBalance,
          },
        },
      }
    } catch (e) {
      throw new UnauthorizedException('Invalid refresh token')
    }
  }

  async logout(userId: string, accessToken: string) {
    await this.tokenService.invalidateTokens(userId, accessToken)
  }
}
