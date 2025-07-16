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
  UseGuards,
} from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { PaymentMethodEnum } from '@shared/enums/payment-method.enum'
import { JwtPayload } from '@shared/types/jwt-payload.interface'
import { Transform, Type } from 'class-transformer'
import { IsEnum, IsNumber } from 'class-validator'
import { FastifyRequest } from 'fastify'

class CreateInvoiceDto {
  @IsNumber()
  @Type(() => Number)
  amount: number

  @IsEnum(PaymentMethodEnum)
  method: PaymentMethodEnum
}

class GetMethodsQueryDto {
  @Transform(({ value }) => value === 'true')
  isTma?: boolean
}

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UsersService,
    private readonly paymentService: PaymentsService,
  ) {}

  private async updateUserActivityFromRequest(req: FastifyRequest) {
    const authHeader = req.headers.authorization
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1]
      await this.authService.updateUserActivity(token)
    }
  }

  @Post('invoice')
  @UseGuards(JwtAuthGuard)
  @Throttle({ defaults: { limit: 5, ttl: 60 } })
  @HttpCode(HttpStatus.OK)
  async createInvoice(
    @CurrentUser() user: JwtPayload,
    @Body() body: CreateInvoiceDto,
    @Req() req: FastifyRequest,
  ) {
    await this.updateUserActivityFromRequest(req)

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
    @Query() query: GetMethodsQueryDto,
  ) {
    await this.updateUserActivityFromRequest(req)

    const [paymentMethods, userData] = await Promise.all([
      this.paymentService.getPaymentMethods(query.isTma),
      this.userService.getResUserByTgId(user.telegramId),
    ])

    return {
      data: {
        success: true,
        methods: paymentMethods,
        user: userData,
      },
    }
  }
}
