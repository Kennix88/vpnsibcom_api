import { CurrentUser } from '@core/auth/decorators/current-user.decorator'
import { PreventDuplicateRequest } from '@core/auth/decorators/prevent-duplicate.decorator'
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard'
import { UsersService } from '@modules/users/users.service'
import { getClientIp } from '@modules/xray/utils/get-client-ip.util'
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import { JwtPayload } from '@shared/types/jwt-payload.interface'
import type { FastifyRequest } from 'fastify'
import { AdsService } from './ads.service'
import { CreateConfirmDto } from './dto/create-confirm.dto'
import { AdSessionGuard } from './guards/ad-session.guard'
import { AdsPlaceEnum } from './types/ads-place.enum'
import { AdsTaskTypeEnum } from './types/ads-task-type.enum'

@UseGuards(JwtAuthGuard)
@Controller('ads')
export class AdsController {
  constructor(
    private readonly adsService: AdsService,
    private readonly usersService: UsersService,
  ) {}

  @Get(':place/:type')
  @PreventDuplicateRequest(120)
  @HttpCode(HttpStatus.OK)
  async getAdsTask(
    @CurrentUser() userJWT: JwtPayload,
    @Param('place') place: AdsPlaceEnum,
    @Param('type') type: AdsTaskTypeEnum,
    @Req() req: FastifyRequest,
  ) {
    const user = (req as any).user
    const ip = getClientIp(req) ?? 'unknown'
    const ua = req.headers['user-agent'] as string | undefined
    return this.adsService.createAdSession({
      userId: userJWT.sub,
      telegramId: user.telegramId,
      place: place as AdsPlaceEnum,
      type: type as AdsTaskTypeEnum,
      ip,
      ua,
    })
  }

  @Post('confirm')
  @UseGuards(AdSessionGuard)
  @HttpCode(HttpStatus.OK)
  async confirmAd(
    @CurrentUser() userJWT: JwtPayload,
    @Body() dto: CreateConfirmDto,
    @Req() req: FastifyRequest,
  ) {
    const user = (req as any).user
    const meta = (req as any).adSession
    const ip = getClientIp(req) ?? 'unknown'
    const ua = req.headers['user-agent'] as string | undefined

    const [result, userData] = await Promise.all([
      this.adsService.confirmAd({
        userId: userJWT.sub,
        verifyKey: dto.verifyKey,
        verificationCode: dto.verificationCode,
        ip,
        ua,
        meta,
      }),
      this.usersService.getResUserByTgId(userJWT.telegramId),
    ])

    // возвращаем result — клиент увидит ok/не ok
    return { ...result, user: userData }
  }
}
