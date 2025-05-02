import { AuthModule } from '@core/auth/auth.module'
import { UsersModule } from '@modules/users/users.module'
import { XrayController } from '@modules/xray/controllers/xray.controller'
import { XrayService } from '@modules/xray/services/xray.service'
import { Global, Module } from '@nestjs/common'
import { SubscriptionsController } from './controllers/subscriptions.controller'
import { MarzbanServiceProvider } from './providers/marzban.provider'

@Global()
@Module({
  imports: [AuthModule, UsersModule],
  controllers: [XrayController, SubscriptionsController],
  providers: [XrayService, MarzbanServiceProvider],
  exports: [XrayService, MarzbanServiceProvider],
})
export class XrayModule {}
