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

@Injectable()
export class PreventDuplicateInterceptor implements NestInterceptor {
  constructor(
    private readonly redis: RedisService,
    private readonly reflector: Reflector,

    private readonly telegramLogger: LoggerTelegramService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    // читаем TTL из метаданных (метод или контроллер)
    const ttl =
      this.reflector.getAllAndOverride<number>(PREVENT_DUPLICATE_META, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 60

    if (ttl <= 0) {
      return next.handle()
    }

    const req = context.switchToHttp().getRequest()
    const skipMethods = ['OPTIONS', 'HEAD']
    if (skipMethods.includes(req.method.toUpperCase())) {
      return next.handle()
    }

    const { method, originalUrl: path, body = {}, query = {}, user } = req
    const realIp = getClientIp(req)
    const jwtSub = user?.sub
    const jwtTg = user?.telegramId
    const identity =
      jwtSub && jwtTg
        ? `${jwtSub}:${jwtTg}`
        : jwtSub
        ? jwtSub
        : jwtTg
        ? jwtTg
        : realIp

    const hashInput = JSON.stringify({
      method: method.toUpperCase(),
      path,
      body,
      query,
      identity,
    })
    const hash = crypto.createHash('sha256').update(hashInput).digest('hex')

    const cacheKey = `dup:req:${hash}`
    const lockKey = `dup:lock:${hash}`

    const cached = await this.redis.get(cacheKey)
    if (cached) {
      this.telegramLogger.info(
        `✅ Попадание в кэш для ${method} ${path}. Пользователь: ${
          user?.sub || 'неавторизован'
        }, IP: ${realIp}`,
      )
      return of(JSON.parse(cached))
    }

    const locked = await this.redis.setWithExpiryNx(lockKey, '1', ttl)
    if (!locked) {
      this.telegramLogger.warn(
        `⏳ Дублирующий запрос в обработке: ${method} ${path}. Пользователь: ${
          user?.sub || 'неавторизован'
        }, IP: ${realIp}`,
      )
      const waitCache = async (retries = 20, delay = 200) => {
        for (let i = 0; i < retries; i++) {
          const result = await this.redis.get(cacheKey)
          if (result) return JSON.parse(result)
          await new Promise((r) => setTimeout(r, delay))
        }
        throw new Error(
          'Duplicate request in progress. Please try again later.',
        )
      }
      return from(waitCache()).pipe(
        catchError((err) => {
          this.telegramLogger.error(
            `❌ Ошибка ожидания кэша для ${method} ${path}. Пользователь: ${
              user?.sub || 'неавторизован'
            }, IP: ${realIp}`,
          )
          return throwError(() => err)
        }),
      )
    }

    await this.redis.hset(`dup:meta:${hash}`, {
      startedAt: Date.now().toString(),
      ip: realIp,
      sub: jwtSub ?? '',
      telegramId: jwtTg ?? '',
    })
    await this.redis.expire(`dup:meta:${hash}`, ttl)

    this.telegramLogger.debug(
      `🔐 Установлена блокировка для ${method} ${path}. Пользователь: ${
        user?.sub || 'неавторизован'
      }, IP: ${realIp}`,
    )

    return next.handle().pipe(
      tap(async (response) => {
        await this.redis.set(cacheKey, JSON.stringify(response), 'EX', ttl)
        await this.redis.del(lockKey)
        this.telegramLogger.info(
          `✅ Данные закэшированы и блокировка снята: ${method} ${path}. Пользователь: ${
            user?.sub || 'неавторизован'
          }, IP: ${realIp}`,
        )
      }),
      catchError((err) => {
        return from(this.redis.del(lockKey)).pipe(
          tap(() =>
            this.telegramLogger.error(
              `❌ Ошибка запроса и снятие блокировки: ${method} ${path}. Пользователь: ${
                user?.sub || 'неавторизован'
              }, IP: ${realIp}`,
            ),
          ),
          switchMap(() => throwError(() => err)),
        )
      }),
    )
  }
}
