import { AuthModule } from '@core/auth/auth.module'
import { UsersController } from '@modules/users/users.controller'
import { UsersService } from '@modules/users/users.service'
import { forwardRef, Global, Module } from '@nestjs/common'
import { TelegramPaymentsService } from '../payments/services/telegram-payments.service'

@Global()
@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [UsersController],
  providers: [UsersService, TelegramPaymentsService],
  exports: [UsersService, TelegramPaymentsService],
})
export class UsersModule {}
