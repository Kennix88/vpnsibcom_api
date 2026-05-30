import { DefaultEnum } from '@core/prisma/generated/enums'
import { PrismaService } from '@core/prisma/prisma.service'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios from 'axios'
import { PinoLogger } from 'nestjs-pino'
import { InjectBot } from 'nestjs-telegraf'
import { Telegraf } from 'telegraf'

@Injectable()
export class GraspilService {
  private TOKEN: string
  constructor(
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
    private readonly prisma: PrismaService,
    @InjectBot() private readonly bot: Telegraf,
  ) {
    this.TOKEN = this.configService.get<string>('GRASPIL_TOKEN')
  }

  /** Отправка конверсии в аналитику Graspil
   * tgid - идентификатор пользователя телеграм
   * amountStars - количество звезд
   * targetId (необязательный) - id цели, по умолчанию 1 (Sale)
   **/
  public async sendEvent({
    tgid,
    amountStars,
    targetId = 1,
  }: {
    tgid: number
    amountStars: number
    targetId?: number
  }) {
    try {
      const settings = await this.prisma.settings.findFirst({
        where: {
          key: DefaultEnum.DEFAULT,
        },
      })
      const usd = Number((amountStars * settings.tgStarsToUSD).toFixed(2))
      await axios.post(
        `https://api.graspil.com/v1/send-target`,
        {
          target_id: Number(targetId),
          user_id: Number(tgid),
          // date: new Date().toISOString(),
          value: usd,
          unit: 'usd',
        },
        {
          headers: {
            'Api-Key': this.TOKEN,
          },
        },
      )
    } catch (error) {
      this.logger.error(error)
    }
  }
}
