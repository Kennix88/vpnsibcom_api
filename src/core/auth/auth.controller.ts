import { COOKIE_OPTIONS } from '@core/auth/constants/auth.constant'
import { CurrentUser } from '@core/auth/decorators/current-user.decorator'
import { Public } from '@core/auth/decorators/public.decorator'
import { RefreshDto } from '@core/auth/dto/refresh.dto'
import { TelegramAuthDto } from '@core/auth/dto/telegram-auth.dto'
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard'
import {
  getClientIp,
  normalizeIp,
} from '@modules/xray/utils/get-client-ip.util'
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
import { DetectedPlatform, Platform } from './decorators/platform.decorator'
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
    @Platform() platform: DetectedPlatform,
  ) {
    // Флаг — клиент ушёл
    let clientDisconnected = false
    req.raw.on('close', () => {
      clientDisconnected = true
    })

    try {
      const ip = getClientIp(req) ?? 'unknown'
      const userAgentHeader = req.headers['user-agent']
      const ua =
        typeof userAgentHeader === 'string' ? userAgentHeader : undefined

      const auth = await this.authService.telegramLogin(
        dto.initData,
        normalizeIp(ip),
        ua,
        platform.platform,
        dto.startParam,
      )

      // Клиент ушёл — молча выходим, не трогаем стрим
      if (clientDisconnected) {
        this.logger.debug(
          'Client disconnected before auth response (ADSgram bot?)',
        )
        return
      }

      if (!auth || !auth.user) {
        throw new BadRequestException('Ошибка авторизации через Telegram')
      }

      res.cookie('refreshToken', auth.refreshToken, COOKIE_OPTIONS)
      await this.authService.updateUserActivity(auth.accessToken)

      this.logger.log(`Telegram login for user ${auth.user.id}`)
      return { data: { accessToken: auth.accessToken, user: auth.user } }
    } catch (error) {
      // Если клиент ушёл — не пробрасываем ошибку, иначе Fastify попытается писать в закрытый стрим
      if (clientDisconnected) {
        this.logger.debug(`Auth aborted by client: ${(error as Error).message}`)
        return
      }

      this.logger.warn(`Telegram login failed: ${(error as Error).message}`)
      if (error instanceof UnauthorizedException) throw error
      if (error instanceof BadRequestException) throw error
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
      const ip = getClientIp(req) ?? 'unknown'
      const userAgentHeader = req.headers['user-agent']
      const ua =
        typeof userAgentHeader === 'string' ? userAgentHeader : undefined

      const tokens = await this.authService.refreshTokens(
        refreshToken,
        normalizeIp(ip),
        ua,
      )
      res.cookie('refreshToken', tokens.refreshToken, COOKIE_OPTIONS)
      await this.authService.updateUserActivity(tokens.accessToken)

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
