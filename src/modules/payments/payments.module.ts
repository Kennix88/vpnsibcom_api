import { AuthModule } from '@core/auth/auth.module'
import { TelegramModule } from '@integrations/telegram/telegram.module'
import { PaymentsController } from '@modules/payments/controllers/payments.controller'
import { PaymentsCronService } from '@modules/payments/services/payments-cron.service'
import { PaymentsService } from '@modules/payments/services/payments.service'
import { RatesModule } from '@modules/rates/rates.module'
import { ReferralsModule } from '@modules/referrals/referrals.module'
import { UsersModule } from '@modules/users/users.module'
import { XrayModule } from '@modules/xray/xray.module'
import { forwardRef, Global, Module } from '@nestjs/common'
import { AurapayController } from './controllers/aurapay.controller'
import { CryptoPayController } from './controllers/cryptobot.controller'
import { HeleketController } from './controllers/heleket.controller'
import { PlategaController } from './controllers/platega.controller'
import { XRocketPayController } from './controllers/xrocket-pay.controller'
import { AurapayService } from './services/aurapay.service'
import { CryptobotService } from './services/cryptobot.service'
import { HeleketService } from './services/heleket.service'
import { JettonWalletService } from './services/jetton-wallet.service'
import { PlategaService } from './services/platega.service'
import { TonJettonPaymentsService } from './services/ton-jetton-payments.service'
import { TonPaymentsService } from './services/ton-payments.service'
import { TonUtimeService } from './services/ton-uptime.service'
import { XRocketPayService } from './services/xrocket-pay.service'

@Global()
@Module({
  imports: [
    forwardRef(() => AuthModule),
    forwardRef(() => UsersModule),
    RatesModule,
    forwardRef(() => XrayModule),
    forwardRef(() => TelegramModule),
    forwardRef(() => ReferralsModule),
  ],
  controllers: [
    PaymentsController,
    AurapayController,
    CryptoPayController,
    HeleketController,
    XRocketPayController,
    PlategaController,
  ],
  providers: [
    PaymentsService,
    PaymentsCronService,
    TonPaymentsService,
    TonUtimeService,
    AurapayService,
    JettonWalletService,
    TonJettonPaymentsService,
    CryptobotService,
    HeleketService,
    XRocketPayService,
    PlategaService,
  ],
  exports: [
    PaymentsService,
    PaymentsCronService,
    TonPaymentsService,
    TonUtimeService,
  ],
})
export class PaymentsModule {}
