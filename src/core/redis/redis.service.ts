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
}
