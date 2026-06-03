import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios from 'axios'
import { PinoLogger } from 'nestjs-pino'
import { InjectBot } from 'nestjs-telegraf'
import { Telegraf } from 'telegraf'

export interface AdsgramBotAdResponse {
  text_html: string
  click_url: string
  button_name: string
  image_url?: string
  button_reward_name?: string
  reward_url?: string
}

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

  /** Получить рекламу для Telegram-бота */
  public async getAdForBot(opts: {
    telegramId: string | number
    blockId: string
    language?: string
  }): Promise<AdsgramBotAdResponse | null> {
    if (!this.TOKEN) {
      this.logger.warn({
        msg: 'Adsgram bot getAd skipped: ADSGRAM_TOKEN is empty',
      })
      return null
    }

    try {
      const response = await axios.get<AdsgramBotAdResponse>(
        'https://api.adsgram.ai/advbot',
        {
          params: {
            tgid: opts.telegramId,
            blockid: opts.blockId, // только числовая часть, без "bot-"
            language: opts.language ?? 'en',
            token: this.TOKEN,
          },
          timeout: 5_000,
        },
      )

      this.logger.info('AdsgramBotAdResponse', response)

      if (response.status === 200 && response.data?.click_url) {
        return response.data
      }
      return null
    } catch (error) {
      this.logger.warn({
        msg: 'Adsgram bot getAd failed',
        telegramId: opts.telegramId,
        error: error instanceof Error ? error.message : String(error),
      })
      return null
    }
  }

  /** Трекинг конверсий (существующий метод без изменений) */
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
          params: { token: this.TOKEN, record: recordId, goaltype },
          timeout: 10_000,
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
        error,
      })
      return false
    }
  }
}
