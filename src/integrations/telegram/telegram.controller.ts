import { RedisService } from '@core/redis/redis.service'
import { Body, Controller, HttpCode, Post, Res } from '@nestjs/common'
import { FastifyReply } from 'fastify'
import { InjectBot } from 'nestjs-telegraf'
import { Telegraf } from 'telegraf'

@Controller('telegraf')
export class TelegramController {
  constructor(
    @InjectBot() private readonly bot: Telegraf,
    private readonly redis: RedisService,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Body() body: any,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    if (!body?.update_id) {
      res.status(400).send('invalid')
      return
    }

    const key = `tg:update:${body.update_id}`
    const ok = await this.redis.setWithExpiryNx(key, '1', 60)

    if (!ok) {
      res.send('ok')
      return
    }

    // async обработка
    setImmediate(() => {
      this.bot.handleUpdate(body).catch(() => {})
    })

    res.send('ok')
  }
}
