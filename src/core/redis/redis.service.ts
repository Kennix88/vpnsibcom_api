import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Redis from 'ioredis'

@Injectable()
export class RedisService extends Redis implements OnModuleInit {
  private readonly logger = new Logger(RedisService.name)

  constructor(private readonly configService: ConfigService) {
    super(configService.getOrThrow<string>('REDIS_URL'))

    this.on('error', (err) => {
      this.logger.error('Redis error:', err)
    })
  }

  async onModuleInit() {
    const maxRetries = 5
    let attempt = 0
    while (attempt < maxRetries) {
      try {
        await this.ping()
        this.logger.log('Redis connected successfully')
        return
      } catch (err) {
        attempt++
        this.logger.error(`Redis connection failed (attempt ${attempt}):`, err)
        await new Promise((res) => setTimeout(res, 2000))
      }
    }
    this.logger.error('Redis failed to connect after max retries')
  }

  /**
   * Установка значения с временем жизни (TTL в секундах)
   */
  async setWithExpiry(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    if (ttlSeconds <= 0) {
      throw new Error('TTL must be positive')
    }
    const result = await this.set(key, value, 'EX', ttlSeconds)
    return result === 'OK'
  }

  /**
   * Установка объекта с сериализацией и TTL
   */
  async setObjectWithExpiry<T>(
    key: string,
    value: T,
    ttlSeconds: number,
  ): Promise<boolean> {
    const str = JSON.stringify(value)
    return this.setWithExpiry(key, str, ttlSeconds)
  }

  /**
   * Установка значения с NX и TTL, возвращает true если установлен
   */
  async setWithExpiryNx(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    const result = await this.set(key, value, 'EX', ttlSeconds, 'NX')
    return result === 'OK'
  }

  /**
   * Получение объекта с десериализацией
   */
  async getObject<T>(key: string): Promise<T | null> {
    const data = await this.get(key)
    if (!data) return null
    try {
      return JSON.parse(data) as T
    } catch (err) {
      this.logger.warn(`Failed to parse JSON from Redis key "${key}"`)
      return null
    }
  }
}
