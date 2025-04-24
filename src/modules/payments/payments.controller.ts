import { AuthService } from '@core/auth/auth.service'
import { CurrentUser } from '@core/auth/decorators/current-user.decorator'
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard'
import { PaymentMethodsService } from '@modules/payments/services/payment-methods.service'
import { UsersService } from '@modules/users/users.service'
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { JwtPayload } from '@shared/types/jwt-payload.interface'
import { FastifyReply, FastifyRequest } from 'fastify'
import { PinoLogger } from 'nestjs-pino'

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UsersService,
    private readonly logger: PinoLogger,
    private readonly paymentMethodsService: PaymentMethodsService,
  ) {}

  @Get('methods')
  @UseGuards(JwtAuthGuard)
  @Throttle({ defaults: { limit: 5, ttl: 60 } })
  @HttpCode(HttpStatus.OK)
  async getPaymentMethods(
    @CurrentUser() user: JwtPayload,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
    @Query('isTma') isTma?: boolean,
  ) {
    const token = req.headers.authorization?.split(' ')[1]
    await this.authService.updateUserActivity(token)
    const paymentMethods = await this.paymentMethodsService.getPaymentMethods(
      isTma,
    )
    const userData = await this.userService.getResUserByTgId(user.telegramId)
    return {
      data: {
        success: true,
        methods: paymentMethods,
        user: userData,
      },
    }
  }
}
