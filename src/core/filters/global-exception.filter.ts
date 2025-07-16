import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard'
import { LoggerTelegramService } from '@core/logger/logger-telegram.service'
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { Prisma } from '@prisma/client'
import { JwtPayload } from '@shared/types/jwt-payload.interface'

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name)

  constructor(
    private readonly telegramLogger: LoggerTelegramService,
    private readonly jwtAuthGuard: JwtAuthGuard,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse()
    const request = ctx.getRequest()
    const token = this.jwtAuthGuard.extractTokenFromRequest(request)

    let payload: JwtPayload
    if (token) {
      payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      })
    }

    let status = 500
    let message = 'Internal server error'
    let errorName = 'UnknownError'

    if (exception instanceof HttpException) {
      status = exception.getStatus()
      message = exception.message
      errorName = exception.name
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      status = 400
      message = this.handlePrismaError(exception)
      errorName = exception.name
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = 422
      message = 'Validation error'
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
        params: request.params,
        body: request.method !== 'GET' ? request.body : undefined,
        headers: request.headers,
        remoteAddress: request.ip || request.socket?.remoteAddress,
        remotePort: request.socket?.remotePort,
      },
      error: {
        name: errorName,
        message: message,
        stack: (exception as Error)?.stack,
        code: (exception as any)?.code,
        meta: (exception as any)?.meta,
      },
      context: GlobalExceptionFilter.name,
      timestamp: new Date().toISOString(),
    }

    this.logger.error(message, (exception as Error)?.stack, logContext)

    try {
      const errorDetails = {
        status,
        message,
        request: {
          method: request.method,
          url: request.url,
          ip: request.ip || request.headers['x-forwarded-for'],
          userAgent: request.headers['user-agent'],
          userId: payload?.sub,
        },
        timestamp: new Date().toISOString(),
      }

      await this.telegramLogger.error(
        `🚨 [${status}] ${message}\n` +
          `❗ EM: ${errorName}\n` +
          `🌐 ${request.method} ${request.url}\n` +
          (payload &&
            `👤 UserID: ${payload?.sub || 'anonymous'}\n` +
              `👤 TelegramID: ${payload?.telegramId || 'anonymous'}\n` +
              `👤 Role: ${payload?.role || 'guest'}\n`) +
          `📡 IP: ${request.ip || request.headers['x-forwarded-for']}\n` +
          `📦 UA: ${request.headers['user-agent']}\n` +
          `⏱️ Time: ${new Date().toISOString()}`,
      )
    } catch (tgErr) {
      this.logger.warn(`Failed to send Telegram notification: ${tgErr.message}`)
    }

    try {
      const responseObj = response.status(status)
      const errorResponse = {
        statusCode: status,
        message,
        error: errorName,
        timestamp: new Date().toISOString(),
        path: request.url,
        ...(process.env.NODE_ENV !== 'production' && {
          stack: (exception as Error)?.stack,
          details: (exception as any)?.meta,
        }),
      }

      if (responseObj && typeof responseObj.json === 'function') {
        responseObj.json(errorResponse)
      } else {
        response.send(errorResponse)
      }
    } catch (resErr) {
      this.logger.error(`Failed to send error response: ${resErr.message}`)
    }
  }

  private handlePrismaError(
    error: Prisma.PrismaClientKnownRequestError,
  ): string {
    switch (error.code) {
      case 'P2002':
        return `Unique constraint failed on ${error.meta?.target}`
      case 'P2025':
        return 'Record not found'
      case 'P2003':
        return 'Foreign key constraint failed'
      case 'P2000':
        return 'Input data is too long'
      case 'P2001':
        return 'Record does not exist'
      default:
        return 'Database error occurred'
    }
  }
}
