import { AuthModule } from '@core/auth/auth.module'
import { TelegramModule } from '@integrations/telegram/telegram.module'
import { PaymentsController } from '@modules/payments/payments.controller'
import { PaymentsCronService } from '@modules/payments/services/payments-cron.service'
import { PaymentsService } from '@modules/payments/services/payments.service'
import { RatesModule } from '@modules/rates/rates.module'
import { UsersModule } from '@modules/users/users.module'
import { XrayModule } from '@modules/xray/xray.module'
import { forwardRef, Global, Module } from '@nestjs/common'
import { TonPaymentsService } from './services/ton-payments.service'
import { TonUtimeService } from './services/ton-uptime.service'

@Global()
@Module({
  imports: [
    AuthModule,
    UsersModule,
    RatesModule,
    forwardRef(() => XrayModule),
    forwardRef(() => TelegramModule),
  ],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PaymentsCronService,
    TonPaymentsService,
    TonUtimeService,
  ],
  exports: [
    PaymentsService,
    PaymentsCronService,
    TonPaymentsService,
    TonUtimeService,
  ],
})
export class PaymentsModule {}
