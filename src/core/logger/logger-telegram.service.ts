import { TELEGRAM_QUEUE } from '@core/bullmq/bullmq.module'
import { Inject, Injectable } from '@nestjs/common'
import { Queue } from 'bullmq'

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal'

@Injectable()
export class LoggerTelegramService {
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

  private enqueue(level: LogLevel, text: string) {
    this.queue.add('send', { level, text })
  }
}
