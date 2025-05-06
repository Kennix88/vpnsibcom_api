import { Injectable, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Redis from 'ioredis'

@Injectable()
export class RedisService extends Redis implements OnModuleInit {
  constructor(private readonly configService: ConfigService) {
    super(configService.getOrThrow<string>('REDIS_URL'))

    this.on('error', (err) => {
      console.error('Redis error:', err)
    })
  }

  async onModuleInit() {
    try {
      await this.ping()
      console.log('Redis connected successfully')
    } catch (err) {
      console.error('Redis connection failed:', err)
    }
  }

  /**
   * Установка значения с временем жизни
   * @param key - Ключ
   * @param value - Значение
   * @param ttlSeconds - Время жизни в секундах
   */
  async setWithExpiry(key: string, value: string, ttlSeconds: number): Promise<string> {
    return await this.set(key, value, 'EX', ttlSeconds);
  }
}
