import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_FILTER } from '@nestjs/core'
import { ScheduleModule } from '@nestjs/schedule'
import { join } from 'path'

import { ThrottlerModule } from '@nestjs/throttler'
import { PrometheusModule } from '@willsoto/nestjs-prometheus'
import {
  AcceptLanguageResolver,
  HeaderResolver,
  I18nJsonLoader,
  I18nModule,
  QueryResolver,
} from 'nestjs-i18n'
import { Logger, LoggerModule } from 'nestjs-pino'

import { AuthModule } from '@core/auth/auth.module'
import { pinoConfig } from '@core/configs/pino.config'
import { GlobalExceptionFilter } from '@core/filters/global-exception.filter'
import { LogRotationService } from '@core/logger/log-rotation.service'
import { LoggerTelegramService } from '@core/logger/logger-telegram.service'
import { PrismaConnectModule } from '@core/prisma/prisma-connect.module'
import { RedisThrottlerStorage } from '@core/redis-throttler.storage'
import { RedisModule } from '@core/redis/redis.module'
import { RedisService } from '@core/redis/redis.service'
import { TelegramModule } from '@integrations/telegram/telegram.module'

import { PaymentsModule } from '@modules/payments/payments.module'
import { PlansModule } from '@modules/plans/plans.module'
import { RatesModule } from '@modules/rates/rates.module'
import { ReferralsModule } from '@modules/referrals/referrals.module'
import { UsersModule } from '@modules/users/users.module'
import { XrayModule } from '@modules/xray/xray.module'

import { AdsModule } from '@modules/ads/ads.module'
import { GeoModule } from '@modules/geo/geo.module'
import { PreventDuplicateInterceptor } from './auth/guards/prevent-duplicate.interceptor'
import { BullmqModule } from './bullmq/bullmq.module'
import { CoreController } from './core.controller'
import { TelegramLogWorker } from './logger/telegram-log.worker'

@Module({
  imports: [
    ScheduleModule.forRoot(),

    LoggerModule.forRootAsync(pinoConfig),

    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: false,
      // Load .env only in development; in production variables come from the environment
      // ignoreEnvFile: process.env.NODE_ENV !== 'development',
    }),

    PrometheusModule.register(),

    ThrottlerModule.forRootAsync({
      useFactory: async (redisService: RedisService) => {
        const throttlers = [{ ttl: 60 * 1000, limit: 100 }]
        try {
          await redisService.waitTillReady()
          return {
            throttlers,
            storage: new RedisThrottlerStorage(redisService),
          }
        } catch (e) {
          // Redis is unavailable — falling back to in-memory storage.
          // NOTE: in-memory throttling is per-instance and does NOT work
          // correctly with multiple replicas. Investigate Redis connectivity.
          console.error(
            '[ThrottlerModule] Redis unavailable, falling back to in-memory throttling:',
            e,
          )
          return { throttlers }
        }
      },
      inject: [RedisService],
    }),

    I18nModule.forRootAsync({
      useFactory: (logger: Logger) => {
        logger.log('Initializing i18n...', 'I18nModule')
        return {
          fallbackLanguage: 'en',
          disableMiddleware: true,
          loaderOptions: {
            path: join(process.cwd(), 'src/core/i18n/locales'),
            watch: process.env.NODE_ENV === 'development',
            includeSubfolders: true,
          },
          typesOutputPath: join(process.cwd(), 'src/core/i18n/i18n.type.ts'),
          generateTypes: true,
          // pino convention: logger.error(object|error, message)
          errorHandler: (err) => logger.error(err, 'I18n error'),
        }
      },
      inject: [Logger],
      resolvers: [
        { use: QueryResolver, options: ['lang'] },
        AcceptLanguageResolver,
        new HeaderResolver(['x-lang']),
      ],
      loader: I18nJsonLoader,
    }),

    TelegramModule,
    RedisModule,
    PrismaConnectModule,

    AuthModule,
    UsersModule,
    XrayModule,
    ReferralsModule,
    PaymentsModule,
    PlansModule,
    RatesModule,
    AdsModule,
    BullmqModule,
    GeoModule,
  ],
  controllers: [CoreController],
  providers: [
    TelegramLogWorker,
    LogRotationService,

    // Explicit provider so that GlobalExceptionFilter and
    // PreventDuplicateInterceptor can resolve it via DI.
    // Remove this line only if BullmqModule already exports LoggerTelegramService.
    LoggerTelegramService,

    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },

    // @Injectable() + all deps in scope → plain class provider is sufficient.
    // No need to duplicate the constructor signature in a useFactory.
    PreventDuplicateInterceptor,
  ],
  exports: [LogRotationService, PreventDuplicateInterceptor],
})
export class CoreModule {}
