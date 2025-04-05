import { AuthModule } from '@core/auth/auth.module'
import { pinoConfig } from '@core/configs/pino.config'
import { PrismaConnectModule } from '@core/prisma/prisma-connect.module'
import { RedisModule } from '@core/redis/redis.module'
import { TelegramModule } from '@integrations/telegram/telegram.module'
import { createKeyv } from '@keyv/redis'
import { RatesModule } from '@modules/rates/rates.module'
import { UsersModule } from '@modules/users/users.module'
import { CacheInterceptor, CacheModule } from '@nestjs/cache-manager'
import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { APP_INTERCEPTOR } from '@nestjs/core'
import { IS_DEV_ENV } from '@shared/utils/is-dev.util'
import { CacheableMemory } from 'cacheable'
import Keyv from 'keyv'
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
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: async (configService: ConfigService) => ({
        ttl: 60000,
        stores: [
          new Keyv({
            store: new CacheableMemory({ ttl: 60000, lruSize: 5000 }),
          }),
          createKeyv(configService.getOrThrow<string>('REDIS_URL')),
        ],
      }),
      inject: [ConfigService],
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
  ],
  controllers: [],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: CacheInterceptor,
    },
  ],
})
export class CoreModule {}
