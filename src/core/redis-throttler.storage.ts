import { RedisService } from '@core/redis/redis.service'
import { ThrottlerStorage } from '@nestjs/throttler'
import { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface'

export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: RedisService) {}

  async getRecord(key: string): Promise<ThrottlerStorageRecord> {
    const record = await this.redis.get(`throttle:${key}`)
    return record
      ? JSON.parse(record)
      : {
          totalHits: 0,
          timeToExpire: 0,
          isBlocked: false,
          timeToBlockExpire: 0,
        }
  }

  async setRecord(key: string, record: ThrottlerStorageRecord): Promise<void> {
    await this.redis.set(
      `throttle:${key}`,
      JSON.stringify(record),
      'PX',
      record.timeToExpire,
    )
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const record = await this.getRecord(key)
    const now = Date.now()

    if (record.timeToExpire < now) {
      record.totalHits = 0
      record.timeToExpire = now + ttl
    }

    record.totalHits++

    await this.setRecord(key, record)
    return record
  }
}
