import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Redis from 'ioredis'

@Injectable()
export class RedisService extends Redis implements OnModuleInit {
  private readonly logger = new Logger(RedisService.name)
  private readonly MAX_RETRIES = 5
  private readonly RETRY_DELAY = 2000

  constructor(private readonly configService: ConfigService) {
    super({
      host: configService.get('REDIS_HOST'),
      port: configService.get('REDIS_PORT'),
      password: configService.get('REDIS_PASSWORD'),
      // keyPrefix: configService.get('REDIS_PREFIX'),
      enableOfflineQueue: false,
      maxRetriesPerRequest: null,
      retryStrategy: (times) => {
        if (times > 3) return null
        return Math.min(times * 500, 2000)
      },
    })

    this.on('error', (err) => {
      this.logger.error(`Redis error: ${err.message}`)
    })
  }

  async onModuleInit() {
    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        await this.ping()
        this.logger.log('Redis connected successfully')
        return
      } catch (err) {
        this.logger.error(
          `Connection attempt ${attempt} failed: ${err.message}`,
        )
        if (attempt === this.MAX_RETRIES) {
          throw new Error('Redis connection failed after max retries')
        }
        await new Promise((r) => setTimeout(r, this.RETRY_DELAY))
      }
    }
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
