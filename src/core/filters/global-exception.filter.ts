import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard'
import { LoggerTelegramService } from '@core/logger/logger-telegram.service'
import { getClientIp } from '@modules/xray/utils/get-client-ip.util'
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
import { FastifyReply, FastifyRequest } from 'fastify'

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name)
  private readonly MAX_STACK_LENGTH = 1500
  private readonly SENSITIVE_KEYS = [
    'password',
    'token',
    'authorization',
    'cookie',
  ]

  constructor(
    private readonly telegramLogger: LoggerTelegramService,
    private readonly jwtAuthGuard: JwtAuthGuard,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const reply = ctx.getResponse<FastifyReply>()
    const request = ctx.getRequest<FastifyRequest>()
    const token = this.jwtAuthGuard.extractTokenFromRequest(request)

    let payload: JwtPayload | null = null
    try {
      if (token) {
        payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
          secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        })
      }
    } catch (jwtError) {
      this.logger.warn(`JWT verification failed: ${jwtError.message}`)
    }

    const { status, message, errorName, errorDetails } =
      this.parseException(exception)
    const sanitizedRequest = this.sanitizeFastifyRequest(request)

    await this.logErrorToTelegram({
      status,
      message,
      errorName,
      exception,
      request: sanitizedRequest,
      payload,
    })

    this.logErrorToConsole(exception, sanitizedRequest)

    this.sendFastifyResponse(reply, {
      status,
      message,
      errorName,
      errorDetails,
      exception,
      request,
    })
  }

  private parseException(exception: unknown): {
    status: number
    message: string
    errorName: string
    errorDetails?: any
  } {
    if (exception instanceof HttpException) {
      const response = exception.getResponse()
      return {
        status: exception.getStatus(),
        message:
          typeof response === 'object'
            ? (response as any).message || exception.message
            : exception.message,
        errorName: exception.name,
        errorDetails: typeof response === 'object' ? response : undefined,
      }
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return {
        status: 400,
        message: this.getPrismaErrorMessage(exception),
        errorName: exception.name,
        errorDetails: exception.meta,
      }
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        status: 422,
        message: 'Database validation error',
        errorName: exception.name,
        errorDetails: exception.message,
      }
    }

    if (exception instanceof Error) {
      return {
        status: 500,
        message: exception.message,
        errorName: exception.name,
      }
    }

    return {
      status: 500,
      message: 'Internal server error',
      errorName: 'UnknownError',
    }
  }

  private sanitizeFastifyRequest(request: FastifyRequest): any {
    const sanitize = (obj: any): any => {
      if (!obj || typeof obj !== 'object') return obj

      if (Array.isArray(obj)) {
        return obj.map(sanitize)
      }

      return Object.keys(obj).reduce((acc, key) => {
        const lowerKey = key.toLowerCase()
        if (this.SENSITIVE_KEYS.some((sk) => lowerKey.includes(sk))) {
          acc[key] = '*****'
        } else {
          acc[key] = sanitize(obj[key])
        }
        return acc
      }, {} as any)
    }

    return {
      id: request.id,
      method: request.method,
      url: request.url,
      query: sanitize(request.query),
      params: sanitize(request.params),
      body: request.method !== 'GET' ? sanitize(request.body) : undefined,
      headers: sanitize(request.headers),
      ip: getClientIp(request),
      hostname: request.hostname,
      userAgent: request.headers['user-agent'],
    }
  }

  private async logErrorToTelegram(data: {
    status: number
    message: string
    errorName: string
    exception: unknown
    request: any
    payload: JwtPayload | null
  }) {
    try {
      const { status, message, errorName, exception, request, payload } = data
      const stack = (exception as Error)?.stack
      const truncatedStack = stack
        ? stack.substring(0, this.MAX_STACK_LENGTH) +
          (stack.length > this.MAX_STACK_LENGTH ? '...' : '')
        : undefined

      const errorCode = (exception as any)?.code
      const errorMeta = (exception as any)?.meta

      const messageParts = [
        `🔥 [${status}] ${errorName}`,
        `📝 ${message}`,
        `🌐 ${request.method} ${request.url}`,
        `🆔 Request ID: ${request.id || 'none'}`,
        payload?.sub && `👤 User ID: ${payload.sub}`,
        payload?.telegramId && `📱 Telegram ID: ${payload.telegramId}`,
        payload?.role && `🎭 Role: ${payload.role}`,
        `📡 IP: ${getClientIp(request)}`,
        `🖥️ Host: ${request.hostname}`,
        errorCode && `🔢 Code: ${errorCode}`,
        truncatedStack && `📜 Stack:\n${truncatedStack}`,
        errorMeta && `🔍 Meta:\n${JSON.stringify(errorMeta, null, 2)}`,
        `⏰ ${new Date().toISOString()}`,
      ].filter(Boolean)

      await this.telegramLogger.error(messageParts.join('\n\n'))
    } catch (tgErr) {
      this.logger.error(
        `Failed to send Telegram alert: ${tgErr.message}`,
        tgErr.stack,
      )
    }
  }

  private logErrorToConsole(exception: unknown, request: any) {
    const error =
      exception instanceof Error ? exception : new Error(String(exception))
    this.logger.error(
      `Request failed: ${request.method} ${request.url} (ID: ${request.id})`,
      {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
          ...(error instanceof Prisma.PrismaClientKnownRequestError && {
            code: error.code,
            meta: error.meta,
          }),
        },
        request,
      },
    )
  }

  private sendFastifyResponse(
    reply: FastifyReply,
    data: {
      status: number
      message: string
      errorName: string
      errorDetails?: any
      exception: unknown
      request: FastifyRequest
    },
  ) {
    const { status, message, errorName, errorDetails, exception, request } =
      data
    const isProduction = process.env.NODE_ENV === 'production'

    const responseBody = {
      statusCode: status,
      message,
      error: errorName,
      timestamp: new Date().toISOString(),
      path: request.url,
      requestId: request.id,
      ...(!isProduction && {
        ...(errorDetails && { details: errorDetails }),
        ...(exception instanceof Error && {
          stack: exception.stack,
          ...(exception instanceof Prisma.PrismaClientKnownRequestError && {
            errorCode: exception.code,
          }),
        }),
      }),
    }

    reply.status(status).send(responseBody)
  }

  private getPrismaErrorMessage(
    error: Prisma.PrismaClientKnownRequestError,
  ): string {
    const errorMessages: Record<string, string> = {
      P2002: `Duplicate value for unique field: ${
        error.meta?.target || 'unknown'
      }`,
      P2025: 'Requested record not found',
      P2003: 'Foreign key constraint violation',
      P2000: 'Input value too long',
      P2001: 'Record does not exist',
      P2011: 'Null constraint violation',
      P2012: 'Missing required value',
      P2013: 'Missing required argument',
      P2014: 'Relation violation',
      P2015: 'Related record not found',
      P2016: 'Query interpretation error',
      P2017: 'Database records not connected',
      P2018: 'Required connected records not found',
      P2019: 'Input error',
      P2020: 'Value out of range',
      P2021: 'Table does not exist',
      P2022: 'Column does not exist',
      P2023: 'Inconsistent column data',
      P2024: 'Timed out acquiring connection',
      P2026: 'Unsupported database feature',
      P2027: 'Multiple errors occurred',
    }

    return errorMessages[error.code] || 'Database operation failed'
  }
}
