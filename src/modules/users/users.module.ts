import { UsersService } from '@modules/users/services/users.service'
import { Global, Module } from '@nestjs/common'

@Global()
@Module({
  imports: [],
  controllers: [],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
