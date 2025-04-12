import { AuthService } from '@core/auth/auth.service'
import { CurrentUser } from '@core/auth/decorators/current-user.decorator'
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard'
import { UsersService } from '@modules/users/users.service'
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
}
