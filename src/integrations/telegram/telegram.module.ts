import { telegrafConfig } from '@core/configs/telegraf.config'
import { StartUpdate } from '@integrations/telegram/start.update'
import { RatesModule } from '@modules/rates/rates.module'
import { ReferralsModule } from '@modules/referrals/referrals.module'
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
  ],
  providers: [StartUpdate],
  exports: [],
})
export class TelegramModule {}
