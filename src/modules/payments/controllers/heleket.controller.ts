import { PaymentsService } from '@modules/payments/services/payments.service'
import { PaymentStatusEnum } from '@modules/payments/types/payment-status.enum'
import {
  Body,
  Controller,
  HttpCode,
  Post,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PinoLogger } from 'nestjs-pino'
import { HeleketService } from '../services/heleket.service'
import {
  HeleketPaymentStatusEnum,
  HeleketWebhookPayload,
} from '../types/heleket.types'

@Controller('heleket')
export class HeleketController {
  constructor(
    private readonly heleketService: HeleketService,
    private readonly paymentsService: PaymentsService,
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  async handleWebhook(
    @Body() body: HeleketWebhookPayload,
  ): Promise<{ ok: true }> {
    if (!this.heleketService.verifyWebhookSignature(body)) {
      this.logger.warn({ msg: 'Heleket webhook: signature mismatch' })
      throw new UnauthorizedException()
    }

    // order_id — это ваш Payments.token, переданный при createInvoice
    const token = body.order_id

    if (
      body.status !== HeleketPaymentStatusEnum.PAID &&
      body.status !== HeleketPaymentStatusEnum.PAID_OVER
    ) {
      // остальные статусы (process, confirm_check, wrong_amount, fail,
      // cancel и т.д.) не означают завершённую оплату — не финализируем
      return { ok: true }
    }

    try {
      await this.paymentsService.updatePayment(
        token,
        PaymentStatusEnum.COMPLETED,
        body as unknown as object,
      )
    } catch (e) {
      this.logger.error({
        msg: 'Heleket webhook: failed to apply payment update',
        token,
        uuid: body.uuid,
        err: e instanceof Error ? e.message : String(e),
      })
    }

    return { ok: true }
  }
}
