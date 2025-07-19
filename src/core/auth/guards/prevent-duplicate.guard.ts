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

const PREVENT_DUPLICATE_META = 'prevent_duplicate_ttl'
const CACHE_PREFIX = 'dup:req:'
const LOCK_PREFIX = 'dup:lock:'
const META_PREFIX = 'dup:meta:'
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

    if (ttl <= 0) return next.handle()

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
      const metaKey = `${META_PREFIX}${hash}`

      const cached = await this.safeRedisOperation(() =>
        this.redis.getObject(cacheKey),
      )
      if (cached) {
        this.logRequest('cache-hit', method, path, user, realIp)
        return of(cached)
      }

      const locked = await this.safeRedisOperation(() =>
        this.redis.setWithExpiryNx(lockKey, '1', ttl),
      )
      if (!locked) {
        return this.handleConcurrentRequest(
          method,
          path,
          user,
          realIp,
          cacheKey,
          lockKey,
        )
      }

      await this.recordRequestMetadata(metaKey, realIp, user, ttl)
      this.logRequest('lock-acquired', method, path, user, realIp)

      return next.handle().pipe(
        tap(async (response) => {
          await this.cacheResponse(cacheKey, response, ttl, lockKey)
          this.logRequest('cache-set', method, path, user, realIp)
        }),
        catchError((err) =>
          this.handleError(err, lockKey, method, path, user, realIp),
        ),
      )
    } catch (err) {
      this.telegramLogger.error(
        `PreventDuplicateInterceptor failed: ${err.message}`,
      )
      return next.handle() // Fallback to normal processing
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
      body,
      query,
      identity,
    })
    return crypto
      .createHmac('sha256', this.HMAC_SECRET)
      .update(hashInput)
      .digest('hex')
  }

  private async safeRedisOperation<T>(
    operation: () => Promise<T>,
  ): Promise<T | null> {
    try {
      return await operation()
    } catch (err) {
      this.telegramLogger.error(`Redis operation failed: ${err.message}`)
      return null
    }
  }

  private async recordRequestMetadata(
    metaKey: string,
    realIp: string,
    user: any,
    ttl: number,
  ): Promise<void> {
    await this.safeRedisOperation(() =>
      this.redis.hsetWithExpiry(
        metaKey,
        {
          startedAt: Date.now().toString(),
          ip: realIp,
          sub: user?.sub ?? '',
          telegramId: user?.telegramId ?? '',
        },
        ttl,
      ),
    )
  }

  private async cacheResponse(
    cacheKey: string,
    response: any,
    ttl: number,
    lockKey: string,
  ): Promise<void> {
    await Promise.all([
      this.safeRedisOperation(() =>
        this.redis.setObjectWithExpiry(cacheKey, response, ttl),
      ),
      this.safeRedisOperation(() => this.redis.del(lockKey)),
    ])
  }

  private handleConcurrentRequest(
    method: string,
    path: string,
    user: any,
    realIp: string,
    cacheKey: string,
    lockKey: string,
  ): Observable<any> {
    this.logRequest('concurrent', method, path, user, realIp)

    const waitForCache = async (): Promise<any> => {
      for (let i = 0; i < MAX_RETRIES; i++) {
        const result = await this.safeRedisOperation(() =>
          this.redis.getObject(cacheKey),
        )
        if (result) return result
        await new Promise((r) => setTimeout(r, RETRY_DELAY))
      }
      await this.safeRedisOperation(() => this.redis.del(lockKey))
      throw new Error('Request processing timeout')
    }

    return from(waitForCache()).pipe(
      catchError((err) => {
        this.logRequest('concurrent-failed', method, path, user, realIp)
        return throwError(() => err)
      }),
    )
  }

  private handleError(
    err: Error,
    lockKey: string,
    method: string,
    path: string,
    user: any,
    realIp: string,
  ): Observable<never> {
    return from(this.safeRedisOperation(() => this.redis.del(lockKey))).pipe(
      tap(() => {
        this.logRequest('error', method, path, user, realIp)
      }),
      switchMap(() => throwError(() => err)),
    )
  }

  private logRequest(
    type: string,
    method: string,
    path: string,
    user: any,
    realIp: string,
  ): void {
    const messages = {
      'cache-hit': `✅ Cache hit for ${method} ${path}`,
      'lock-acquired': `🔒 Lock acquired for ${method} ${path}`,
      'cache-set': `💾 Response cached for ${method} ${path}`,
      concurrent: `⏳ Concurrent request detected for ${method} ${path}`,
      'concurrent-failed': `❌ Concurrent request failed for ${method} ${path}`,
      error: `⚠️ Error processing ${method} ${path}`,
    }

    const message = messages[type]
    if (message) {
      const userInfo = user?.sub || 'anonymous'
      this.telegramLogger.info(`${message}. User: ${userInfo}, IP: ${realIp}`)
    }
  }
}
