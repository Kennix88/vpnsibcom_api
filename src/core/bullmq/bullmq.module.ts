import { Global, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Queue } from 'bullmq'

export const TELEGRAM_QUEUE = 'TELEGRAM_QUEUE'

@Global()
@Module({
  providers: [
    {
      provide: TELEGRAM_QUEUE,
      useFactory: (config: ConfigService) => {
        return new Queue('telegram-logs', {
          connection: {
            host: config.get('REDIS_HOST'),
            port: Number(config.get('REDIS_PORT')),
            password: config.get('REDIS_PASSWORD') || undefined,
          },
          defaultJobOptions: {
            attempts: 5,
            backoff: {
              type: 'exponential',
              delay: 500,
            },
            removeOnComplete: {
              age: 24 * 3600,
            },
            removeOnFail: {
              age: 7 * 24 * 3600,
            },
          },
        })
      },
      inject: [ConfigService],
    },
  ],
  exports: [TELEGRAM_QUEUE],
})
export class BullmqModule {}
