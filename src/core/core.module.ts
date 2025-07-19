import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_FILTER, APP_INTERCEPTOR, Reflector } from '@nestjs/core'
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

import { PreventDuplicateInterceptor } from './auth/guards/prevent-duplicate.guard'
import { CoreController } from './core.controller'

@Module({
  imports: [
    ScheduleModule.forRoot(),

    LoggerModule.forRootAsync(pinoConfig),

    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: process.env.NODE_ENV !== 'development',
    }),

    PrometheusModule.register(),

    ThrottlerModule.forRootAsync({
      useFactory: async (redisService: RedisService) => {
        try {
          // Проверка соединения с Redis, например ping
          await redisService.ping()
          return {
            throttlers: [{ ttl: 60 * 1000, limit: 100 }],
            storage: new RedisThrottlerStorage(redisService),
          }
        } catch (e) {
          // Логируем и возвращаем fallback, чтобы не блокировать
          console.error('Redis unavailable for throttler:', e)
          return {
            throttlers: [{ ttl: 60 * 1000, limit: 100 }],
          }
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
            path: join(__dirname, 'i18n/locales'),
            watch: process.env.NODE_ENV === 'development',
            includeSubfolders: true,
          },
          typesOutputPath: join(__dirname, 'i18n/i18n.type.ts'),
          generateTypes: true,
          errorHandler: (err) => logger.error('I18n error:', err),
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

    RedisModule,
    PrismaConnectModule,

    // Модули проекта
    TelegramModule,
    AuthModule,
    UsersModule,
    XrayModule,
    ReferralsModule,
    PaymentsModule,
    PlansModule,
    RatesModule,
  ],

  controllers: [CoreController],

  providers: [
    LogRotationService,
    LoggerTelegramService,
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useFactory: (
        redis: RedisService,
        reflector: Reflector,
        telegramLogger: LoggerTelegramService,
      ) => {
        return new PreventDuplicateInterceptor(redis, reflector, telegramLogger)
      },
      inject: [RedisService, Reflector, LoggerTelegramService],
    },
  ],
})
export class CoreModule {}
