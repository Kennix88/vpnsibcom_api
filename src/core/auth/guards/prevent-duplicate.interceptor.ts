import { LoggerTelegramService } from '@core/logger/logger-telegram.service'
import { RedisService } from '@core/redis/redis.service'
import { getClientIp } from '@modules/xray/utils/get-client-ip.util'
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import * as crypto from 'crypto'
import { Observable, from, of, throwError } from 'rxjs'
import { catchError, switchMap, tap } from 'rxjs/operators'
import { PREVENT_DUPLICATE_META } from '../decorators/prevent-duplicate.decorator'

// Import from the decorator to avoid duplication

const CACHE_PREFIX = 'dup:req:'
const LOCK_PREFIX = 'dup:lock:'
const DEFAULT_TTL = 60
const MAX_RETRIES = 10
const RETRY_DELAY = 300

@Injectable()
export class PreventDuplicateInterceptor implements NestInterceptor {
  private readonly HMAC_SECRET: string

  constructor(
    private readonly redis: RedisService,
    private readonly reflector: Reflector,
    private readonly telegramLogger: LoggerTelegramService,
  ) {
    this.HMAC_SECRET = process.env.HMAC_SECRET || 'default-secret'
  }

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const ttl =
      this.reflector.get<number>(
        PREVENT_DUPLICATE_META,
        context.getHandler(),
      ) ??
      this.reflector.get<number>(PREVENT_DUPLICATE_META, context.getClass()) ??
      DEFAULT_TTL

    if (ttl <= 0) {
      return next.handle()
    }

    const req = context.switchToHttp().getRequest()
    if (['OPTIONS', 'HEAD'].includes(req.method.toUpperCase())) {
      return next.handle()
    }

