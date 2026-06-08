import { RedisService } from '@core/redis/redis.service'
import { Injectable } from '@nestjs/common'
import { ThrottlerStorage } from '@nestjs/throttler'
import { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface'

@Injectable()
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
    if (ttl <= 0) return
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

    // Block still active
    if (record.isBlocked && record.timeToBlockExpire > now) {
      return record
    }

    // Block expired — reset
    if (record.isBlocked && record.timeToBlockExpire <= now) {
      record.isBlocked = false
      record.totalHits = 1
      record.timeToExpire = now + ttl
    } else {
      // Window expired — reset counter
      if (record.timeToExpire <= now) {
        record.totalHits = 1
        record.timeToExpire = now + ttl
      } else {
        record.totalHits++
      }
    }

    // Exceeded limit — block
    if (record.totalHits > limit) {
      record.isBlocked = true
      record.timeToBlockExpire = now + blockDuration
    }

    await this.setRecord(key, record)
    return record
  }
}
