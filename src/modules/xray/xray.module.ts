import { AuthModule } from '@core/auth/auth.module'
import { PaymentsModule } from '@modules/payments/payments.module'
import { UsersModule } from '@modules/users/users.module'
import { ServersController } from '@modules/xray/controllers/servers.controller'
import { XrayService } from '@modules/xray/services/xray.service'
import { forwardRef, Global, Module } from '@nestjs/common'
import { NewEraController } from './controllers/new-era.controller'
import { SubscriptionsController } from './controllers/subscriptions.controller'
import { MarzbanServiceProvider } from './providers/marzban.provider'
import { NewEraService } from './services/new-era.service'
import { ServersService } from './services/servers.service'
import { SubscriptionManagerService } from './services/subscription-manager.service'

@Global()
@Module({
  imports: [
    forwardRef(() => AuthModule),
    forwardRef(() => UsersModule),
    forwardRef(() => PaymentsModule),
  ],
  controllers: [ServersController, SubscriptionsController, NewEraController],
  providers: [
    XrayService,
    MarzbanServiceProvider,
    SubscriptionManagerService,
    ServersService,
    NewEraService,
  ],
  exports: [XrayService, MarzbanServiceProvider, ServersService, NewEraService],
})
export class XrayModule {}
