import { TELEGRAM_QUEUE } from '@core/bullmq/bullmq.module'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { Queue } from 'bullmq'
import { ParseMode } from 'telegraf/types'

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal'

type TelegramMessagePayload = {
  chatId: number
  text: string
  threadId?: number
  parseMode?: ParseMode
  disableWebPagePreview?: boolean
  disableNotification?: boolean
  dedupeSeconds?: number
}

@Injectable()
export class LoggerTelegramService {
  private readonly logger = new Logger(LoggerTelegramService.name)

  constructor(
    @Inject(TELEGRAM_QUEUE)
    private readonly queue: Queue,
  ) {}

  debug(msg: string) {
    this.enqueue('debug', msg)
  }

  info(msg: string) {
    this.enqueue('info', msg)
  }

  warn(msg: string) {
    this.enqueue('warn', msg)
  }

  error(msg: string) {
    this.enqueue('error', msg)
  }

  fatal(msg: string) {
    this.enqueue('fatal', msg)
  }

  sendMessage(payload: TelegramMessagePayload) {
    this.queue
      .add('send', { type: 'message', ...payload })
      .catch((err) =>
        this.logger.error(
          `Failed to enqueue telegram message: ${err?.message}`,
        ),
      )
  }

  private enqueue(level: LogLevel, text: string) {
    this.queue
      .add('send', { type: 'log', level, text })
      .catch((err) =>
        this.logger.error(
          `Failed to enqueue telegram log [${level}]: ${err?.message}`,
        ),
      )
  }
}
