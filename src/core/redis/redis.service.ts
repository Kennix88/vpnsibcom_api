import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
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
}
