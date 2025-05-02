import { Provider } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { MarzbanService } from '../services/marzban.service'

export const MARZBAN_SERVICE = 'MARZBAN_SERVICE'

export const MarzbanServiceProvider: Provider = {
  provide: MarzbanService,
  useFactory: (configService: ConfigService) => {
    const baseURL = configService.get<string>('MARZBAN_API_URL')
    const username = configService.get<string>('MARZBAN_USERNAME')
    const password = configService.get<string>('MARZBAN_PASSWORD')
    return new MarzbanService(baseURL, username, password)
  },
  inject: [ConfigService],
}
