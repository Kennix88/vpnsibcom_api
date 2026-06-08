import { RedisService } from '@core/redis/redis.service'
import { Injectable, Logger } from '@nestjs/common'

// FIX #9: TTL для записей в Redis — 7 дней.
// Без TTL запись живёт вечно: при смене кошелька или сбросе Redis
// устаревшее значение будет мешать корректной обработке транзакций.
const UTIME_TTL_SECONDS = 7 * 24 * 60 * 60 // 7 дней

@Injectable()
export class TonUtimeService {
  private readonly logger = new Logger(TonUtimeService.name)

  constructor(private readonly redis: RedisService) {}

  private getRedisKey(wallet: string) {
    return `ton:lastUtime:${wallet}`
  }

  /**
   * Получает последнюю обработанную дату транзакции (utime) для кошелька.
   * Если нет в Redis — возвращает timestamp за последние сутки.
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
   * Обновляет последнюю обработанную дату транзакции (utime) для кошелька.
   * FIX #9: добавлен TTL, чтобы записи не хранились в Redis вечно.
   */
  async setLastUtime(wallet: string, utime: number): Promise<void> {
    const key = this.getRedisKey(wallet)
    // FIX #9: передаём EX и UTIME_TTL_SECONDS — запись автоматически
    // удалится через 7 дней и не будет блокировать обработку при смене кошелька.
    await this.redis.set(key, utime.toString(), 'EX', UTIME_TTL_SECONDS)
  }
}
