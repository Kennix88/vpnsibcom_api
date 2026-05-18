import { PrismaService } from '@core/prisma/prisma.service'
import { TaddyService } from '@modules/ads/taddy.service'
import { GeoService } from '@modules/geo/geo.service'
import { AcquisitionsService } from '@modules/users/services/acquisitions.service'
import { SessionsService } from '@modules/users/services/sessions.service'
import { UsersService } from '@modules/users/services/users.service'
import { SessionPlaceEnum } from '@modules/users/types/session-place.enum'
import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { UserRolesEnum } from '@shared/enums/user-roles.enum'
import { JwtPayload } from '@shared/types/jwt-payload.interface'
import { TelegramInitDataInterface } from '@shared/types/telegram-init-data.interface'
import { UserDataInterface } from '@shared/types/user-data.interface'
import { extractReferralKey } from '@shared/utils/parse-start-param.util'
import { parse } from '@telegram-apps/init-data-node'
import { PinoLogger } from 'nestjs-pino'
import { InjectBot } from 'nestjs-telegraf'
import { Telegraf } from 'telegraf'
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
    private taddyService: TaddyService,
    private readonly geoService: GeoService,
    private readonly prisma: PrismaService,
    private readonly sessionsService: SessionsService,
    private readonly acquisitionsService: AcquisitionsService,
    @InjectBot() private readonly bot: Telegraf,
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

  /**
   * Handles Telegram login process.
   * @param initData - The initialization data from Telegram.
   * @returns An object containing access token, refresh token, and user data.
   */
  async telegramLogin(
    initData: string,
    ip: string,
    ua: string | undefined,
    startParamFromClient?: string,
  ): Promise<{
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

    const chatInfo = await this.bot.telegram.getChat(userData.user.id)
    const country = this.geoService.getCountry(ip)

    // await this.taddyService.startEvent({
    //   user: {
    //     id: Number(userData.user.id),
    //     firstName: userData.user.first_name,
    //     lastName: userData.user.last_name,
    //     username: userData.user.username,
    //     premium: userData.user.is_premium,
    //     language: userData.user.language_code,
    //     ip,
    //     ...(country && { country: country.toUpperCase() }),
    //     userAgent: ua,
    //     // @ts-ignore
    //     ...(chatInfo &&
    //       // @ts-ignore
    //       chatInfo.birthdate &&
    //       // @ts-ignore
    //       chatInfo.birthdate.year && {
    //         // @ts-ignore
    //         birthDate: `${chatInfo.birthdate.year}-${chatInfo.birthdate.month}-${chatInfo.birthdate.day}`,
    //       }),
    //   },
    //   origin: TaddyOriginEnum.WEB,
    //   start: userData.start_param,
    // })

    const birth = chatInfo &&
      // @ts-ignore
      chatInfo.birthdate && {
        // @ts-ignore
        year: chatInfo.birthdate.year ?? null,
        // @ts-ignore
        month: chatInfo.birthdate.month ?? null,
        // @ts-ignore
        day: chatInfo.birthdate.day ?? null,
      }

    let user = await this.userService.getUserByTgId(userData.user.id.toString())

    const initDataParams = new URLSearchParams(initData)
    const normalizedStartParamFromClient = startParamFromClient?.trim()
    let startParam =
      normalizedStartParamFromClient ??
      userData.start_param ??
      // compatibility: some parsers may expose camelCase fields
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (userData as any).startParam ??
      initDataParams.get('start_param') ??
      initDataParams.get('tgWebAppStartParam') ??
      ''
    let refId = extractReferralKey(startParam)

    if (!user) {
      user = await this.userService.createUser({
        telegramId: userData.user.id.toString(),
        initData: userData,
        startParam,
        ...(refId && {
          referralKey: refId,
        }),
        ...(birth && { birth }),
        ...(country && { country }),
        ua,
        ip,
      })
      if (!user) {
        throw new UnauthorizedException(
          'Telegram login failed: unable to create user.',
        )
      }
    } else if (!refId || !startParam) {
      const lastSession = await this.prisma.sessions.findFirst({
        where: {
          userId: user.id,
          place: SessionPlaceEnum.TELEGRAM_MINIAPP,
          OR: [
            { referralId: { not: null } },
            { startParams: { not: null } },
          ],
        },
        select: {
          referralId: true,
          startParams: true,
        },
        orderBy: {
          startedAt: 'desc',
        },
      })

      if (!refId && lastSession?.referralId) {
        refId = lastSession.referralId
      }

      if (!startParam && lastSession?.startParams) {
        startParam = lastSession.startParams
        this.logger.info({
          msg: 'Using last known start params for acquisition/session patch',
          userId: user.id,
          startParams: lastSession.startParams,
          service: this.serviceName,
        })
      }
    }

    // Update user country registration if it's not set
    if (!user.countryRegistration && country) {
      await this.prisma.users.update({
        where: { id: user.id },
        data: { countryRegistration: country.toUpperCase() },
      })
    }

    await this.userService.updateTelegramDataUser(
      userData.user.id.toString(),
      userData,
      birth,
    )

    await this.sessionsService.createSession({
      userId: user.id,
      place: SessionPlaceEnum.TELEGRAM_MINIAPP,
      ...(refId && {
        referralKey: refId,
      }),
      ip,
      ua,
      startParams: startParam,
    })

    await this.acquisitionsService.updateAcquisition({
      userId: user.id,
      startParams: startParam,
      ...(refId && {
        referralKey: refId,
      }),
    })

    this.logger.info({
      msg: 'Telegram login tracking context',
      service: this.serviceName,
      userId: user.id,
      ip,
      ua: ua ?? null,
      startParam: startParam || null,
      refId: refId || null,
      country: country ?? null,
    })

    const payload: JwtPayload = {
      sub: user.id,
      telegramId: user.telegramId,
      role: user.role.key as UserRolesEnum,
    }

    const tokens = await this.tokenService.generateTokens(payload)

    const resUser = await this.userService.getResUserByTgId(user.telegramId)

    // Check if resUser is defined to prevent errors in AuthController
    if (!resUser) {
      throw new UnauthorizedException(
        'Telegram login failed: User data not found after token generation.',
      )
    }

    return {
      ...tokens,
      user: resUser,
    }
  }

  async refreshTokens(
    refreshToken: string,
    ip?: string,
    ua?: string,
  ): Promise<{
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
      if (!user) {
        throw new UnauthorizedException('User not found for refresh token')
      }

      await this.sessionsService.createSession({
        userId: payload.sub,
        place: SessionPlaceEnum.TELEGRAM_MINIAPP,
        ip,
        ua,
      })

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
