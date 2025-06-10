import { AuthModule } from '@core/auth/auth.module'
import { Global, Module } from '@nestjs/common'

@Global()
@Module({
  imports: [AuthModule],
  controllers: [],
  providers: [],
  exports: [],
})
export class PlansModule {}
