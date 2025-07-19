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
import { catchError, tap } from 'rxjs/operators'

const PREVENT_DUPLICATE_META = 'prevent_duplicate_ttl'

@Injectable()
export class PreventDuplicateInterceptor implements NestInterceptor {
  constructor(
    private readonly redis: RedisService,
    private readonly reflector: Reflector,
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
    const { method, originalUrl: path, body = {}, query = {}, user } = req

    const realIp = getClientIp(req)

    // Собираем уникальную identity из JWT payload, fallback на IP
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

    // Делаем хэш по методу, пути, телу, query и identity
    const hashInput = JSON.stringify({ method, path, body, query, identity })
    const hash = crypto.createHash('sha256').update(hashInput).digest('hex')

    const cacheKey = `dup:req:${hash}`
    const lockKey = `dup:lock:${hash}`

    // Если есть закешированный ответ — отдадим его
    const cached = await this.redis.get(cacheKey)
    if (cached) {
      return of(JSON.parse(cached))
    }

    // Пытаемся захватить lock; setWithExpiryNx — атомарно NX + EX
    const locked = await this.redis.setWithExpiryNx(lockKey, '1', ttl)
    if (!locked) {
      // Если lock уже стоит — ждём готовый ответ в кеше
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
      return from(waitCache()).pipe(catchError((err) => throwError(() => err)))
    }

    // Сохраняем мета-инфу о запросе
    await this.redis.hset(`dup:meta:${hash}`, {
      startedAt: Date.now().toString(),
      ip: realIp,
      sub: jwtSub ?? '',
      telegramId: jwtTg ?? '',
    })
    await this.redis.expire(`dup:meta:${hash}`, ttl)

    // Выполняем основной обработчик, кешируем ответ и снимаем lock
    return next.handle().pipe(
      tap(async (response) => {
        await this.redis.set(cacheKey, JSON.stringify(response), 'EX', ttl)
        await this.redis.del(lockKey)
      }),
      catchError(async (err) => {
        await this.redis.del(lockKey)
        throw err
      }),
    )
  }
}
