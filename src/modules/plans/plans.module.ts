import { AuthModule } from '@core/auth/auth.module'
import { Global, Module } from '@nestjs/common'
import { PlansController } from './plans.controller'
import { PlansService } from './plans.service'

@Global()
@Module({
  imports: [AuthModule],
  controllers: [PlansController],
  providers: [PlansService],
  exports: [PlansService],
})
export class PlansModule {}
