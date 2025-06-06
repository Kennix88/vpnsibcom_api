import { AuthModule } from '@core/auth/auth.module'
import { UsersModule } from '@modules/users/users.module'
import { ServersController } from '@modules/xray/controllers/xray.controller'
import { XrayService } from '@modules/xray/services/xray.service'
import { Global, Module } from '@nestjs/common'
import { SubscriptionsController } from './controllers/subscriptions.controller'
import { MarzbanServiceProvider } from './providers/marzban.provider'
import { ServersService } from './services/servers.service'
import { SubscriptionManagerService } from './services/subscription-manager.service'

@Global()
@Module({
  imports: [AuthModule, UsersModule],
  controllers: [ServersController, SubscriptionsController],
  providers: [
    XrayService,
    MarzbanServiceProvider,
    SubscriptionManagerService,
    ServersService,
  ],
  exports: [XrayService, MarzbanServiceProvider, ServersService],
})
export class XrayModule {}
