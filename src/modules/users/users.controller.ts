import { CurrentUser } from '@core/auth/decorators/current-user.decorator'
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard'
import { AuthService } from '@core/auth/services/auth.service'
import { UsersService } from '@modules/users/services/users.service'
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { CurrencyEnum } from '@shared/enums/currency.enum'
import { JwtPayload } from '@shared/types/jwt-payload.interface'
import { FastifyReply, FastifyRequest } from 'fastify'
import { PinoLogger } from 'nestjs-pino'
import { PayPremiumDto } from './types/pay-premium.dto'

@Controller('user')
export class UsersController {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UsersService,
    private readonly logger: PinoLogger,
  ) {}

  private async refreshActivity(req: FastifyRequest): Promise<void> {
    const token = req.headers.authorization?.split(' ')[1]
    if (token) {
      await this.authService.updateUserActivity(token)
    }
  }

  @Post('pay-premium')
  @UseGuards(JwtAuthGuard)
  @Throttle({ defaults: { limit: 10, ttl: 60 } })
  @HttpCode(HttpStatus.OK)
  async payPremium(
    @CurrentUser() user: JwtPayload,
    @Body() data: PayPremiumDto,
    @Req() req: FastifyRequest,
  ) {
    try {
      await this.refreshActivity(req)
      this.logger.info(
        `Покупка премиум подписки для пользователя: ${user.telegramId}`,
      )

      // FIX: раньше payPremiumSub и getResUserByTgId запускались параллельно
      // через Promise.all, из-за чего getResUserByTgId мог вернуть данные
      // пользователя ДО того, как payPremiumSub успеет обновить
      // premiumExpiredAt в БД (особенно с учётом Redis-лока, который теперь
      // может добавлять задержку при конкурентных запросах). Клиент получал
      // success: true, но user со старым premiumExpiredAt. Теперь сначала
      // ждём завершения оплаты, и только потом читаем актуальные данные.
      const success = await this.userService.payPremiumSub({
        userId: user.sub,
        method: data.method,
        period: data.period,
      })
      const userData = await this.userService.getResUserByTgId(user.telegramId)

      return { success, user: userData }
    } catch (error) {
      if (error instanceof HttpException) throw error
      this.logger.error(
        `Ошибка при покупке премиум подписки: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      )
      throw new InternalServerErrorException(
        'Произошла ошибка при покупке премиум подписки',
      )
    }
  }

  @Get('me')
  @Throttle({ defaults: { limit: 5, ttl: 60 } })
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async getMe(
    @CurrentUser() user: JwtPayload,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const token = req.headers.authorization?.split(' ')[1]
    await this.authService.updateUserActivity(token)
    const userData = await this.userService.getResUserByTgId(user.telegramId)
    return {
      data: {
        user: userData,
      },
    }
  }

  @Post('language')
  @Throttle({ defaults: { limit: 5, ttl: 60 } })
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async updateLanguage(
    @CurrentUser() user: JwtPayload,
    @Body('code') code: string,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const token = req.headers.authorization?.split(' ')[1]
    await this.authService.updateUserActivity(token)
    await this.userService.updateLanguage(user.telegramId, code)
    const userData = await this.userService.getResUserByTgId(user.telegramId)
    return {
      data: {
        success: true,
        user: userData,
      },
    }
  }

  @Post('currency')
  @Throttle({ defaults: { limit: 5, ttl: 60 } })
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async updateCurrency(
    @CurrentUser() user: JwtPayload,
    @Body('code') code: CurrencyEnum,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const token = req.headers.authorization?.split(' ')[1]
    await this.authService.updateUserActivity(token)
    await this.userService.updateCurrency(user.telegramId, code)
    const userData = await this.userService.getResUserByTgId(user.telegramId)
    return {
      data: {
        success: true,
        user: userData,
      },
    }
  }
}
