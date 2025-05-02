import { Provider } from '@nestjs/common'
import { MarzbanService } from '../services/marzban.service'

export const MARZBAN_SERVICE = 'MARZBAN_SERVICE'

export const MarzbanServiceProvider: Provider = {
  provide: MARZBAN_SERVICE,
  useFactory: () => {
    const baseURL = process.env.MARZBAN_API_URL || 'http://localhost:8000'
    const username = process.env.MARZBAN_ADMIN_USERNAME || 'admin'
    const password = process.env.MARZBAN_ADMIN_PASSWORD || 'admin'

    return new MarzbanService(baseURL, username, password)
  },
}
