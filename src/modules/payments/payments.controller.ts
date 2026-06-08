import { CurrentUser } from '@core/auth/decorators/current-user.decorator'
import { PreventDuplicateRequest } from '@core/auth/decorators/prevent-duplicate.decorator'
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard'
import { AuthService } from '@core/auth/services/auth.service'
import { PaymentsService } from '@modules/payments/services/payments.service'
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
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { PaymentMethodEnum } from '@shared/enums/payment-method.enum'
import { JwtPayload } from '@shared/types/jwt-payload.interface'
import { Transform, Type } from 'class-transformer'
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator'
import { FastifyRequest } from 'fastify'
import { PinoLogger } from 'nestjs-pino'
import { PaymentTypeEnum } from './types/payment-type.enum'

// FIX #9: Добавлены @Min и @Max для валидации суммы — раньше можно
// было передать 0, отрицательное или Infinity.
class CreateInvoiceDto {
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @Max(1_000_000)
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
    private readonly logger: PinoLogger,
  ) {}

  private async updateUserActivityFromRequest(req: FastifyRequest) {
    const authHeader = req.headers.authorization
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1]
      await this.authService.updateUserActivity(token)
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
    // FIX #1: Ранее ошибки глотались через console.log, клиент
    // получал 200 OK с пустым телом. Теперь исключения пробрасываются.
    try {
      await this.updateUserActivityFromRequest(req)

      const invoice = await this.paymentService.createInvoice(
        body.amount,
        body.method,
        user.telegramId,
        PaymentTypeEnum.ADD_PAYMENT_BALANCE,
      )

      const userData = await this.userService.getResUserByTgId(user.telegramId)

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
      if (error instanceof HttpException) throw error

      this.logger.error({
        msg: 'Error creating invoice',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        telegramId: user.telegramId,
      })
      throw new InternalServerErrorException(
        'Произошла ошибка при создании счёта',
      )
    }
  }

  // FIX #10: Убран @PreventDuplicateRequest с GET-эндпоинтов —
  // они идемпотентны, блокировка повторных запросов на 120 сек избыточна
  // и неудобна для пользователей.
  @Get('bonuses')
  @UseGuards(JwtAuthGuard)
  @Throttle({ defaults: { limit: 10, ttl: 60 } })
  @HttpCode(HttpStatus.OK)
  // FIX #7: Убран неиспользуемый параметр @CurrentUser() user — метод
  // не обращается к данным пользователя, декоратор был лишним.
  async getBonuses(@Req() req: FastifyRequest) {
    try {
      await this.updateUserActivityFromRequest(req)
      const bonuses = await this.paymentService.getBonuses()
      return { data: { success: true, bonuses } }
    } catch (error) {
      if (error instanceof HttpException) throw error

      this.logger.error({
        msg: 'Error fetching bonuses',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      throw new InternalServerErrorException(
        'Произошла ошибка при получении бонусов',
      )
    }
  }

  @Get('methods')
  @UseGuards(JwtAuthGuard)
  @Throttle({ defaults: { limit: 10, ttl: 60 } })
  @HttpCode(HttpStatus.OK)
  async getPaymentMethods(
    @CurrentUser() user: JwtPayload,
    @Req() req: FastifyRequest,
    @Query() query: GetMethodsQueryDto,
  ) {
    try {
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
    } catch (error) {
      if (error instanceof HttpException) throw error

      this.logger.error({
        msg: 'Error fetching payment methods',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        telegramId: user.telegramId,
      })
      throw new InternalServerErrorException(
        'Произошла ошибка при получении методов оплаты',
      )
    }
  }
}
