import { CurrentUser } from '@core/auth/decorators/current-user.decorator'
import { PreventDuplicateRequest } from '@core/auth/decorators/prevent-duplicate.decorator'
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard'
import { AuthService } from '@core/auth/services/auth.service'
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
import { IsBoolean, IsEnum, IsNumber, IsOptional } from 'class-validator'
import { FastifyRequest } from 'fastify'
import { LoggerTelegramService } from '../../core/logger/logger-telegram.service'
import { PaymentTypeEnum } from './types/payment-type.enum'

class CreateInvoiceDto {
  @IsNumber()
  @Type(() => Number)
  amount: number

  @IsEnum(PaymentMethodEnum)
  method: PaymentMethodEnum
}

class GetMethodsQueryDto {
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true')
  isTma?: boolean
}

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UsersService,
    private readonly paymentService: PaymentsService,
    private readonly telegramLogger: LoggerTelegramService,
  ) {
    this.telegramLogger.debug('PaymentsController initialized.')
  }

  private async updateUserActivityFromRequest(req: FastifyRequest) {
    this.telegramLogger.debug(
      'PaymentsController: Updating user activity from request.',
    )
    const authHeader = req.headers.authorization
    if (authHeader?.startsWith('Bearer ')) {
      this.telegramLogger.debug(
        'PaymentsController: Authorization header found.',
      )
      const token = authHeader.split(' ')[1]
      await this.authService.updateUserActivity(token)
      this.telegramLogger.info('PaymentsController: User activity updated.')
    } else {
      this.telegramLogger.debug(
        'PaymentsController: No Authorization header found.',
      )
    }
  }

  @Post('invoice')
  @PreventDuplicateRequest(120)
  @UseGuards(JwtAuthGuard)
  @Throttle({ defaults: { limit: 5, ttl: 60 } })
  @HttpCode(HttpStatus.OK)
  async createInvoice(
    @CurrentUser() user: JwtPayload,
    @Body() body: CreateInvoiceDto,
    @Req() req: FastifyRequest,
  ) {
    this.telegramLogger.debug(
      `PaymentsController: createInvoice called by user ID: ${user.sub}`,
    )
    try {
      await this.updateUserActivityFromRequest(req)
      this.telegramLogger.debug(
        'PaymentsController: User activity updated for createInvoice.',
      )

      const invoice = await this.paymentService.createInvoice(
        body.amount,
        body.method,
        user.telegramId,
        PaymentTypeEnum.ADD_PAYMENT_BALANCE,
      )
      this.telegramLogger.info(
        `PaymentsController: Invoice created for user ID: ${user.sub}, invoice ID: ${invoice.linkPay}`,
      )

      const userData = await this.userService.getResUserByTgId(user.telegramId)
      this.telegramLogger.debug(
        `PaymentsController: User data retrieved for user ID: ${user.sub}`,
      )

      return {
        data: {
          success: true,
          linkPay: invoice.linkPay,
          isTonPayment: invoice.isTonPayment,
          token: invoice.token,
          user: userData,
          amountTon: invoice.amountTon,
        },
      }
    } catch (error) {
      this.telegramLogger.error(
        `PaymentsController: Error creating invoice for user ID: ${
          user.sub
        }. Error: ${(error as Error).message}`,
      )
      throw error
    }
  }

  @Get('methods')
  @PreventDuplicateRequest(120)
  @UseGuards(JwtAuthGuard)
  @Throttle({ defaults: { limit: 5, ttl: 60 } })
  @HttpCode(HttpStatus.OK)
  async getPaymentMethods(
    @CurrentUser() user: JwtPayload,
    @Req() req: FastifyRequest,
    @Query() query: GetMethodsQueryDto,
  ) {
    this.telegramLogger.debug(
      `PaymentsController: getPaymentMethods called by user ID: ${user.sub}`,
    )
    try {
      await this.updateUserActivityFromRequest(req)
      this.telegramLogger.debug(
        'PaymentsController: User activity updated for getPaymentMethods.',
      )

      const [paymentMethods, userData] = await Promise.all([
        this.paymentService.getPaymentMethods(query.isTma),
        this.userService.getResUserByTgId(user.telegramId),
      ])
      this.telegramLogger.info(
        `PaymentsController: Payment methods and user data retrieved for user ID: ${user.sub}`,
      )

      return {
        data: {
          success: true,
          methods: paymentMethods,
          user: userData,
        },
      }
    } catch (error) {
      this.telegramLogger.error(
        `PaymentsController: Error getting payment methods for user ID: ${
          user.sub
        }. Error: ${(error as Error).message}`,
      )
      throw error
    }
  }
}
