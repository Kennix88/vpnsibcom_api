import { PaymentsService } from '@modules/payments/services/payments.service'
import { PaymentStatusEnum } from '@modules/payments/types/payment-status.enum'
import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  RawBodyRequest,
  Req,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { FastifyRequest } from 'fastify'
import { PinoLogger } from 'nestjs-pino'
import { CryptobotService } from '../services/cryptobot.service'
import { CryptoPayWebhookUpdate } from '../types/cryptobot.types'

@Controller('cryptobot')
export class CryptoPayController {
  constructor(
    private readonly cryptoPayService: CryptobotService,
    private readonly paymentsService: PaymentsService,
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  async handleWebhook(
    @Req() req: RawBodyRequest<FastifyRequest>,
    @Headers('crypto-pay-api-signature') signature: string,
    @Body() update: CryptoPayWebhookUpdate,
  ): Promise<{ ok: true }> {
    if (!req.rawBody) {
      this.logger.error({ msg: 'CryptoPay webhook: rawBody is missing' })
      throw new BadRequestException()
    }

    if (!this.cryptoPayService.verifySignature(req.rawBody, signature)) {
      this.logger.warn({ msg: 'CryptoPay webhook: signature mismatch' })
      throw new UnauthorizedException()
    }

    if (update.update_type !== 'invoice_paid') {
      return { ok: true }
    }

    const invoice = update.payload
    const token = invoice.payload // ваш Payments.token, переданный при createInvoice

    if (!token) {
      // инвойс создан не через наш флоу (payload пуст) — нечего сопоставлять
      this.logger.error({
        msg: 'CryptoPay webhook: invoice has no payload/token',
        invoiceId: invoice.invoice_id,
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
      // Намеренно не даём Nest вернуть 5xx на "не найден платёж" и т.п. —
      // permanent-ошибка на конкретном инвойсе не должна триггерить ретраи
      // CryptoPay (до 17 попыток за 3 дня), которые при накоплении таких
      // ошибок в итоге отключат вебхуки для ВСЕГО приложения целиком.
      // Если ошибка транзиентная (БД недоступна) — она уйдёт в лог/алерты,
      // разбирайтесь вручную через getInvoices, а не полагайтесь на ретраи.
      this.logger.error({
        msg: 'CryptoPay webhook: failed to apply payment update',
        token,
        invoiceId: invoice.invoice_id,
        err: e instanceof Error ? e.message : String(e),
      })
    }

    return { ok: true }
  }
}
