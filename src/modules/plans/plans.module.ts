import { AuthModule } from '@core/auth/auth.module'
import { forwardRef, Global, Module } from '@nestjs/common'
import { PlansController } from './plans.controller'
import { PlansService } from './plans.service'

@Global()
@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [PlansController],
  providers: [PlansService],
  exports: [PlansService],
})
export class PlansModule {}
