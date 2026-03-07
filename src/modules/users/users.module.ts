import { AuthModule } from '@core/auth/auth.module'
import { AdsModule } from '@modules/ads/ads.module'
import { GeoModule } from '@modules/geo/geo.module'
import { UsersService } from '@modules/users/services/users.service'
import { UsersController } from '@modules/users/users.controller'
import { forwardRef, Global, Module } from '@nestjs/common'
import { TelegramPaymentsService } from '../payments/services/telegram-payments.service'
import { AcquisitionsService } from './services/acquisitions.service'
import { EventsService } from './services/events.service'
import { SessionsService } from './services/sessions.service'

@Global()
@Module({
  imports: [
    forwardRef(() => AuthModule),
    forwardRef(() => AdsModule),
    forwardRef(() => GeoModule),
  ],
  controllers: [UsersController],
  providers: [
    UsersService,
    TelegramPaymentsService,
    EventsService,
    SessionsService,
    AcquisitionsService,
  ],
  exports: [
    UsersService,
    TelegramPaymentsService,
    EventsService,
    SessionsService,
    AcquisitionsService,
  ],
})
export class UsersModule {}
