import { AuthService } from '@core/auth/auth.service'
import { CurrentUser } from '@core/auth/decorators/current-user.decorator'
import { PreventDuplicateRequest } from '@core/auth/decorators/prevent-duplicate.decorator'
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard'
import { UsersService } from '@modules/users/users.service'
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { CurrencyEnum } from '@shared/enums/currency.enum'
import { JwtPayload } from '@shared/types/jwt-payload.interface'
import { FastifyReply, FastifyRequest } from 'fastify'

@Controller('user')
export class UsersController {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UsersService,
  ) {}

  @Get('me')
  @Throttle({ defaults: { limit: 5, ttl: 60 } })
  @PreventDuplicateRequest(120)
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
  @PreventDuplicateRequest(120)
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
  @PreventDuplicateRequest(120)
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

  @Post('withdrawal-usage')
  @PreventDuplicateRequest(120)
  @Throttle({ defaults: { limit: 5, ttl: 60 } })
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async updateWithdrawalUsage(
    @CurrentUser() user: JwtPayload,
    @Body('isUse') isUse: boolean,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const token = req.headers.authorization?.split(' ')[1]
    await this.authService.updateUserActivity(token)
    await this.userService.updateWithdrawalUsage(user.telegramId, isUse)
    const userData = await this.userService.getResUserByTgId(user.telegramId)
    return {
      data: {
        success: true,
        user: userData,
      },
    }
  }
}
