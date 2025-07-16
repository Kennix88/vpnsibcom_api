import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common'
import { Queue } from 'async'
import * as crypto from 'crypto'
import { InjectBot } from 'nestjs-telegraf'
import { Telegraf } from 'telegraf'

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal'

interface LogTask {
  level: LogLevel
  text: string
}

@Injectable()
export class LoggerTelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LoggerTelegramService.name)

  private readonly chatId: number = Number(process.env.TELEGRAM_LOG_CHAT_ID)

  private readonly threadIds: Record<LogLevel, number> = {
    debug: Number(process.env.TELEGRAM_THREAD_ID_DEBUG),
    info: Number(process.env.TELEGRAM_THREAD_ID_INFO),
    warn: Number(process.env.TELEGRAM_THREAD_ID_WARN),
    error: Number(process.env.TELEGRAM_THREAD_ID_ERROR),
    fatal: Number(process.env.TELEGRAM_THREAD_ID_ERROR),
  }

  private queue: Queue<LogTask>
  private recentHashes = new Map<string, number>()

  constructor(@InjectBot() private readonly bot: Telegraf) {
    this.queue = new Queue(async (task: LogTask) => {
      const hash = this.hashText(task.level, task.text)
      const now = Date.now()

      // Avoid spamming identical messages within 10s
      if (
        this.recentHashes.has(hash) &&
        now - this.recentHashes.get(hash)! < 10_000
      ) {
        return
      }
      this.recentHashes.set(hash, now)

      try {
        await this.bot.telegram.sendMessage(
          this.chatId,
          `*${task.level.toUpperCase()}*: ${this.escapeMarkdown(task.text)}`,
          {
            parse_mode: 'MarkdownV2',
            message_thread_id: this.threadIds[task.level],
          },
        )
      } catch (err) {
        this.logger.error('Failed to send Telegram log', (err as Error).stack)
      }
    }, 1) // concurrency = 1
  }

  onModuleInit() {
    this.queue.drain(() => this.logger.debug('Telegram log queue drained'))
    this.logger.log('LoggerTelegramService initialized')
  }

  onModuleDestroy() {
    this.queue.kill()
  }

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

  private enqueue(level: LogLevel, text: string) {
    if (!this.chatId || !this.threadIds[level]) {
      this.logger.warn(
        `Telegram chatId or threadId not configured (level=${level})`,
      )
      return
    }
    this.queue.push({ level, text })
  }

  private escapeMarkdown(text: string): string {
    return text.replace(/([_\-*\[\]()~`>#+=|{}.!])/g, '\\$1')
  }

  private hashText(level: LogLevel, text: string): string {
    return crypto.createHash('sha1').update(`${level}:${text}`).digest('hex')
  }
}
