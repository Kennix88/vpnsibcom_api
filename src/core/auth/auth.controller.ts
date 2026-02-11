import { COOKIE_OPTIONS } from '@core/auth/constants/auth.constant'
import { CurrentUser } from '@core/auth/decorators/current-user.decorator'
import { Public } from '@core/auth/decorators/public.decorator'
import { RefreshDto } from '@core/auth/dto/refresh.dto'
import { TelegramAuthDto } from '@core/auth/dto/telegram-auth.dto'
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard'
import { getClientIp } from '@modules/xray/utils/get-client-ip.util'
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
import { TelegramAuthGuard } from './guards/telegram-auth.guard'
import { AuthService } from './services/auth.service'

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
    try {
      const ip = getClientIp(req) ?? 'unknown'
      const ua = req.headers['user-agent'] as string | undefined
      const auth = await this.authService.telegramLogin(dto.initData, ip, ua)

      // Check if auth and auth.user are defined to prevent "Cannot read properties of undefined (reading 'id')" error.
      if (!auth || !auth.user) {
        throw new BadRequestException(
          'Ошибка авторизации через Telegram: Пользователь не найден или данные авторизации некорректны',
        )
      }

      res.cookie('refreshToken', auth.refreshToken, COOKIE_OPTIONS)

      await this.authService.updateUserActivity(auth.accessToken)

      this.logger.log(`Telegram login for user ${auth.user.id}`)
      return { data: { accessToken: auth.accessToken, user: auth.user } }
    } catch (error) {
      this.logger.warn(`Telegram login failed: ${(error as Error).message}`)
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
    const refreshToken = dto.refreshToken || req.cookies.refreshToken

    if (!refreshToken) {
      this.logger.warn('Refresh token missing')
      throw new UnauthorizedException('Refresh token not provided')
    }

    try {
      const tokens = await this.authService.refreshTokens(refreshToken)
      res.cookie('refreshToken', tokens.refreshToken, COOKIE_OPTIONS)

      this.logger.debug(`Refreshed token for user ${tokens.user.id}`)
      return { data: { accessToken: tokens.accessToken, user: tokens.user } }
    } catch (error) {
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
    const token =
      req.headers.authorization?.split(' ')[1] || req.cookies.access_token

    // if (!token) {
    //   throw new UnauthorizedException('Access token missing')
    // }

    try {
      await this.authService.updateUserActivity(token)

      await this.authService.logout(user.sub, token)

      res.clearCookie('refreshToken', COOKIE_OPTIONS)
      res.clearCookie('access_token', COOKIE_OPTIONS)

      this.logger.log(`User ${user.sub} logged out`)
      return { message: 'Logged out successfully' }
    } catch (error) {
      this.telegramLogger.error(
        `Logout failed for user ${user.sub}: ${(error as Error).message}`,
      )
      throw error
    }
  }
}
