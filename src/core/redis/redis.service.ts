import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { randomUUID } from 'crypto'
import Redis from 'ioredis'

@Injectable()
export class RedisService extends Redis implements OnModuleInit {
  private readonly logger = new Logger(RedisService.name)

  constructor(private readonly configService: ConfigService) {
    super({
      host: configService.get('REDIS_HOST'),
      port: configService.get('REDIS_PORT'),
      password: configService.get('REDIS_PASSWORD'),

      enableOfflineQueue: true, // пусть очередь команд хранится при реконнекте
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      autoResubscribe: true,

      // socket options (через Node.js net.Socket)

      keepAlive: 10000, // каждые 10s будет TCP keep-alive (по умолчанию 0 = выкл)
      connectTimeout: 10000, // таймаут установки соединения

      // retry strategy (на случай обрыва соединения)
      retryStrategy: (times) => {
        // times = сколько раз пытались подключиться
        const delay = Math.min(times * 500, 10000) // от 500ms до 10s
        return delay
      },

      // если хочешь ещё более жёсткий контроль над реконнектом
      reconnectOnError: (err) => {
        // например, переподключаемся только на сетевые ошибки
        if (err.message.includes('READONLY')) {
          return false // не пытаться реконнектиться при failover sentinel
        }
        return true
      },
    })

    this.on('connect', () => this.logger.log('Redis connecting...'))
    this.on('ready', () => this.logger.log('Redis connection is ready.'))
    this.on('error', (err) => {
      this.logger.error('Redis error event: ' + (err?.message ?? err))
      // если это критическая ошибка сокета — попытаться корректно закрыть/переподключить
      try {
        // безопасная попытка восстановления: закроем клиент и созвонемся заново
        // но т.к. мы наследуем Redis, аккуратно: не делаем force quit, пусть клиент сам восстановится
      } catch (e) {
        this.logger.error('Error while handling redis error: ' + e?.message)
      }
    })

    // также подпишемся на непойманные ошибки сокета (на всякий случай)
    this.on('end', () =>
      this.logger.warn('Redis connection ended. Will try to reconnect...'),
    )
    this.on('close', () => this.logger.warn('Redis connection closed.'))
    this.on('reconnecting', (delay) =>
      this.logger.log(`Redis reconnecting in ${delay}ms...`),
    )
  }

  /**
   * Wait until Redis connection is established (even after reconnects).
   */
  private async waitForConnection(): Promise<void> {
    if (this.status === 'ready') return
    await new Promise<void>((resolve, reject) => {
      this.once('ready', () => resolve())
      this.once('error', (err) => reject(err))
    })
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.waitForConnection()
    } catch (error) {
      this.logger.error(`Failed to connect to Redis: ${error.message}`)
      // Optionally re-throw or handle the error as appropriate for your application's needs
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
      this.logger.error(`setWithExpiry failed: ${err.message}`)
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
      this.logger.error(`setObjectWithExpiry failed: ${err.message}`)
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
      this.logger.error(`setWithExpiryNx failed: ${err.message}`)
      return false
    }
  }

  async getObject<T>(key: string): Promise<T | null> {
    try {
      const data = await this.get(key)
      return data ? JSON.parse(data) : null
    } catch (err) {
      this.logger.warn(`Failed to parse JSON for key ${key}: ${err.message}`)
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
      this.logger.error(`hsetWithExpiry failed: ${err.message}`)
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
        this.logger.error(`acquireLock set failed: ${err.message}`)
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
      this.logger.error(`releaseLock failed: ${err.message}`)
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
      this.logger.error(`extendLock failed: ${err.message}`)
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
      // автопродление, если задача долг running
      if (autoRenewIntervalSec > 0) {
        renewHandle = setInterval(async () => {
          try {
            const ok = await this.extendLock(key, token, ttlSeconds)
            if (!ok) {
              this.logger.warn(`Failed to renew lock ${key} (token mismatch)`)
            }
          } catch (err) {
            this.logger.error(`Error renewing lock ${key}: ${err.message}`)
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
