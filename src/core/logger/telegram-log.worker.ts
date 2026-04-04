import { RedisService } from '@core/redis/redis.service'
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Job, Worker } from 'bullmq'
import * as crypto from 'crypto'
import { InjectBot } from 'nestjs-telegraf'
import { Telegraf } from 'telegraf'

@Injectable()
export class TelegramLogWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramLogWorker.name)
  private worker?: Worker

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    @InjectBot() private readonly bot: Telegraf,
  ) {}

  async onModuleInit() {
    this.worker = new Worker(
      'telegram-logs',
      async (job: Job) => this.process(job),
      {
        connection: {
          host: this.config.get('REDIS_HOST'),
          port: Number(this.config.get('REDIS_PORT')),
          password: this.config.get('REDIS_PASSWORD') || undefined,
        },

        concurrency: 1,

        // 🔥 Rate limit теперь здесь
        limiter: {
          max: 25,
          duration: 1000,
        },
      },
    )

    this.worker.on('failed', (job, err) => {
      this.logger.warn(`Job ${job?.id} failed: ${err?.message}`)
    })

    this.logger.log('TelegramLogWorker started')
  }

  async onModuleDestroy() {
    await this.worker?.close()
  }

  private async process(job: Job) {
    const { level, text } = job.data as {
      level: string
      text: string
    }

    const hash = crypto
      .createHash('sha1')
      .update(`${level}:${text}`)
      .digest('hex')

    const dedupeKey = `telegram:dedupe:${hash}`

    const lock = await this.redis.setWithExpiryNx(dedupeKey, '1', 10)
    if (!lock) return

    const message = `*${level.toUpperCase()}*: ${this.escape(text)}`

    try {
      await this.bot.telegram.sendMessage(
        Number(process.env.TELEGRAM_LOG_CHAT_ID),
        message,
        {
          parse_mode: 'MarkdownV2',
          message_thread_id: Number(
            process.env[`TELEGRAM_THREAD_ID_${level.toUpperCase()}`],
          ),
        },
      )
    } catch (err: any) {
      const retryAfter = err?.response?.parameters?.retry_after

      if (retryAfter) {
        await new Promise((r) => setTimeout(r, retryAfter * 1000 + 200))

        await this.bot.telegram.sendMessage(
          Number(process.env.TELEGRAM_LOG_CHAT_ID),
          message,
          {
            parse_mode: 'MarkdownV2',
            message_thread_id: Number(
              process.env[`TELEGRAM_THREAD_ID_${level.toUpperCase()}`],
            ),
          },
        )

        return
      }

      const transient =
        err?.code === 'ETIMEDOUT' ||
        err?.code === 'ECONNRESET' ||
        err?.code === 'ENOTFOUND' ||
        err?.response?.status >= 500

      if (transient) {
        throw err // BullMQ retry
      }

      this.logger.error('Non-retriable Telegram error', err)
    }
  }

  private escape(text: string) {
    return text.replace(/([_\-*[\]()~`>#+=|{}.!])/g, '\\$1')
  }
}
