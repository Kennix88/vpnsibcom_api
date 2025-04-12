import { AuthModule } from '@core/auth/auth.module'
import { UsersController } from '@modules/users/users.controller'
import { UsersService } from '@modules/users/users.service'
import { Global, Module } from '@nestjs/common'

@Global()
@Module({
  imports: [AuthModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
