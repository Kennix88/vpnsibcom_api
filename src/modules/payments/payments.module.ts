import { AuthModule } from '@core/auth/auth.module'
import { PaymentsController } from '@modules/payments/payments.controller'
import { PaymentMethodsService } from '@modules/payments/services/payment-methods.service'
import { UsersModule } from '@modules/users/users.module'
import { Global, Module } from '@nestjs/common'

@Global()
@Module({
  imports: [AuthModule, UsersModule],
  controllers: [PaymentsController],
  providers: [PaymentMethodsService],
  exports: [PaymentMethodsService],
})
export class PaymentsModule {}
