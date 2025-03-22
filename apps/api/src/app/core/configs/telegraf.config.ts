import { ConfigService } from '@nestjs/config'
import { Redis } from '@telegraf/session/redis'
import type { TelegrafModuleOptions } from 'nestjs-telegraf'
import { session } from 'telegraf'

export function telegrafConfig(
	configService: ConfigService,
): TelegrafModuleOptions {
	return {
		token: configService.getOrThrow<string>('TELEGRAM_BOT_TOKEN'),
		middlewares: [
			session({
				store: Redis({
					url: configService.getOrThrow<string>('REDIS_URI'),
				}),
			}),
		],
	}
}
