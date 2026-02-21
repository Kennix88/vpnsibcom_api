import { telegrafConfig } from '@core/configs/telegraf.config'
import { LoggerTelegramService } from '@core/logger/logger-telegram.service'
import { StartUpdate } from '@integrations/telegram/start.update'
import { TelegramController } from '@integrations/telegram/telegram.controller'
import { PaymentsUpdate } from '@integrations/telegram/updates/payments.update'
import { AdsModule } from '@modules/ads/ads.module'
import { RatesModule } from '@modules/rates/rates.module'
import { ReferralsModule } from '@modules/referrals/referrals.module'
import { UsersModule } from '@modules/users/users.module'
import {
  forwardRef,
  Global,
  Module,
  OnApplicationBootstrap,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectBot, TelegrafModule } from 'nestjs-telegraf'
import { Telegraf } from 'telegraf'

@Global()
@Module({
  imports: [
    TelegrafModule.forRootAsync({
      imports: [],
      useFactory: telegrafConfig,
      inject: [ConfigService],
    }),
    forwardRef(() => RatesModule),
    forwardRef(() => ReferralsModule),
    forwardRef(() => UsersModule),
    forwardRef(() => AdsModule),
  ],
  controllers: [TelegramController],
  providers: [
    StartUpdate,
    LoggerTelegramService,
    PaymentsUpdate,
    LoggerTelegramService,
  ],
  exports: [LoggerTelegramService],
})
export class TelegramModule {}
