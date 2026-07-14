import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { randomUUID } from 'crypto'
import Redis from 'ioredis'

@Injectable()
export class RedisService
  extends Redis
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RedisService.name)

  constructor(private readonly configService: ConfigService) {
    super({
      // ИСПРАВЛЕНО: раньше host/port тихо брались через configService.get(),
      // и при отсутствующих ENV-переменных ioredis просто подставлял свои
      // дефолты (localhost:6379) — в проде это означает, что сервис молча
      // подключался бы не туда (или к локальному Redis в контейнере,
      // которого там нет) вместо явной ошибки при старте. getOrThrow() падает
      // сразу и явно, как и в остальных сервисах проекта (см. паттерн
      // configService.getOrThrow('SUBSCRIPTION_URL') в NewEraService).
      host: configService.getOrThrow('REDIS_HOST'),
      port: configService.getOrThrow('REDIS_PORT'),
      password: configService.get('REDIS_PASSWORD'),

      enableOfflineQueue: true, // пусть очередь команд хранится при реконнекте
      maxRetriesPerRequest: null,

      // socket options (через Node.js net.Socket)
      keepAlive: 10000, // каждые 10s будет TCP keep-alive (по умолчанию 0 = выкл)
      connectTimeout: 10000, // таймаут установки соединения

      // retry strategy (на случай обрыва соединения)
      retryStrategy: (times) => {
        // times = сколько раз пытались подключиться
        const delay = Math.min(times * 500, 10000) // от 500ms до 10s
        return delay
      },

      // ИСПРАВЛЕНО (инверсия логики): раньше на ошибке READONLY (типичный
      // симптом Sentinel failover — клиент всё ещё держит соединение со
      // старым мастером, который Sentinel уже понизил до реплики) возвращали
      // `false`, то есть ЗАПРЕЩАЛИ реконнект. Это ровно противоположно тому,
      // что нужно: именно в этой ситуации клиенту НАДО форсированно
      // переподключиться, чтобы ioredis заново прошёл через Sentinel и нашёл
      // актуальный мастер. С `false` клиент так и продолжал бы слать команды
      // на readonly-узел, получая READONLY на каждой записи, пока что-то
      // другое (обрыв сокета и т.п.) не заставит его переподключиться само.
      // Теперь на READONLY форсируем reconnect (и повторную отправку команды).
      reconnectOnError: (err) => {
        if (err.message.includes('READONLY')) {
          return true // форсируем reconnect + resend команды после failover
        }
        return false
      },
    })

    this.on('connect', () => {
      this.logger.log('Redis connecting...')
    })

    this.on('ready', () => {
      this.logger.log('Redis connection is ready.')
    })

    this.on('error', (err) => {
      this.logger.error(`Redis error: ${err.message}`)
    })

    this.on('end', () => {
      this.logger.warn('Redis connection ended. Will try to reconnect...')
    })

    this.on('close', () => {
      this.logger.warn('Redis connection closed.')
    })

    this.on('reconnecting', (delay) => {
      this.logger.log(`Redis reconnecting in ${delay}ms...`)
    })
  }

  /**
   * Wait until Redis connection is established (even after reconnects).
   *
   * ИСПРАВЛЕНО (утечка listener'ов): раньше вешали `this.once('ready', ...)`
   * и `this.once('error', ...)`, но снимали только тот listener, который
   * реально сработал. Второй (несработавший) оставался подписанным навсегда
   * и срабатывал на следующее по времени событие того же типа — уже после
   * того, как промис давно settled. При частых вызовах waitForConnection()
   * это копило множество мёртвых листенеров на инстансе клиента. Теперь оба
   * снимаются сразу после того, как один из них сработал.
   */
  private async waitForConnection(): Promise<void> {
    if (this.status === 'ready') return

    await new Promise<void>((resolve, reject) => {
      const onReady = () => {
        this.off('error', onError)
        resolve()
      }
      const onError = (err: Error) => {
        this.off('ready', onReady)
        reject(err)
      }

      this.once('ready', onReady)
      this.once('error', onError)
    })
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.waitForConnection()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.error(`Failed to connect to Redis: ${message}`)

      // ИСПРАВЛЕНО: раньше ошибка подключения к Redis на старте приложения
      // просто логировалась и проглатывалась — NestJS считал модуль успешно
      // инициализированным, хотя Redis мог быть недоступен. Учитывая, что от
      // Redis зависят распределённые локи (withLock используется во всех
      // кронах и в создании/продлении подписок), тихий запуск без Redis —
      // это скрытая бомба замедленного действия, а не изящная деградация.
      // Перебрасываем ошибку, чтобы Nest остановил старт приложения и
      // проблема была видна сразу, а не превратилась в загадочные сбои
      // кронов и гонки в проде.
      throw error
    }
  }

  async onModuleDestroy(): Promise<void> {
    // ДОБАВЛЕНО: раньше соединение с Redis нигде явно не закрывалось при
    // остановке приложения — полагались на то, что процесс просто убьют.
    // Явный graceful quit() важен для чистого shutdown (например, в тестах
    // или при rolling restart, где важно не оставлять висящие сокеты).
    try {
      await this.quit()
    } catch (error) {
      this.logger.warn(
        `Ошибка при graceful shutdown Redis-соединения: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }

  async waitTillReady(): Promise<void> {
    await this.waitForConnection()
  }

  async setWithExpiry(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    if (ttlSeconds <= 0) throw new Error('TTL must be positive')
    try {
      const result = await this.set(key, value, 'EX', ttlSeconds)
      return result === 'OK'
    } catch (err) {
      this.logger.error(
        `setWithExpiry failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
      return false
    }
  }

  async setObjectWithExpiry<T>(
    key: string,
    value: T,
    ttlSeconds: number,
  ): Promise<boolean> {
    try {
      const str = JSON.stringify(value)
      return this.setWithExpiry(key, str, ttlSeconds)
    } catch (err) {
      this.logger.error(
        `setObjectWithExpiry failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
      return false
    }
  }

  async setWithExpiryNx(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    if (ttlSeconds <= 0) throw new Error('TTL must be positive')
    try {
      const result = await this.set(key, value, 'EX', ttlSeconds, 'NX')
      return result === 'OK'
    } catch (err) {
      this.logger.error(
        `setWithExpiryNx failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
      return false
    }
  }

  async getObject<T>(key: string): Promise<T | null> {
    try {
      const data = await this.get(key)
      return data ? JSON.parse(data) : null
    } catch (err) {
      // ПРИМЕЧАНИЕ: тут в одну кучу попадают и "ключ не найден"/битый JSON, и
      // реальные сетевые ошибки Redis — снаружи их не отличить, оба случая
      // молча превращаются в null. Осознанно оставляю поведение как есть
      // (это безопасный дефолт для кеша), но если где-то в проекте важно
      // отличать "нет данных" от "Redis недоступен" — этот метод для таких
      // мест не подходит, нужен отдельный вызов без глотания ошибки.
      this.logger.warn(
        `Failed to parse JSON for key ${key}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
      return null
    }
  }

  async hsetWithExpiry(
    key: string,
    data: Record<string, string>,
    ttlSeconds: number,
  ): Promise<boolean> {
    try {
      await this.hset(key, data)
      if (ttlSeconds > 0) {
        await this.expire(key, ttlSeconds)
      }
      return true
    } catch (err) {
      this.logger.error(
        `hsetWithExpiry failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
      return false
    }
  }

  /**
   * Try to acquire a lock. Returns token (string) if acquired, null otherwise.
   * retries — сколько раз пытаться (по умолчанию 0, т.е. одна попытка).
   */
  async acquireLock(
    key: string,
    ttlSeconds: number,
    retries = 0,
    retryDelayMs = 200,
  ): Promise<string | null> {
    if (ttlSeconds <= 0) throw new Error('TTL must be positive')
    const token = randomUUID()
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await this.set(key, token, 'EX', ttlSeconds, 'NX')
        if (res === 'OK') return token
      } catch (err) {
        this.logger.error(
          `acquireLock set failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        )
      }
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, retryDelayMs))
      }
    }
    return null
  }

  /**
   * Safe release: удалим ключ только если токен совпадает (atomic via Lua).
   * Возвращает true если удалил, false иначе.
   */
  async releaseLock(key: string, token: string): Promise<boolean> {
    const releaseScript = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `
    try {
      const res = await this.eval(releaseScript, 1, key, token)
      return Number(res) > 0
    } catch (err) {
      this.logger.error(
        `releaseLock failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
      return false
    }
  }

  /**
   * Securely extend TTL if token matches.
   * Возвращает true если продлил, false — если ключ не соответствует токену или ошибка.
   */
  async extendLock(
    key: string,
    token: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    if (ttlSeconds <= 0) throw new Error('TTL must be positive')

    const extendScript = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("expire", KEYS[1], ARGV[2])
      else
        return 0
      end
    `
    try {
      const res = await this.eval(
        extendScript,
        1,
        key,
        token,
        String(ttlSeconds),
      )
      return Number(res) > 0
    } catch (err) {
      this.logger.error(
        `extendLock failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
      return false
    }
  }

  /**
   * Helper: run function under lock with optional auto-renew.
   * opts: { retries, retryDelayMs, autoRenewIntervalSec }.
   */
  async withLock<T>(
    key: string,
    ttlSeconds: number,
    fn: () => Promise<T>,
    opts?: {
      retries?: number
      retryDelayMs?: number
      autoRenewIntervalSec?: number
    },
  ): Promise<T | null> {
    const retries = opts?.retries ?? 0
    const retryDelayMs = opts?.retryDelayMs ?? 200
    const autoRenewIntervalSec =
      opts?.autoRenewIntervalSec ?? Math.floor(ttlSeconds / 3)

    const token = await this.acquireLock(key, ttlSeconds, retries, retryDelayMs)
    if (!token) {
      this.logger.log(`Could not acquire lock ${key}`)
      return null
    }

    this.logger.log(`Acquired lock ${key}`)

    let renewHandle: NodeJS.Timeout | null = null
    try {
      // автопродление, если задача долго running
      if (autoRenewIntervalSec > 0) {
        renewHandle = setInterval(async () => {
          try {
            const ok = await this.extendLock(key, token, ttlSeconds)
            if (!ok) {
              this.logger.warn(`Failed to renew lock ${key} (token mismatch)`)
            }
          } catch (err) {
            this.logger.error(
              `Error renewing lock ${key}: ${
                err instanceof Error ? err.message : String(err)
              }`,
            )
          }
        }, autoRenewIntervalSec * 1000)
      }

      const result = await fn()
      return result
    } finally {
      if (renewHandle) clearInterval(renewHandle)
      const released = await this.releaseLock(key, token)
      if (released) this.logger.log(`Released lock ${key}`)
      else
        this.logger.warn(
          `Lock ${key} was not released (maybe expired or token mismatch)`,
        )
    }
  }
}
