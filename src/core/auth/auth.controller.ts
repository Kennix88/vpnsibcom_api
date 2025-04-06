import { COOKIE_OPTIONS } from '@core/auth/constants/auth.constant'
import { CurrentUser } from '@core/auth/decorators/current-user.decorator'
import { Public } from '@core/auth/decorators/public.decorator'
import { RefreshDto } from '@core/auth/dto/refresh.dto'
import { TelegramAuthDto } from '@core/auth/dto/telegram-auth.dto'
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common'
import { JwtPayload } from '@shared/types/jwt-payload.interface'
import * as cookie from 'cookie'
import { Response } from 'express'
import { FastifyRequest } from 'fastify'
import { AuthService } from './auth.service'
import { TelegramAuthGuard } from './guards/telegram-auth.guard'

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @UseGuards(TelegramAuthGuard)
  @Post('telegram')
  async telegramLogin(
    @Body() telegramAuthDto: TelegramAuthDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.telegramLogin(
      telegramAuthDto.initData,
    )

    res.cookie('refreshToken', tokens.refreshToken, COOKIE_OPTIONS)

    return { accessToken: tokens.accessToken }
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() refreshDto: RefreshDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken =
      refreshDto.refreshToken ||
      cookie.parse(req.headers.cookie || '').refreshToken

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token not provided')
    }

    const tokens = await this.authService.refreshTokens(refreshToken)

    res.cookie('refreshToken', tokens.refreshToken, COOKIE_OPTIONS)

    return { accessToken: tokens.accessToken }
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser() user: JwtPayload,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.headers.authorization?.split(' ')[1]
    await this.authService.logout(user.sub, token)

    res.clearCookie('refreshToken', {
      ...COOKIE_OPTIONS,
      maxAge: 0,
    })

    return { message: 'Logged out successfully' }
  }
}
