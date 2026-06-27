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
import { TelegramPlatformEnum } from '@shared/utils/detect-platform.util'
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
        msg: `Error updating user activity`,
        e,
      })
    }
  }

  /**
   * Максимальный возраст аккаунта (в мс), при котором ещё допустимо
   * привязать реферала. По умолчанию 3 суток.
   * Смысл: пользователь «свежий» — скорее всего пришёл именно по этой ссылке.
   * Старый пользователь просто кликнул чужую рефку — привязывать его нечестно.
   */
  private static readonly MAX_REFERRAL_ACCOUNT_AGE_MS = 3 * 24 * 60 * 60 * 1000

  /**
   * Создаёт реферальные записи для уже существующего пользователя,
   * пришедшего по реферальной ссылке (например, переустановил TMA).
   * [БАГ #3] — для новых пользователей цепочка создаётся в createUser,
   * для существующих раньше она не создавалась никогда.
   *
   * Защита от накрутки: если аккаунт старше MAX_REFERRAL_ACCOUNT_AGE_MS —
   * пропускаем. Старый пользователь мог кликнуть чужую ссылку случайно.
   */
  private async createReferralsForExistingUser(
    userId: string,
    referralKey: string,
    isPremium: boolean,
  ): Promise<void> {
    try {
      // Если у пользователя уже есть любой реферал — не переприсваиваем
      const existingReferral = await this.prisma.referrals.findFirst({
        where: { referralId: userId },
        select: { id: true },
      })
      if (existingReferral) return

      // Проверяем возраст аккаунта — берём дату создания пользователя
      const userMeta = await this.prisma.users.findUnique({
        where: { id: userId },
        select: { createdAt: true },
      })
      if (!userMeta) return

      const accountAgeMs = Date.now() - userMeta.createdAt.getTime()
      if (accountAgeMs > AuthService.MAX_REFERRAL_ACCOUNT_AGE_MS) {
        this.logger.info({
          msg: 'Skipping referral creation: account is too old',
          userId,
          referralKey,
          accountAgeDays: Math.floor(accountAgeMs / 86_400_000),
          service: this.serviceName,
        })
        return
      }

      const inviterLvl1 = await this.prisma.users.findUnique({
        where: { telegramId: referralKey },
        include: {
          inviters: {
            include: {
              inviter: {
                include: { inviters: true },
              },
            },
          },
        },
      })

      if (!inviterLvl1) {
        this.logger.warn({
          msg: 'Referral key present but inviter not found (existing user)',
          userId,
          referralKey,
          service: this.serviceName,
        })
        return
      }

      const referrals: Array<{
        level: number
        inviterId: string
        referralId: string
        isPremium: boolean
      }> = [
        { level: 1, inviterId: inviterLvl1.id, referralId: userId, isPremium },
      ]

      for (const lvl2 of inviterLvl1.inviters) {
        referrals.push({
          level: 2,
          inviterId: lvl2.inviter.id,
          referralId: userId,
          isPremium,
        })
        for (const lvl3 of lvl2.inviter.inviters) {
          referrals.push({
            level: 3,
            inviterId: lvl3.inviterId,
            referralId: userId,
            isPremium,
          })
        }
      }

      await this.prisma.referrals.createMany({
        data: referrals,
        skipDuplicates: true,
      })

      this.logger.info({
        msg: 'Referrals created for existing user',
        userId,
        referralKey,
        levels: referrals.length,
        service: this.serviceName,
      })
    } catch (e) {
      // Не падаем — реферальная логика не должна блокировать вход
      this.logger.error({
        msg: 'Failed to create referrals for existing user',
        userId,
        referralKey,
        e,
        service: this.serviceName,
      })
    }
  }

  /**
   * Handles Telegram login process.
   */
  async telegramLogin(
    initData: string,
    ip: string,
    ua: string | undefined,
    telegramPlatform: TelegramPlatformEnum,
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

    let chatInfo: Awaited<ReturnType<typeof this.bot.telegram.getChat>> | null =
      null
    try {
      chatInfo = await this.bot.telegram.getChat(userData.user.id)
    } catch (error) {
      this.logger.warn({
        msg: 'Telegram getChat failed, continue auth without chat profile',
        service: this.serviceName,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        error: (error as any)?.message ?? String(error),
        telegramId: userData?.user?.id ?? null,
      })
    }

    const country = this.geoService.getCountry(ip)

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

    // @ts-ignore
    const bio = (chatInfo && chatInfo.bio) ?? undefined

    let user = await this.userService.getUserByTgId(userData.user.id.toString())

    const initDataParams = new URLSearchParams(initData)

    // [БАГ #1] Пустая строка от фронтенда ("") не должна перекрывать
    // start_param из initData. Конвертируем пустую строку в undefined,
    // чтобы оператор ?? корректно переходил к следующему источнику.
    const normalizedStartParamFromClient =
      startParamFromClient?.trim() || undefined

    let startParam =
      normalizedStartParamFromClient ??
      userData.start_param ??
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (userData as any).startParam ??
      initDataParams.get('start_param') ??
      initDataParams.get('tgWebAppStartParam') ??
      ''

    let refId = extractReferralKey(startParam)

    if (!user) {
      // ── Новый пользователь ────────────────────────────────────────────
      user = await this.userService.createUser({
        telegramId: userData.user.id.toString(),
        initData: userData,
        startParam,
        ...(refId && { referralKey: refId }),
        ...(birth && { birth }),
        ...(country && { country }),
        ua,
        ip,
        telegramPlatform,
        bio,
      })
      if (!user) {
        throw new UnauthorizedException(
          'Telegram login failed: unable to create user.',
        )
      }
    } else {
      // ── Существующий пользователь ────────────────────────────────────
      // [БАГ #4] Восстанавливаем отсутствующие данные из последней сессии,
      // но только если они действительно отсутствуют в текущем запросе.
      if (!refId || !startParam) {
        const lastSession = await this.prisma.sessions.findFirst({
          where: {
            userId: user.id,
            place: SessionPlaceEnum.TELEGRAM_MINIAPP,
            OR: [{ referralId: { not: null } }, { startParams: { not: null } }],
          },
          select: {
            referralId: true,
            startParams: true,
          },
          orderBy: { startedAt: 'desc' },
        })

        // Подставляем только то, чего нет — не перезаписываем существующее
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

      // [БАГ #3] Создаём реферальные записи для существующего пользователя,
      // пришедшего по реферальной ссылке (ранее не создавалось никогда).
      if (refId) {
        const isPremium = user.telegramData?.isPremium ?? false
        await this.createReferralsForExistingUser(user.id, refId, isPremium)
      }
    }

    // Обновляем страну регистрации если не была задана
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
      bio,
    )

    await this.sessionsService.createSession({
      userId: user.id,
      place: SessionPlaceEnum.TELEGRAM_MINIAPP,
      ...(refId && { referralKey: refId }),
      ip,
      ua,
      telegramPlatform,
      startParams: startParam,
    })

    await this.acquisitionsService.updateAcquisition({
      userId: user.id,
      startParams: startParam,
      ...(refId && { referralKey: refId }),
      ...(ip && {
        lastIp: ip,
      }),
      ...(ua && {
        lastUserAgent: ua,
      }),
      ...(telegramPlatform && {
        lastTelegramPlatform: telegramPlatform,
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

    if (!resUser) {
      throw new UnauthorizedException(
        'Telegram login failed: User data not found after token generation.',
      )
    }

    return { ...tokens, user: resUser }
  }

  /**
   * Refreshes token pair.
   * [БАГ #7] Двойная верификация JWT устранена: rotateTokens сам верифицирует
   * токен и возвращает payload наружу — повторный verifyAsync не нужен.
   */
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
      // rotateTokens верифицирует токен внутри и возвращает payload
      const { payload, ...tokens } = await this.tokenService.rotateTokens(
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

      return { ...tokens, user }
    } catch (e) {
      throw new UnauthorizedException('Invalid refresh token')
    }
  }

  async logout(userId: string, accessToken: string) {
    await this.tokenService.invalidateTokens(userId, accessToken)
  }
}
