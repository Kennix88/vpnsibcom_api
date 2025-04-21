import { AuthModule } from '@core/auth/auth.module'
import { pinoConfig } from '@core/configs/pino.config'
import { PrismaConnectModule } from '@core/prisma/prisma-connect.module'
import { RedisThrottlerStorage } from '@core/redis-throttler.storage'
import { RedisModule } from '@core/redis/redis.module'
import { RedisService } from '@core/redis/redis.service'
import { TelegramModule } from '@integrations/telegram/telegram.module'
import { PaymentsModule } from '@modules/payments/payments.module'
import { RatesModule } from '@modules/rates/rates.module'
import { ReferralsModule } from '@modules/referrals/referrals.module'
import { UsersModule } from '@modules/users/users.module'
import { XrayModule } from '@modules/xray/xray.module'
import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { ThrottlerModule } from '@nestjs/throttler'
import { IS_DEV_ENV } from '@shared/utils/is-dev.util'
import {
  AcceptLanguageResolver,
  HeaderResolver,
  I18nJsonLoader,
  I18nModule,
  QueryResolver,
} from 'nestjs-i18n'
import { LoggerModule } from 'nestjs-pino'

@Module({
  imports: [
    LoggerModule.forRootAsync({
      imports: [],
      useFactory: pinoConfig,
      inject: [ConfigService],
    }),
    ConfigModule.forRoot({
      ignoreEnvFile: !IS_DEV_ENV,
      isGlobal: true,
    }),
    // CacheModule.registerAsync({
    //   isGlobal: true,
    //   useFactory: async (configService: ConfigService) => ({
    //     ttl: 7 * 24 * 60 * 60 * 1000,
    //     stores: [
    //       new Keyv({
    //         store: new CacheableMemory({ ttl: 60000, lruSize: 5000 }),
    //       }),
    //       createKeyv(configService.getOrThrow<string>('REDIS_URL')),
    //     ],
    //   }),
    //   inject: [ConfigService],
    // }),
    ThrottlerModule.forRootAsync({
      useFactory: (redis: RedisService) => ({
        throttlers: [
          {
            ttl: 60_000,
            limit: 100,
          },
        ],
        storage: new RedisThrottlerStorage(redis),
      }),
      inject: [RedisService],
    }),
    I18nModule.forRootAsync({
      useFactory: () => ({
        disableMiddleware: true,
        fallbackLanguage: 'en',
        loaderOptions: {
          path: 'src/core/i18n/locales',
          watch: true,
          includeSubfolders: true,
        },
        typesOutputPath: 'src/core/i18n/i18n.type.ts',
      }),
      resolvers: [
        { use: QueryResolver, options: ['lang'] },
        AcceptLanguageResolver,
        new HeaderResolver(['x-lang']),
      ],
      loader: I18nJsonLoader,
    }),
    RedisModule,
    PrismaConnectModule,
    TelegramModule,
    RatesModule,
    AuthModule,
    UsersModule,
    XrayModule,
    ReferralsModule,
    PaymentsModule,
  ],
  controllers: [],
  providers: [],
})
export class CoreModule {}
