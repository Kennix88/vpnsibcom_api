import { ConfigService } from '@nestjs/config'
import { Redis } from '@telegraf/session/redis' // импорт по умолчанию
import type { TelegrafModuleOptions } from 'nestjs-telegraf'
import { session } from 'telegraf'

export function telegrafConfig(
  configService: ConfigService,
): TelegrafModuleOptions {
  const redisUrl = configService.getOrThrow<string>('REDIS_URL')

  return {
    token: configService.getOrThrow<string>('TELEGRAM_BOT_TOKEN'),
    middlewares: [
      session({
        store: Redis({
          url: redisUrl,
        }),
      }),
    ],
  }
}
