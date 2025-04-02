import { pinoConfig } from '@core/configs/pino.config'
import { PrismaConnectModule } from '@core/prisma/prisma-connect.module'
import { RedisModule } from '@core/redis/redis.module'
import { TelegramModule } from '@integrations/telegram/telegram.module'
import { RatesModule } from '@modules/rates/rates.module'
import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
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
  ],
  controllers: [],
  providers: [],
})
export class CoreModule {}
