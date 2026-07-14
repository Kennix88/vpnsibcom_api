import { AuthModule } from '@core/auth/auth.module'
import { PaymentsModule } from '@modules/payments/payments.module'
import { UsersModule } from '@modules/users/users.module'
import { ServersController } from '@modules/xray/controllers/servers.controller'
import { forwardRef, Global, Module } from '@nestjs/common'
import { NewEraController } from './controllers/new-era.controller'
import { RemnaService } from './remna/remna.service'
import { NewEraService } from './services/new-era.service'
import { ServersService } from './services/servers.service'

@Global()
@Module({
  imports: [
    forwardRef(() => AuthModule),
    forwardRef(() => UsersModule),
    forwardRef(() => PaymentsModule),
  ],
  controllers: [ServersController, NewEraController],
  providers: [ServersService, NewEraService, RemnaService],
  exports: [ServersService, NewEraService, RemnaService],
})
export class XrayModule {}
