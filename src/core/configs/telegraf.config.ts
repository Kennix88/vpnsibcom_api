import { ConfigService } from '@nestjs/config'
import { Redis } from '@telegraf/session/redis'
import type { TelegrafModuleOptions } from 'nestjs-telegraf'
import { session } from 'telegraf'

export function telegrafConfig(
  configService: ConfigService,
): TelegrafModuleOptions {
  const redisUrl = configService.getOrThrow<string>('REDIS_URL')

  return {
    token: configService.getOrThrow<string>('TELEGRAM_BOT_TOKEN'),

    options: {
      telegram: {
        apiRoot: configService.getOrThrow<string>('GRASPIL_PROXY_URL'),
      },
    },

    launchOptions: {
      // dropPendingUpdates: true,

      allowedUpdates: ['message', 'callback_query', 'pre_checkout_query'],

      // webhook: {
      //   domain: configService.getOrThrow<string>('APPLICATION_URL'),
      //   hookPath: '/telegraf/webhook',
      //   maxConnections: 10,
      // },
    },

    middlewares: [
      session({
        store: Redis({
          url: redisUrl,
        }),
      }),

      async (ctx, next) => {
        if (!ctx.from) {
          return
        }

        if (ctx.from.is_bot) {
          console.warn({
            msg: 'Bot update received',
            updateType: ctx.updateType,
            update: ctx.update,
          })

          return
        }

        await next()
      },
    ],
  }
}
