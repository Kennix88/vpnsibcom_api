import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios from 'axios'
import { PinoLogger } from 'nestjs-pino'
import { InjectBot } from 'nestjs-telegraf'
import { Telegraf } from 'telegraf'

@Injectable()
export class AdsgramService {
  private readonly TOKEN?: string
  constructor(
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
    @InjectBot() private readonly bot: Telegraf,
  ) {
    this.TOKEN = this.configService.get<string>('ADSGRAM_TOKEN')
  }

  /** Отправка трекинга в adsgram для оптимимзации рекламы
   * recordId - идентификатор записи
   * goaltype - тип цели (1 - регистрация, 2 - первый платеж, 3 - повторный платеж)
   **/
  public async sendEvent({
    recordId,
    goaltype,
  }: {
    recordId: string
    goaltype: 1 | 2 | 3
  }): Promise<boolean> {
    if (!this.TOKEN) {
      this.logger.warn({
        msg: 'Adsgram conversion skipped: ADSGRAM_TOKEN is empty',
        goaltype,
        recordId,
      })
      return false
    }

    try {
      const response = await axios.get(
        'https://api.adsgram.ai/confirm_conversion',
        {
          params: {
            token: this.TOKEN,
            record: recordId,
            goaltype,
          },
          timeout: 10000,
        },
      )

      this.logger.info({
        msg: 'Adsgram conversion sent',
        goaltype,
        recordId,
        status: response.status,
      })
      return response.status === 200
    } catch (error) {
      this.logger.error({
        msg: 'Adsgram conversion failed',
        goaltype,
        recordId,
        tokenExists: Boolean(this.TOKEN),
        error,
      })
      return false
    }
  }
}
