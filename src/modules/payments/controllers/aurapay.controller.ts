import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
} from '@nestjs/common'
import { PinoLogger } from 'nestjs-pino'
import { AurapayService } from '../services/aurapay.service'
import { PaymentsService } from '../services/payments.service'
import {
  AurapayInvoiceStatus,
  AurapayInvoiceWebhookPayload,
  AurapayPayoutWebhookPayload,
  CheckPayoutAccountDto,
  CreateInvoiceDto,
  CreatePayoutDto,
  InvoiceStatusDto,
  PayoutStatusDto,
} from '../types/aurapay.types'
import { PaymentStatusEnum } from '../types/payment-status.enum'

@Controller('aurapay')
export class AurapayController {
  constructor(
    private readonly aurapayService: AurapayService,
    private readonly logger: PinoLogger,
    private readonly paymentService: PaymentsService,
  ) {
    this.logger.setContext(AurapayController.name)
  }

  // -------------------------------------------------------------------------
  // Вебхуки от Aurapay
  //
  // Важно: эти два роута должны быть исключены из глобальных guard'ов
  // авторизации (JWT/telegram-init-data и т.п.) — Aurapay стучится сюда
  // без каких-либо ваших токенов, только с X-SIGNATURE.
  // -------------------------------------------------------------------------

  @Post('webhook/invoice')
  @HttpCode(HttpStatus.OK)
  async handleInvoiceWebhook(
    @Body() payload: AurapayInvoiceWebhookPayload,
    @Headers('x-signature') signature?: string,
  ) {
    const isValid = this.aurapayService.verifyWebhookSignature(
      payload as unknown as Record<string, unknown>,
      signature,
    )

    if (!isValid) {
      this.logger.warn(
        { invoiceId: payload?.id, orderId: payload?.order_id },
        'Aurapay invoice webhook: неверная подпись',
      )
      throw new UnauthorizedException('Invalid signature')
    }

    const dedupeKey = `invoice:${payload.id}`

    if (await this.aurapayService.isWebhookProcessed(dedupeKey)) {
      this.logger.info(
        { invoiceId: payload.id },
        'Aurapay invoice webhook: уже обработан, пропускаем',
      )
      return { status: 'ok' }
    }

    await this.aurapayService.runWebhookHandlerOnce(dedupeKey, async () => {
      this.logger.info(
        {
          invoiceId: payload.id,
          orderId: payload.order_id,
          status: payload.status,
          amount: payload.amount,
        },
        'Aurapay invoice webhook получен',
      )

      if (payload.status === AurapayInvoiceStatus.PAID) {
        // TODO: здесь хук в твою бизнес-логику — начисление баланса / активация подписки.
        // Сопоставляй операцию по payload.order_id (и/или payload.custom_fields, если туда
        // клали свой внутренний id при создании инвойса через createInvoice()).
        // Пример по аналогии с payPremiumSub/confirmAd:
        // await this.subscriptionsService.confirmPayment(payload.order_id, payload)
        const update = await this.paymentService.updatePayment(
          payload.order_id,
          PaymentStatusEnum.COMPLETED,
          payload,
        )
        if (!update) throw new UnauthorizedException('Error update payment')
      }
    })
    // NOTE: если fn() выше бросит исключение, оно вылетит и отсюда — Nest ответит не-200,
    // и Aurapay честно сделает ретрай (до 5 раз), без ложной пометки "уже обработано".

    return { status: 'ok' }
  }

  @Post('webhook/payout')
  @HttpCode(HttpStatus.OK)
  async handlePayoutWebhook(
    @Body() payload: AurapayPayoutWebhookPayload,
    @Headers('x-signature') signature?: string,
  ) {
    const isValid = this.aurapayService.verifyWebhookSignature(
      payload as unknown as Record<string, unknown>,
      signature,
    )

    if (!isValid) {
      this.logger.warn(
        { payoutId: payload?.id, orderId: payload?.order_id },
        'Aurapay payout webhook: неверная подпись',
      )
      throw new UnauthorizedException('Invalid signature')
    }

    const dedupeKey = `payout:${payload.id}`

    if (await this.aurapayService.isWebhookProcessed(dedupeKey)) {
      this.logger.info(
        { payoutId: payload.id },
        'Aurapay payout webhook: уже обработан, пропускаем',
      )
      return { status: 'ok' }
    }

    await this.aurapayService.runWebhookHandlerOnce(dedupeKey, async () => {
      this.logger.info(
        {
          payoutId: payload.id,
          orderId: payload.order_id,
          status: payload.status,
          amount: payload.amount,
        },
        'Aurapay payout webhook получен',
      )

      // TODO: хук в бизнес-логику — например, финализация заявки на вывод в вашей БД
      // по payload.order_id и обработка статусов SUCCESS/ERROR.
    })

    return { status: 'ok' }
  }

  // -------------------------------------------------------------------------
  // Внутренние/админские операции (защити своими guard'ами при подключении
  // в модуль — JwtAuthGuard/AdminGuard и т.п., здесь намеренно не проставлены,
  // т.к. не знаю твою текущую схему авторизации)
  // -------------------------------------------------------------------------

  @Post('invoice')
  async createInvoice(@Body() dto: CreateInvoiceDto) {
    return this.aurapayService.createInvoice(dto)
  }

  @Post('invoice/status')
  async getInvoiceStatus(@Body() dto: InvoiceStatusDto) {
    return this.aurapayService.getInvoiceStatus(dto as never)
  }

  @Get('shop/balance')
  async getShopBalance() {
    return this.aurapayService.getShopBalance()
  }

  @Post('payout')
  async createPayout(@Body() dto: CreatePayoutDto) {
    return this.aurapayService.createPayout(dto)
  }

  @Post('payout/status')
  async getPayoutStatus(@Body() dto: PayoutStatusDto) {
    return this.aurapayService.getPayoutStatus(dto as never)
  }

  @Get('payout/courses')
  async getPayoutCourses() {
    return this.aurapayService.getPayoutCourses()
  }

  @Post('payout/check-account')
  async checkPayoutAccount(@Body() dto: CheckPayoutAccountDto) {
    return this.aurapayService.checkPayoutAccount(dto)
  }
}
