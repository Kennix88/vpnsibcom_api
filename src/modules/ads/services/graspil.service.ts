import { DefaultEnum } from '@core/prisma/generated/enums'
import { PrismaService } from '@core/prisma/prisma.service'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios from 'axios'
import { PinoLogger } from 'nestjs-pino'

export interface GraspilUser {
  user_id: number
  is_bot: boolean | null
  first_name: string | null
  last_name: string | null
  username: string | null
  language_code: string | null
  is_premium: number | null
  gender: number | null
  user_status: number | null
  country: string | null
  geo?: {
    countryCode?: string | null
  }
  verified: boolean | null
  scam: boolean | null
  fake: boolean | null
  stargifts_count: number | null
  personal_channel_id: number | string | null
  birth_day: number | null
  birth_month: number | null
  birth_year: number | null
}

interface GraspilGetUsersResponse {
  ok: boolean
  data?: {
    count: number
    rows: GraspilUser[]
  }
  error?: unknown
  error_code?: number
  description?: string
}

@Injectable()
export class GraspilService {
  private TOKEN: string
  constructor(
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
    private readonly prisma: PrismaService,
  ) {
    this.TOKEN = this.configService.get<string>('GRASPIL_TOKEN')
  }

  public async getUsers({
    limit = 500,
    offset = 0,
  }: {
    limit?: number
    offset?: number
  }) {
    if (!this.TOKEN) {
      throw new Error('GRASPIL_TOKEN is not defined')
    }

    const { data } = await axios.get<GraspilGetUsersResponse>(
      'https://api.graspil.com/v1/get-users',
      {
        params: {
          limit,
          offset,
        },
        headers: {
          'Api-Key': this.TOKEN,
        },
      },
    )

    if (!data.ok) {
      throw new Error(
        `Graspil get-users failed: ${data.error_code ?? 'unknown'} ${
          data.description ?? JSON.stringify(data.error ?? {})
        }`,
      )
    }

    return {
      count: data.data?.count ?? 0,
      rows: data.data?.rows ?? [],
    }
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
