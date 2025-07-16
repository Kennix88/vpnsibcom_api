import { RedisService } from '@core/redis/redis.service'
import { ThrottlerStorage } from '@nestjs/throttler'
import { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface'

export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(
    private readonly redis: RedisService,
    private readonly prefix = 'throttle:',
  ) {}

  private key(key: string): string {
    return `${this.prefix}${key}`
  }

  async getRecord(key: string): Promise<ThrottlerStorageRecord> {
    const value = await this.redis.get(this.key(key))
    return value
      ? JSON.parse(value)
      : {
          totalHits: 0,
          timeToExpire: 0,
          isBlocked: false,
          timeToBlockExpire: 0,
        }
  }

  async setRecord(key: string, record: ThrottlerStorageRecord): Promise<void> {
    const now = Date.now()
    const ttl = record.isBlocked
      ? Math.max(record.timeToBlockExpire - now, 0)
      : Math.max(record.timeToExpire - now, 0)

    if (ttl <= 0) return // защита от мусора

    await this.redis.set(this.key(key), JSON.stringify(record), 'PX', ttl)
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    _throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const now = Date.now()
    const record = await this.getRecord(key)

    // Блокировка всё ещё активна
    if (record.isBlocked && record.timeToBlockExpire > now) {
      return record
    }

    // Блокировка истекла
    if (record.isBlocked && record.timeToBlockExpire <= now) {
      record.isBlocked = false
      record.totalHits = 1
      record.timeToExpire = now + ttl
    } else {
      // TTL истёк — сброс счётчика
      if (record.timeToExpire <= now) {
        record.totalHits = 1
        record.timeToExpire = now + ttl
      } else {
        record.totalHits++
      }
    }

    // Превышен лимит — блокировка
    if (record.totalHits > limit) {
      record.isBlocked = true
      record.timeToBlockExpire = now + blockDuration
    }

    await this.setRecord(key, record)
    return record
  }
}
