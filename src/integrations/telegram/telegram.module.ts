import { telegrafConfig } from '@core/configs/telegraf.config'
import { LoggerTelegramService } from '@core/logger/logger-telegram.service'
import { StartUpdate } from '@integrations/telegram/start.update'
import { TelegramController } from '@integrations/telegram/telegram.controller'
import { ChatMemberUpdate } from '@integrations/telegram/updates/chat-member.update'
import { PaymentsUpdate } from '@integrations/telegram/updates/payments.update'
import { AdsModule } from '@modules/ads/ads.module'
import { GeoModule } from '@modules/geo/geo.module'
import { RatesModule } from '@modules/rates/rates.module'
import { ReferralsModule } from '@modules/referrals/referrals.module'
import { UsersModule } from '@modules/users/users.module'
import { forwardRef, Global, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { TelegrafModule } from 'nestjs-telegraf'
import { AdsSenderService } from './services/ads-sender.service'
import { CheckUsersService } from './services/check-users.service'
import { ImportUsersService } from './services/import-users.service'

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
    forwardRef(() => GeoModule),
  ],
  controllers: [TelegramController],
  providers: [
    StartUpdate,
    ChatMemberUpdate,
    LoggerTelegramService,
    PaymentsUpdate,
    LoggerTelegramService,
    CheckUsersService,
    AdsSenderService,
    ImportUsersService,
  ],
  exports: [LoggerTelegramService],
})
export class TelegramModule {}
