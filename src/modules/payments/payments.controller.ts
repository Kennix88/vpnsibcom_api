import { AuthService } from '@core/auth/auth.service'
import { CurrentUser } from '@core/auth/decorators/current-user.decorator'
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard'
import { PaymentsService } from '@modules/payments/services/payments.service'
import { UsersService } from '@modules/users/users.service'
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { PaymentMethodEnum } from '@shared/enums/payment-method.enum'
import { JwtPayload } from '@shared/types/jwt-payload.interface'
import { FastifyReply, FastifyRequest } from 'fastify'
import { PinoLogger } from 'nestjs-pino'

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UsersService,
    private readonly logger: PinoLogger,
    private readonly paymentService: PaymentsService,
  ) {}

  @Post('invoice')
  @UseGuards(JwtAuthGuard)
  @Throttle({ defaults: { limit: 5, ttl: 60 } })
  @HttpCode(HttpStatus.OK)
  async createInvoice(
    @CurrentUser() user: JwtPayload,
    @Body() body: { amount: number; method: PaymentMethodEnum },
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const token = req.headers.authorization?.split(' ')[1]
    await this.authService.updateUserActivity(token)
    const invoice = await this.paymentService.createInvoice(
      body.amount,
      body.method,
      user.telegramId,
    )

    const userData = await this.userService.getResUserByTgId(user.telegramId)
    return {
      data: {
        success: true,
        linkPay: invoice.linkPay,
        isTmaIvoice: invoice.isTmaIvoice,
        user: userData,
      },
    }
  }

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
    const paymentMethods = await this.paymentService.getPaymentMethods(isTma)
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
