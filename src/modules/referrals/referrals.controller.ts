import { AuthService } from '@core/auth/auth.service'
import { CurrentUser } from '@core/auth/decorators/current-user.decorator'
import { PreventDuplicateRequest } from '@core/auth/decorators/prevent-duplicate.decorator'
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard'
import { ReferralsService } from '@modules/referrals/referrals.service'
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

@Controller('referrals')
export class ReferralsController {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UsersService,
    private readonly referralsService: ReferralsService,
  ) {}

  @Get('my')
  @PreventDuplicateRequest(120)
  @Throttle({ defaults: { limit: 5, ttl: 60 } })
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async getMy(
    @CurrentUser() user: JwtPayload,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const token = req.headers.authorization?.split(' ')[1]
    await this.authService.updateUserActivity(token)
    const referrals = await this.referralsService.getReferrals(user.telegramId)
    const userData = await this.userService.getResUserByTgId(user.telegramId)
    return {
      data: {
        success: true,
        user: userData,
        referrals,
      },
    }
  }
}
