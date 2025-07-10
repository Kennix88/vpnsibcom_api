import { UsersService } from '@modules/users/users.service'
import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { UserRolesEnum } from '@shared/enums/user-roles.enum'
import { JwtPayload } from '@shared/types/jwt-payload.interface'
import { TelegramInitDataInterface } from '@shared/types/telegram-init-data.interface'
import { UserDataInterface } from '@shared/types/user-data.interface'
import { parse } from '@telegram-apps/init-data-node'
import { PinoLogger } from 'nestjs-pino'
import { TokenService } from './token.service'

@Injectable()
export class AuthService {
  private readonly serviceName = 'AuthService'
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

    this.logger.info({
      msg: `Telegram login InitData`,
      userData,
      service: this.serviceName,
    })

    let user = await this.userService.getUserByTgId(userData.user.id.toString())

    const startParam = userData.start_param ?? ''
    const refId = startParam.match(/r-([a-zA-Z0-9]+)/)?.[1] ?? null

    if (!user) {
      user = await this.userService.createUser({
        telegramId: userData.user.id.toString(),
        initData: userData,
        ...(refId && {
          referralKey: refId,
        }),
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

    const resUser = await this.userService.getResUserByTgId(user.telegramId)

    return {
      ...tokens,
      user: resUser,
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

      const user = await this.userService.getResUserByTgId(payload.telegramId)

      return {
        ...tokens,
        user: user,
      }
    } catch (e) {
      throw new UnauthorizedException('Invalid refresh token')
    }
  }

  async logout(userId: string, accessToken: string) {
    await this.tokenService.invalidateTokens(userId, accessToken)
  }
}
