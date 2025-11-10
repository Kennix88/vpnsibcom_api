import { TelegramModule } from '@integrations/telegram/telegram.module'
import { UsersModule } from '@modules/users/users.module'
import { forwardRef, Global, Module } from '@nestjs/common'
import { AdsController } from './ads.controller'

@Global()
@Module({
  imports: [UsersModule, forwardRef(() => TelegramModule)],
  controllers: [AdsController],
  providers: [],
  exports: [],
})
export class AdsModule {}
