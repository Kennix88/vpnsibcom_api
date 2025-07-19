import { telegrafConfig } from '@core/configs/telegraf.config'
import { LoggerTelegramService } from '@core/logger/logger-telegram.service'
import { StartUpdate } from '@integrations/telegram/start.update'
import { PaymentsUpdate } from '@integrations/telegram/updates/payments.update'
import { RatesModule } from '@modules/rates/rates.module'
import { ReferralsModule } from '@modules/referrals/referrals.module'
import { UsersModule } from '@modules/users/users.module'
import { Global, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { TelegrafModule } from 'nestjs-telegraf'

@Global()
@Module({
  imports: [
    TelegrafModule.forRootAsync({
      imports: [],
      useFactory: telegrafConfig,
      inject: [ConfigService],
    }),
    RatesModule,
    ReferralsModule,
    UsersModule,
  ],
  providers: [
    StartUpdate,
    LoggerTelegramService,
    PaymentsUpdate,
    LoggerTelegramService,
  ],
  exports: [LoggerTelegramService],
})
export class TelegramModule {}
