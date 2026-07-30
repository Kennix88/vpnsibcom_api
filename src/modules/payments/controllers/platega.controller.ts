import { PaymentsService } from '@modules/payments/services/payments.service'
import { PaymentStatusEnum } from '@modules/payments/types/payment-status.enum'
import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PinoLogger } from 'nestjs-pino'
import { PlategaService } from '../services/platega.service'
import {
  PlategaTransactionStatusEnum,
  PlategaWebhookPayload,
} from '../types/platega.types'

@Controller('platega')
export class PlategaController {
  constructor(
    private readonly plategaService: PlategaService,
    private readonly paymentsService: PaymentsService,
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  async handleWebhook(
    @Headers('x-merchantid') merchantIdHeader: string,
    @Headers('x-secret') secretHeader: string,
    @Body() body: PlategaWebhookPayload,
  ): Promise<void> {
    if (
      !this.plategaService.verifyWebhookHeaders(merchantIdHeader, secretHeader)
    ) {
      this.logger.warn({
        msg: 'Platega webhook: X-MerchantId/X-Secret mismatch',
      })
      throw new UnauthorizedException()
    }

    // status приходит только по завершению — PENDING сюда прилетать не должен,
    // но на неизвестное/непредвиденное значение не финализируем платёж молча
    if (body.status !== PlategaTransactionStatusEnum.CONFIRMED) {
      if (
        body.status !== PlategaTransactionStatusEnum.CANCELED &&
        body.status !== PlategaTransactionStatusEnum.CHARGEBACKED
      ) {
        this.logger.warn({
          msg: 'Platega webhook: unrecognized status value',
          status: body.status,
          transactionId: body.id,
        })
      }
      return
    }

    // transactionId = ваш Payments.token, если вы кладёте его в payload при
    // создании и используете как externalId/собственный идентификатор —
    // см. пометку ниже про сопоставление ID
    const token = body.payload

    try {
      await this.paymentsService.updatePayment(
        token,
        PaymentStatusEnum.COMPLETED,
        body as unknown as object,
      )
    } catch (e) {
      this.logger.error({
        msg: 'Platega webhook: failed to apply payment update',
        token,
        err: e instanceof Error ? e.message : String(e),
      })
    }
  }
}
