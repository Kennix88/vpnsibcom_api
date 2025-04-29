import { LoggerTelegramService } from '@core/logger/logger-telegram.service'
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common'

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name)

  constructor(private readonly telegramLogger: LoggerTelegramService) {}

  async catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse()

    // Определяем статус и сообщение
    let status = 500
    let message = 'Internal server error'

    if (exception instanceof HttpException) {
      status = exception.getStatus()
      message = exception.message
    } else if (exception instanceof Error) {
      message = exception.message
    }

    // Локально логируем в консоль и в файлы через Pino
    this.logger.error(message, (exception as Error)?.stack)

    // Отправляем в Telegram подп-чат для ошибок
    await this.telegramLogger.error(`🚨 [${status}] ${message}`)

    // Возвращаем стандартный ответ клиенту
    if (response) {
      response.status(status).json({ statusCode: status, message })
    }
  }
}
