import { TelegramModule } from '@integrations/telegram/telegram.module'
import { UsersModule } from '@modules/users/users.module'
import { forwardRef, Global, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { AdsController } from './ads.controller'
import { AdsService } from './ads.service'
import { RichAdsService } from './richads.service'
import { AdsgramService } from './services/adsgram.service'
import { GraspilService } from './services/graspil.service'
import { YandexAdsService } from './services/yandex-ads.service'
import { TaddyService } from './taddy.service'

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('ADS_SESSION_SECRET'),
        signOptions: {},
      }),
    }),
    forwardRef(() => UsersModule),
    forwardRef(() => TelegramModule),
  ],
  controllers: [AdsController],
  providers: [
    AdsService,
    TaddyService,
    AdsgramService,
    GraspilService,
    YandexAdsService,
    RichAdsService,
  ],
  exports: [
    AdsService,
    TaddyService,
    AdsgramService,
    GraspilService,
    YandexAdsService,
    RichAdsService,
  ],
})
export class AdsModule {}
