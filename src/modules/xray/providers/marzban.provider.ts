import { Provider } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PinoLogger } from 'nestjs-pino'
import { MarzbanService } from '../services/marzban.service'

export const MARZBAN_SERVICE = 'MARZBAN_SERVICE'

export const MarzbanServiceProvider: Provider = {
  provide: MarzbanService,
  useFactory: (configService: ConfigService, logger: PinoLogger) => {
    const baseURL = configService.getOrThrow<string>('XRAY_MARZBAN_URL')
    const username = configService.getOrThrow<string>('XRAY_MARZBAN_LOGIN')
    const password = configService.getOrThrow<string>('XRAY_MARZBAN_PASSWORD')
    return new MarzbanService(baseURL, username, password, logger)
  },
  inject: [ConfigService, PinoLogger],
}
