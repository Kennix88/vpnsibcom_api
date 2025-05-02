import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { AuthService } from '@vpnsibcom/src/core/auth/auth.service'
import { CurrentUser } from '@vpnsibcom/src/core/auth/decorators/current-user.decorator'
import { JwtAuthGuard } from '@vpnsibcom/src/core/auth/guards/jwt-auth.guard'
import { JwtPayload } from '@vpnsibcom/src/shared/types/jwt-payload.interface'
import { FastifyReply, FastifyRequest } from 'fastify'
import { PinoLogger } from 'nestjs-pino'
import { UsersService } from '../../users/users.service'
import { XrayService } from '../services/xray.service'

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(
    private readonly authService: AuthService,
    private readonly xrayService: XrayService,
    private readonly logger: PinoLogger,
    private readonly userService: UsersService,
  ) {}

  @Post('free-plan-activated')
  @Throttle({ defaults: { limit: 5, ttl: 60 } })
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async freePlanActivated(
    @CurrentUser() user: JwtPayload,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const token = req.headers.authorization?.split(' ')[1]
    await this.authService.updateUserActivity(token)

    // TODO: Здесь должна быть логика активации бесплатного плана

    const userData = await this.userService.getResUserByTgId(user.telegramId)
    return {
      data: {
        success: true,
        user: userData,
      },
    }
  }
}
