import { PaymentsService } from '@modules/payments/services/payments.service'
import { PaymentStatusEnum } from '@modules/payments/types/payment-status.enum'
import {
  BadRequestException,
  Controller,
  Headers,
  Post,
  RawBodyRequest,
  Req,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { FastifyRequest } from 'fastify'
import { PinoLogger } from 'nestjs-pino'
import { XRocketPayService } from '../services/xrocket-pay.service'
import {
  XRocketInvoiceStatusEnum,
  XRocketWebhookTypeEnum,
  XRocketWebhookUpdate,
} from '../types/xrocket-pay.types'

@Controller('xrocket')
export class XRocketPayController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly xRocketPayService: XRocketPayService,
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {}

  @Post('webhook')
  async handleWebhook(
    @Req() req: RawBodyRequest<FastifyRequest<{ Body: XRocketWebhookUpdate }>>,
    @Headers('rocket-pay-signature') signature: string,
  ): Promise<{ ok: true }> {
    if (!req.rawBody) {
      this.logger.error({ msg: 'xRocket webhook: rawBody is missing' })
      throw new BadRequestException()
    }
    if (!this.xRocketPayService.verifySignature(req.rawBody, signature)) {
      this.logger.warn({ msg: 'xRocket webhook: signature mismatch' })
      throw new UnauthorizedException()
    }

    const update = req.body

    if (update.type !== XRocketWebhookTypeEnum.INVOICE_PAY) {
      // subscriptionPay/subscriptionEnd/exchangeOrderComplete — вне текущего скоупа
      return { ok: true }
    }

    const invoice = update.data

    if (invoice.status !== XRocketInvoiceStatusEnum.PAID) {
      return { ok: true }
    }

    const token = invoice.payload // ваш Payments.token, переданный в createInvoice

    if (!token) {
      this.logger.error({
        msg: 'xRocket webhook: paid invoice has no payload/token',
        invoiceId: invoice.id,
      })
      return { ok: true }
    }

    try {
      await this.paymentsService.updatePayment(
        token,
        PaymentStatusEnum.COMPLETED,
        invoice as unknown as object,
      )
    } catch (e) {
      this.logger.error({
        msg: 'xRocket webhook: failed to apply payment update',
        token,
        invoiceId: invoice.id,
        err: e instanceof Error ? e.message : String(e),
      })
    }

    return { ok: true }
  }
}
