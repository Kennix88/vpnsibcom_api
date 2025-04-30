import { Injectable } from "@nestjs/common"
import { Logger } from "nestjs-pino"
import { InjectBot } from "nestjs-telegraf"
import { Telegraf } from "telegraf"

@Injectable()
export class TelegramPaymentsService {
  constructor(
    @InjectBot() private readonly bot: Telegraf,
		private readonly logger: Logger,
  ) {}

  public async createTelegramInvoice(
    amount: number,
    token: string,
    title: string,
    description: string,
  ) {
    try {
      const createInvoice = await this.bot.telegram.createInvoiceLink({
        title: title,
        description: description,
        provider_token: '',
        payload: token,
        currency: 'XTR',
        prices: [{ label: 'XTR', amount: Number(amount.toFixed(0)) }],
      })
      return createInvoice
    } catch (e) {
      this.logger.error({
        msg: `Error while creating invoice`,
        e,
      })
    }
  }
}