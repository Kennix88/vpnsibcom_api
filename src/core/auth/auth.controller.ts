import { COOKIE_OPTIONS } from '@core/auth/constants/auth.constant'
import { CurrentUser } from '@core/auth/decorators/current-user.decorator'
import { Public } from '@core/auth/decorators/public.decorator'
import { RefreshDto } from '@core/auth/dto/refresh.dto'
import { TelegramAuthDto } from '@core/auth/dto/telegram-auth.dto'
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard'
import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import { JwtPayload } from '@shared/types/jwt-payload.interface'
import { FastifyReply, FastifyRequest } from 'fastify'
import { LoggerTelegramService } from '../logger/logger-telegram.service'
import { AuthService } from './auth.service'
import { TelegramAuthGuard } from './guards/telegram-auth.guard'

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name)

  constructor(
    private readonly authService: AuthService,
    private readonly telegramLogger: LoggerTelegramService,
  ) {}

  @Public()
  @UseGuards(TelegramAuthGuard, ThrottlerGuard)
  @Throttle({ defaults: { limit: 5, ttl: 60 } })
  @Post('telegram')
  async telegramLogin(
    @Body() dto: TelegramAuthDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    this.telegramLogger.debug(
      `Telegram login attempt for initData: ${dto.initData}`,
    )
    try {
      const auth = await this.authService.telegramLogin(dto.initData)

      this.telegramLogger.debug(
        `Auth service returned: ${JSON.stringify(auth, null, 2)}`,
      )

      // Check if auth and auth.user are defined to prevent "Cannot read properties of undefined (reading 'id')" error.
      if (!auth || !auth.user) {
        this.telegramLogger.error(
          `Telegram login failed: auth or auth.user is undefined for initData: ${dto.initData}`,
        )
        throw new BadRequestException(
          'Ошибка авторизации через Telegram: Пользователь не найден или данные авторизации некорректны',
        )
      }

      res.cookie('refreshToken', auth.refreshToken, COOKIE_OPTIONS)
      this.telegramLogger.debug(
        `Refresh token cookie set for user ${auth.user.id}`,
      )

      await this.authService.updateUserActivity(auth.accessToken)
      this.telegramLogger.debug(
        `User activity updated for user ${auth.user.id}`,
      )

      this.logger.log(`Telegram login for user ${auth.user.id}`)
      this.telegramLogger.info(
        `Telegram login successful for user ${auth.user.id}`,
      )
      return { data: { accessToken: auth.accessToken, user: auth.user } }
    } catch (error) {
      this.logger.warn(`Telegram login failed: ${(error as Error).message}`)
      this.telegramLogger.error(
        `Telegram login failed: ${(error as Error).message}`,
      )
      throw new BadRequestException('Ошибка авторизации через Telegram')
    }
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ defaults: { limit: 5, ttl: 60 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    this.telegramLogger.debug(
      `Token refresh attempt. DTO: ${JSON.stringify(
        dto,
      )}, Cookies: ${JSON.stringify(req.cookies)}`,
    )
    const refreshToken = dto.refreshToken || req.cookies.refreshToken

    if (!refreshToken) {
      this.logger.warn('Refresh token missing')
      this.telegramLogger.warn('Refresh token missing in refresh request')
      throw new UnauthorizedException('Refresh token not provided')
    }

    try {
      const tokens = await this.authService.refreshTokens(refreshToken)
      res.cookie('refreshToken', tokens.refreshToken, COOKIE_OPTIONS)
      this.telegramLogger.debug(
        `New refresh token cookie set for user ${tokens.user.id}`,
      )

      this.logger.debug(`Refreshed token for user ${tokens.user.id}`)
      this.telegramLogger.info(
        `Token refreshed successfully for user ${tokens.user.id}`,
      )
      return { data: { accessToken: tokens.accessToken, user: tokens.user } }
    } catch (error) {
      this.telegramLogger.error(
        `Token refresh failed: ${(error as Error).message}`,
      )
      throw new UnauthorizedException('Invalid refresh token')
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser() user: JwtPayload,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    this.telegramLogger.debug(`Logout attempt for user ID: ${user.sub}`)
    const token =
      req.headers.authorization?.split(' ')[1] || req.cookies.access_token

    // if (!token) {
    //   throw new UnauthorizedException('Access token missing')
    // }

    try {
      await this.authService.updateUserActivity(token)
      this.telegramLogger.debug(
        `User activity updated during logout for user ${user.sub}`,
      )
      await this.authService.logout(user.sub, token)
      this.telegramLogger.debug(`Tokens invalidated for user ${user.sub}`)

      res.clearCookie('refreshToken', COOKIE_OPTIONS)
      res.clearCookie('access_token', COOKIE_OPTIONS)
      this.telegramLogger.debug(`Cookies cleared for user ${user.sub}`)

      this.logger.log(`User ${user.sub} logged out`)
      this.telegramLogger.info(`User ${user.sub} logged out successfully`)
      return { message: 'Logged out successfully' }
    } catch (error) {
      this.telegramLogger.error(
        `Logout failed for user ${user.sub}: ${(error as Error).message}`,
      )
      throw error
    }
  }
}
