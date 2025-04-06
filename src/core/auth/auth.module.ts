import { AuthController } from '@core/auth/auth.controller'
import { AuthService } from '@core/auth/auth.service'
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard'
import { TelegramAuthGuard } from '@core/auth/guards/telegram-auth.guard'
import { TokenService } from '@core/auth/token.service'
import { Global, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow('JWT_ACCESS_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokenService, TelegramAuthGuard, JwtAuthGuard],
  exports: [AuthService, TokenService, TelegramAuthGuard, JwtAuthGuard],
})
export class AuthModule {}
