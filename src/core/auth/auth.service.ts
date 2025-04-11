import { UsersService } from '@modules/users/services/users.service'
import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { UserRolesEnum } from '@shared/enums/user-roles.enum'
import { JwtPayload } from '@shared/types/jwt-payload.interface'
import { TelegramInitDataInterface } from '@shared/types/telegram-init-data.interface'
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

  async telegramLogin(
    initData: string,
  ): Promise<{ accessToken: string; refreshToken: string; userId: string }> {
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

    return { ...tokens, userId: user.id }
  }

  async refreshTokens(refreshToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(
        refreshToken,
        { secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET') },
      )

      return this.tokenService.rotateTokens(payload.sub, refreshToken)
    } catch (e) {
      throw new UnauthorizedException('Invalid refresh token')
    }
  }

  async logout(userId: string, accessToken: string) {
    await this.tokenService.invalidateTokens(userId, accessToken)
  }
}
