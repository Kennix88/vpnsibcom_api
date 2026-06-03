import { CurrentUser } from '@core/auth/decorators/current-user.decorator'
import {
  DetectedPlatform,
  Platform,
} from '@core/auth/decorators/platform.decorator'
import { SkipAuth } from '@core/auth/decorators/skip-auth.decorator'
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard'
import { UsersService } from '@modules/users/services/users.service'
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
import { AdsPlaceEnum } from './types/ads-place.enum'
import { AdsTypeEnum } from './types/ads-type.enum'

@Controller('ads')
export class AdsController {
  constructor(
    private readonly adsService: AdsService,
    private readonly usersService: UsersService,
  ) {}

  // ─── Конкретные литеральные маршруты — ПЕРВЫМИ ───────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('task-reward/:place')
  @HttpCode(HttpStatus.OK)
  async getAdTaskReward(@Param('place') place: 'adsgram' | 'reward') {
    return this.adsService.getAdTaskReward({ place })
  }

  @SkipAuth()
  @Get('ad-redirect/:key')
  @HttpCode(HttpStatus.OK)
  async getRedirectAd(@Param('key') key: string, @Req() req: FastifyRequest) {
    const result = await this.adsService.getRedirectAd(key)
    if (!result.success) return { ok: false, reason: result.reason ?? null }

    return {
      ok: result.success,
      reason: result.reason ?? null,
      redirectUrl: result.redirectUrl,
      rewardStars: result.rewardStars,
    }
  }

  // @CurrentUser() убран — при SkipAuth токена нет, request.user не заполняется
  @SkipAuth()
  @Get('confirm-easy/:key')
  @HttpCode(HttpStatus.OK)
  async confirmAdIsRedirect(
    @Param('key') key: string,
    @Req() req: FastifyRequest,
  ) {
    const meta = (req as any).adSession
    const ip = getClientIp(req) ?? 'unknown'
    const ua = req.headers['user-agent'] as string | undefined
    const result = await this.adsService.confirmAd({
      verifyKey: key,
      isEasy: true,
      ip,
      ua,
      meta,
    })
    return { ...result }
  }

  @SkipAuth()
  @Get('reward-adsgrambot/:userId')
  @HttpCode(HttpStatus.OK)
  async rewardAdsgramBot(
    @Param('userId') userId: string,
    @Req() req: FastifyRequest,
  ) {
    // Adsgram ожидает 200 OK — всегда возвращаем 200
    return { ok: true, reason: null }
  }

  // ─── POST — отдельный HTTP-метод, порядок не критичен ────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('confirm')
  // @UseGuards(AdSessionGuard)
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
    const result = await this.adsService.confirmAd({
      userId: userJWT.sub,
      verifyKey: dto.verifyKey,
      verificationCode: dto.verificationCode,
      isEasy: false,
      ip,
      ua,
      meta,
      ...(dto.isTaddy && { isTaddy: true }),
    })
    const userData = await this.usersService.getResUserByTgId(
      userJWT.telegramId,
    )
    return { ...result, user: userData }
  }

  // ─── Жадный параметрический маршрут — ПОСЛЕДНИМ ──────────────────────────

  @Get('get/:place/:type')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getAds(
    @CurrentUser() userJWT: JwtPayload,
    @Param('place') place: AdsPlaceEnum,
    @Param('type') type: AdsTypeEnum,
    @Req() req: FastifyRequest,
    @Platform() platform: DetectedPlatform,
  ) {
    const user = (req as any).user
    const ip = getClientIp(req) ?? 'unknown'
    const ua = req.headers['user-agent'] as string | undefined
    return this.adsService.createAdSession({
      userId: userJWT.sub,
      telegramId: user.telegramId,
      place: place as AdsPlaceEnum,
      type:
        place === AdsPlaceEnum.FULLSCREEN || place === AdsPlaceEnum.BANNER
          ? AdsTypeEnum.VIEW
          : (type as AdsTypeEnum),
      ip,
      ua,
      platform: platform.platform,
      os: platform.os,
    })
  }
}
