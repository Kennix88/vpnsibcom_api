import { AuthModule } from '@core/auth/auth.module'
import { PaymentsController } from '@modules/payments/payments.controller'
import { PaymentsService } from '@modules/payments/services/payments.service'
import { PaymentsCronService } from '@modules/payments/services/payments-cron.service'
import { RatesModule } from '@modules/rates/rates.module'
import { UsersModule } from '@modules/users/users.module'
import { Global, Module } from '@nestjs/common'

@Global()
@Module({
  imports: [AuthModule, UsersModule, RatesModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentsCronService],
  exports: [PaymentsService, PaymentsCronService],
})
export class PaymentsModule {}