    try {
      const { method, originalUrl: path, body = {}, query = {}, user } = req
      const realIp = getClientIp(req)
      const identity = this.getIdentity(user, realIp)
      const hash = this.generateRequestHash(method, path, body, query, identity)

      const cacheKey = `${CACHE_PREFIX}${hash}`
      const lockKey = `${LOCK_PREFIX}${hash}`

      // Check cache
      const cached = await this.safeRedisOperation(() =>
        this.redis.getObject(cacheKey),
      )
      if (cached) {
        this.logRequest({
          type: 'cache-hit',
          method,
          path,
          user,
          realIp,
          details: { ttl },
        })
        return of(cached)
      }

      // Try to acquire lock
      const locked = await this.safeRedisOperation(() =>
        this.redis.setWithExpiryNx(lockKey, '1', ttl),
      )
      if (!locked) {
        return this.handleConcurrentRequest({
          method,
          path,
          user,
          realIp,
          cacheKey,
          lockKey,
        })
      }

      this.logRequest({
        type: 'lock-acquired',
        method,
        path,
        user,
        realIp,
        details: { ttl },
      })

      // Process and cache
      return next.handle().pipe(
        tap(async (response) => {
          await this.cacheResponse(cacheKey, response, ttl, lockKey)
          this.logRequest({
            type: 'cache-set',
            method,
            path,
            user,
            realIp,
            details: { ttl },
          })
        }),
        catchError((err) =>
          this.handleError(err, { method, path, user, realIp, lockKey }),
        ),
      )
    } catch (err) {
      this.logRequest({
        type: 'error',
        method: req.method,
        path: req.originalUrl,
        user: req.user,
        realIp: getClientIp(req),
        details: {
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : '',
        },
      })
      return next.handle()
    }
  }

  private getIdentity(user: any, realIp: string): string {
    const jwtSub = user?.sub
    const jwtTg = user?.telegramId
    return jwtSub && jwtTg
      ? `${jwtSub}:${jwtTg}`
      : jwtSub
      ? jwtSub
      : jwtTg
      ? jwtTg
      : realIp
  }

  private generateRequestHash(
    method: string,
    path: string,
    body: any,
    query: any,
    identity: string,
  ): string {
    const hashInput = JSON.stringify({
      method: method.toUpperCase(),
      path,
      body: this.sanitizeBody(body),
      query,
      identity,
    })
    return crypto
      .createHmac('sha256', this.HMAC_SECRET)
      .update(hashInput)
      .digest('hex')
  }

  private sanitizeBody(body: any): any {
    const sanitized = { ...body }
    delete sanitized.password
    delete sanitized.token
    delete sanitized.timestamp
    return sanitized
  }

  private async safeRedisOperation<T>(
    operation: () => Promise<T>,
    context?: { method: string; path: string },
  ): Promise<T | null> {
    try {
      return await operation()
    } catch (err) {
      this.logRequest({
        type: 'error',
        method: context?.method || 'UNKNOWN',
        path: context?.path || 'UNKNOWN',
        details: {
          error: 'Redis operation failed',
          message: err instanceof Error ? err.message : String(err),
        },
      })
      return null
    }
  }

  private async cacheResponse(
    cacheKey: string,
    response: any,
    ttl: number,
    lockKey: string,
  ): Promise<void> {
    await Promise.all([
      this.safeRedisOperation(
        () => this.redis.setObjectWithExpiry(cacheKey, response, ttl),
        { method: 'CACHE', path: cacheKey },
      ),
      this.safeRedisOperation(() => this.redis.del(lockKey), {
        method: 'LOCK',
        path: lockKey,
      }),
    ])
  }

  private handleConcurrentRequest(params: {
    method: string
    path: string
    user: any
    realIp: string
    cacheKey: string
    lockKey: string
  }): Observable<any> {
    const { method, path, user, realIp, cacheKey } = params

    this.logRequest({
      type: 'concurrent',
      method,
      path,
      user,
      realIp,
      details: { retries: MAX_RETRIES, delay: RETRY_DELAY },
    })

    const waitForCache = async (): Promise<any> => {
      for (let i = 0; i < MAX_RETRIES; i++) {
        const result = await this.safeRedisOperation(
          () => this.redis.getObject(cacheKey),
          { method, path },
        )
        if (result) return result
        await new Promise((r) => setTimeout(r, RETRY_DELAY))
      }

      // Do NOT delete the lock here — the original request still owns it.
      // Let the timeout surface as an error and allow the original to complete.
      throw new Error(`Request processing timeout after ${MAX_RETRIES} retries`)
    }

    return from(waitForCache()).pipe(
      catchError((err) => {
        this.logRequest({
          type: 'concurrent-failed',
          method,
          path,
          user,
          realIp,
          details: { error: err.message },
        })
        return throwError(() => err)
      }),
    )
  }

  private handleError(
    err: Error,
    context: {
      method: string
      path: string
      user: any
      realIp: string
      lockKey: string
    },
  ): Observable<never> {
    const { method, path, user, realIp, lockKey } = context

    const releaseLock$ = from(
      this.safeRedisOperation(() => this.redis.del(lockKey), { method, path }),
    )

    return releaseLock$.pipe(
      tap((result) => {
        this.logRequest({
          type: 'error',
          method,
          path,
          user,
          realIp,
          details: {
            error: err.message,
            action: result ? 'lock-released' : 'lock-release-failed',
          },
        })
      }),
      switchMap(() => throwError(() => err)),
    )
  }

  private logRequest(params: {
    type: string
    method: string
    path: string
    user?: any
    realIp?: string
    details?: Record<string, any>
  }): void {
    const { type, method, path, user, realIp, details = {} } = params

    const logLevels: Record<string, string> = {
      'cache-hit': 'info',
      'lock-acquired': 'info',
      'cache-set': 'info',
      concurrent: 'warn',
      'concurrent-failed': 'error',
      error: 'error',
    }

    const emojiMap: Record<string, string> = {
      'cache-hit': '✅',
      'lock-acquired': '🔒',
      'cache-set': '💾',
      concurrent: '⏳',
      'concurrent-failed': '❌',
      error: '⚠️',
    }

    const messageTemplates: Record<string, string> = {
      'cache-hit': `Кэшированный ответ возвращен`,
      'lock-acquired': `Блокировка установлена на ${details.ttl || 'N/A'} сек`,
      'cache-set': `Результат закеширован на ${details.ttl || 'N/A'} сек`,
      concurrent: `Обнаружен параллельный запрос (попытка ${
        details.retry || 1
      }/${MAX_RETRIES})`,
      'concurrent-failed': `Превышено время ожидания`,
      error: `Ошибка: ${details.error || 'Неизвестная ошибка'}`,
    }

    const baseMessage = [
      emojiMap[type] || '📌',
      `${method} ${path}`,
      messageTemplates[type] || 'Событие',
    ].join(' ')

    const additionalInfo = [
      user?.sub ? `UserID: ${user.sub}` : '',
      user?.telegramId ? `TGID: ${user.telegramId}` : '',
      realIp ? `IP: ${realIp}` : '',
      details.error ? `Ошибка: ${details.error}` : '',
      details.ttl ? `TTL: ${details.ttl} сек` : '',
      details.retries ? `Макс. попыток: ${details.retries}` : '',
    ]
      .filter(Boolean)
      .join(' | ')

    const fullMessage = [baseMessage, additionalInfo].filter(Boolean).join('\n')

    const level = logLevels[type] || 'info'
    this.telegramLogger[level](fullMessage)

    if (type === 'error' && details.stack) {
      console.error(details.stack)
    }
  }
}
