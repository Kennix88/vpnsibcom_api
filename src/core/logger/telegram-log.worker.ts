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
import { ParseMode } from 'telegraf/types'

type TelegramLogJob = {
  type: 'log'
  level: string
  text: string
}

type TelegramMessageJob = {
  type: 'message'
  chatId: number
  text: string
  threadId?: number
  parseMode?: ParseMode
  disableWebPagePreview?: boolean
  disableNotification?: boolean
  dedupeSeconds?: number
}

type SendPayload = Omit<TelegramMessageJob, 'type' | 'dedupeSeconds'>

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
    const data = job.data as TelegramLogJob | TelegramMessageJob

    if (data.type === 'message') {
      await this.processMessageJob(data)
      return
    }

    await this.processLogJob(data)
  }

  private async processLogJob(data: TelegramLogJob) {
    const hash = crypto
      .createHash('sha1')
      .update(`${data.level}:${data.text}`)
      .digest('hex')

    const dedupeKey = `telegram:dedupe:${hash}`
    const lock = await this.redis.setWithExpiryNx(dedupeKey, '1', 10)
    if (!lock) return

    const message = `*${data.level.toUpperCase()}*: ${this.escape(data.text)}`
    const threadId = Number(
      process.env[`TELEGRAM_THREAD_ID_${data.level.toUpperCase()}`],
    )

    try {
      await this.sendWithRetry({
        chatId: Number(process.env.TELEGRAM_LOG_CHAT_ID),
        text: message,
        parseMode: 'MarkdownV2',
        threadId: Number.isNaN(threadId) ? undefined : threadId,
      })
    } catch (err: any) {
      this.handleSendError(err)
    }
  }

  private async processMessageJob(data: TelegramMessageJob) {
    if (data.dedupeSeconds && data.dedupeSeconds > 0) {
      const hash = crypto
        .createHash('sha1')
        .update(
          `${data.chatId}:${data.threadId ?? ''}:${data.parseMode ?? ''}:${
            data.text
          }`,
        )
        .digest('hex')

      const dedupeKey = `telegram:dedupe:msg:${hash}`
      const lock = await this.redis.setWithExpiryNx(
        dedupeKey,
        '1',
        data.dedupeSeconds,
      )
      if (!lock) return
    }

    try {
      await this.sendWithRetry({
        chatId: data.chatId,
        text: data.text,
        parseMode: data.parseMode,
        threadId: data.threadId,
        disableNotification: data.disableNotification,
        disableWebPagePreview: data.disableWebPagePreview,
      })
    } catch (err: any) {
      this.handleSendError(err)
    }
  }

  private async sendWithRetry(payload: SendPayload) {
    try {
      await this.bot.telegram.sendMessage(payload.chatId, payload.text, {
        parse_mode: payload.parseMode,
        message_thread_id: payload.threadId,
        disable_notification: payload.disableNotification,
        link_preview_options: payload.disableWebPagePreview
          ? { is_disabled: true }
          : undefined,
      })
    } catch (err: any) {
      const retryAfter = err?.response?.parameters?.retry_after

      if (retryAfter) {
        await new Promise((r) =>
          setTimeout(r, Number(retryAfter) * 1000 + 1000),
        )
        await this.sendWithRetry(payload)
        return
      }

      throw err
    }
  }

  private handleSendError(err: any) {
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

  private escape(text: string) {
    return text.replace(/([_\-*[\]()~`>#+=|{}.!])/g, '\\$1')
  }
}
