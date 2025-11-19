import { TelegramModule } from '@integrations/telegram/telegram.module'
import { UsersModule } from '@modules/users/users.module'
import { forwardRef, Global, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { AdsController } from './ads.controller'
import { AdsService } from './ads.service'

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('ADS_SESSION_SECRET'),
        signOptions: {},
      }),
    }),
    UsersModule,
    forwardRef(() => TelegramModule),
  ],
  controllers: [AdsController],
  providers: [AdsService],
  exports: [AdsService],
})
export class AdsModule {}
