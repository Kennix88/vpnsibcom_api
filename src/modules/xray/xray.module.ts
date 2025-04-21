import { AuthModule } from '@core/auth/auth.module'
import { UsersModule } from '@modules/users/users.module'
import { XrayController } from '@modules/xray/xray.controller'
import { XrayService } from '@modules/xray/xray.service'
import { Global, Module } from '@nestjs/common'

@Global()
@Module({
  imports: [AuthModule, UsersModule],
  controllers: [XrayController],
  providers: [XrayService],
  exports: [XrayService],
})
export class XrayModule {}
