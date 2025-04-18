import { AuthModule } from '@core/auth/auth.module'
import { ReferralsController } from '@modules/referrals/referrals.controller'
import { ReferralsService } from '@modules/referrals/referrals.service'
import { UsersModule } from '@modules/users/users.module'
import { Global, Module } from '@nestjs/common'

@Global()
@Module({
  imports: [AuthModule, UsersModule],
  controllers: [ReferralsController],
  providers: [ReferralsService],
  exports: [ReferralsService],
})
export class ReferralsModule {}
