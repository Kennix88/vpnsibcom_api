import { Injectable, Logger } from '@nestjs/common'
import { InjectBot } from 'nestjs-telegraf'
import { Telegraf } from 'telegraf'

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal'

@Injectable()
export class LoggerTelegramService {
  private readonly logger = new Logger(LoggerTelegramService.name)

  private readonly chatId: number = Number(process.env.TELEGRAM_LOG_CHAT_ID)

  // разные темы (threads) внутри супергруппы для каждого уровня
  private readonly threadIds: Record<LogLevel, number> = {
    debug: Number(process.env.TELEGRAM_THREAD_ID_DEBUG),
    info: Number(process.env.TELEGRAM_THREAD_ID_INFO), // для info и debug
    warn: Number(process.env.TELEGRAM_THREAD_ID_WARN),
    error: Number(process.env.TELEGRAM_THREAD_ID_ERROR), // для error и fatal
    fatal: Number(process.env.TELEGRAM_THREAD_ID_ERROR),
  }

  constructor(@InjectBot() private readonly bot: Telegraf) {}

  /**
   * Универсальный метод отправки
   * @param level — уровень лога
   * @param text  — текст сообщения
   */
  private async send(level: LogLevel, text: string) {
    const thread_id = this.threadIds[level]
    if (!this.chatId || !thread_id) {
      this.logger.error(
        `Telegram chatId or threadId not configured (level=${level})`,
      )
      return
    }

    try {
      await this.bot.telegram.sendMessage(
        this.chatId,
        `*${level.toUpperCase()}*: ${text}`,
        {
          parse_mode: 'Markdown',
          message_thread_id: thread_id,
        },
      )
    } catch (err) {
      this.logger.error('Failed to send Telegram log', (err as Error).stack)
    }
  }

  /** Обёртки для удобства */
  debug(msg: string) {
    return this.send('debug', msg)
  }
  info(msg: string) {
    return this.send('info', msg)
  }
  warn(msg: string) {
    return this.send('warn', msg)
  }
  error(msg: string) {
    return this.send('error', msg)
  }
  fatal(msg: string) {
    return this.send('fatal', msg)
  }
}
