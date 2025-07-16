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
    const request = ctx.getRequest()

    let status = 500
    let message = 'Internal server error'
    let errorName = 'UnknownError'

    if (exception instanceof HttpException) {
      status = exception.getStatus()
      message = exception.message
      errorName = exception.name
    } else if (exception instanceof Error) {
      message = exception.message
      errorName = exception.name
    }

    const logContext = {
      req: {
        id: request.id,
        method: request.method,
        url: request.url,
        query: request.query,
        headers: request.headers,
        remoteAddress: request.ip || request.socket?.remoteAddress,
        remotePort: request.socket?.remotePort,
      },
      context: GlobalExceptionFilter.name,
    }

    this.logger.error(message, (exception as Error)?.stack, logContext)

    try {
      await this.telegramLogger.error(
        `🚨 [${status}] ${message}\n` +
          `🌐 ${request.method} ${request.url}\n` +
          `📡 IP: ${request.ip || request.headers['x-forwarded-for']}\n` +
          `📦 UA: ${request.headers['user-agent']}`,
      )
    } catch (tgErr) {
      this.logger.warn(`Ошибка при отправке в Telegram: ${tgErr.message}`)
    }

    try {
      const responseObj = response.status(status)
      if (responseObj && typeof responseObj.json === 'function') {
        responseObj.json({
          statusCode: status,
          message,
          error: errorName,
        })
      } else {
        response.send({ statusCode: status, message, error: errorName })
      }
    } catch (resErr) {
      this.logger.error(`Ошибка при отправке ответа: ${resErr.message}`)
    }
  }
}
