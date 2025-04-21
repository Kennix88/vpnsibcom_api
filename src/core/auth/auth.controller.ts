import { COOKIE_OPTIONS } from '@core/auth/constants/auth.constant'
import { CurrentUser } from '@core/auth/decorators/current-user.decorator'
import { Public } from '@core/auth/decorators/public.decorator'
import { RefreshDto } from '@core/auth/dto/refresh.dto'
import { TelegramAuthDto } from '@core/auth/dto/telegram-auth.dto'
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard'
import { UsersService } from '@modules/users/users.service'
import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { JwtPayload } from '@shared/types/jwt-payload.interface'
import { FastifyReply, FastifyRequest } from 'fastify'
import { AuthService } from './auth.service'
import { TelegramAuthGuard } from './guards/telegram-auth.guard'

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UsersService,
  ) {}

  @Public()
  @Throttle({ defaults: { limit: 5, ttl: 60 } })
  @UseGuards(TelegramAuthGuard)
  @Post('telegram')
  async telegramLogin(
    @Body() telegramAuthDto: TelegramAuthDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    try {
      const auth = await this.authService.telegramLogin(
        telegramAuthDto.initData,
      )

      res.cookie('refreshToken', auth.refreshToken, COOKIE_OPTIONS)
      // req.session.userId = auth.user.id
      // req.session.authenticated = true
      // await req.session.save()

      await this.authService.updateUserActivity(auth.accessToken)

      return { data: { accessToken: auth.accessToken, user: auth.user } }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        'Ошибка авторизации через Telegram',
        HttpStatus.BAD_REQUEST,
      )
    }
  }

  @Public()
  @Throttle({ defaults: { limit: 5, ttl: 60 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() refreshDto: RefreshDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const refreshToken = refreshDto.refreshToken || req.cookies.refreshToken

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token not provided')
    }

    const tokens = await this.authService.refreshTokens(refreshToken)

    res.cookie('refreshToken', tokens.refreshToken, COOKIE_OPTIONS)

    return { data: { accessToken: tokens.accessToken, user: tokens.user } }
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
    await this.authService.updateUserActivity(token)
    await this.authService.logout(user.sub, token)

    res.clearCookie('refreshToken', COOKIE_OPTIONS)
    res.clearCookie('access_token', COOKIE_OPTIONS)

    return { message: 'Logged out successfully' }
  }
}
