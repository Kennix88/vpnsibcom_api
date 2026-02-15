import { RedisService } from '@core/redis/redis.service'
import { Injectable, Logger } from '@nestjs/common'

@Injectable()
export class TonUtimeService {
  private readonly logger = new Logger(TonUtimeService.name)

  constructor(private readonly redis: RedisService) {}

  private getRedisKey(wallet: string) {
    return `ton:lastUtime:${wallet}`
  }

  /**
   * Получает последнюю обработанную дату транзакции (utime) для кошелька.
   * Если нет в Redis — возвращает timestamp за последние сутки
   */
  async getLastUtime(wallet: string): Promise<number> {
    const key = this.getRedisKey(wallet)
    const utimeStr = await this.redis.get(key)

    if (utimeStr) {
      const utime = parseInt(utimeStr, 10)
      if (!isNaN(utime)) return utime
    }

    // Если нет в Redis — по умолчанию сутки назад
    const oneDayAgo = Math.floor(Date.now() / 1000) - 24 * 60 * 60
    return oneDayAgo
  }

  /**
   * Обновляет последнюю обработанную дату транзакции (utime) для кошелька
   */
  async setLastUtime(wallet: string, utime: number): Promise<void> {
    const key = this.getRedisKey(wallet)
    await this.redis.set(key, utime.toString())
  }
}
