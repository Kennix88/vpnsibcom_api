import { AuthService } from '@core/auth/auth.service'
import { CurrentUser } from '@core/auth/decorators/current-user.decorator'
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard'
import { UsersService } from '@modules/users/users.service'
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
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

  @Post('wallet')
  @Throttle({ defaults: { limit: 5, ttl: 60 } })
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async updateWallet(
    @CurrentUser() user: JwtPayload,
    @Body('address') address: string,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const token = req.headers.authorization?.split(' ')[1]
    await this.authService.updateUserActivity(token)
    await this.userService.updateUserWallet(user.telegramId, address)
    const userData = await this.userService.getResUserByTgId(user.telegramId)
    return {
      data: {
        success: true,
        user: userData,
      },
    }
  }

  @Delete('wallet')
  @Throttle({ defaults: { limit: 5, ttl: 60 } })
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async deleteWallet(
    @CurrentUser() user: JwtPayload,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const token = req.headers.authorization?.split(' ')[1]
    await this.authService.updateUserActivity(token)
    await this.userService.updateUserWallet(user.telegramId, null)
    const userData = await this.userService.getResUserByTgId(user.telegramId)
    return {
      data: {
        success: true,
        user: userData,
      },
    }
  }
}
