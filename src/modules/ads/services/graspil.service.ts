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
  bio: string | null
  utm?: {
    first: object
    last: object
    weight: object
    referral_id: number | null
  }
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

interface GraspilSendTargetResponse {
  ok: boolean
  error?: Record<string, string[]>
}

@Injectable()
export class GraspilService {
  private TOKEN: string

  // Кешируем курс звёзд, чтобы не ходить в БД на каждый sendEvent.
  // Сбрасываем при изменении настроек или при следующем старте сервиса.
  private cachedStarsToUSD: number | null = null
  private cachedStarsToUSDAt: number = 0
  private readonly STARS_CACHE_TTL_MS = 5 * 60 * 1000 // 5 минут

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

  private async getStarsToUSD(): Promise<number> {
    const now = Date.now()
    if (
      this.cachedStarsToUSD !== null &&
      now - this.cachedStarsToUSDAt < this.STARS_CACHE_TTL_MS
    ) {
      return this.cachedStarsToUSD
    }

    const settings = await this.prisma.settings.findFirst({
      where: { key: DefaultEnum.DEFAULT },
      select: { tgStarsToUSD: true },
    })

    if (!settings) {
      throw new Error('Settings not found: cannot resolve tgStarsToUSD')
    }

    this.cachedStarsToUSD = settings.tgStarsToUSD
    this.cachedStarsToUSDAt = now
    return settings.tgStarsToUSD
  }

  /** Отправка конверсии в аналитику Graspil.
   * Возвращает true если событие успешно принято сервером.
   *
   * @param tgid        - Telegram ID пользователя
   * @param amountStars - Сумма в звёздах (0 для безоплатных событий)
   * @param targetId    - ID цели в Graspil (по умолчанию 1 — Sale)
   */
  public async sendEvent({
    tgid,
    amountStars,
    targetId = 1,
  }: {
    tgid: number
    amountStars: number
    targetId?: number
  }): Promise<boolean> {
    try {
      const starsToUSD = await this.getStarsToUSD()
      const usd = Number((amountStars * starsToUSD).toFixed(2))

      const body: Record<string, unknown> = {
        target_id: Number(targetId),
        user_id: Number(tgid),
      }

      // unit обязателен только если передаётся value (по документации)
      if (usd > 0) {
        body.value = usd
        body.unit = 'usd'
      }

      const { data } = await axios.post<GraspilSendTargetResponse>(
        'https://api.graspil.com/v1/send-target',
        body,
        {
          headers: {
            'Api-Key': this.TOKEN,
          },
        },
      )

      if (!data.ok) {
        this.logger.warn({
          msg: 'Graspil send-target returned ok=false',
          tgid,
          targetId,
          error: data.error,
        })
        return false
      }

      return true
    } catch (error) {
      this.logger.error({
        msg: 'Graspil sendEvent failed',
        tgid,
        targetId,
        error,
      })
      return false
    }
  }
}
