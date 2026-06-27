import { PrismaService } from '@core/prisma/prisma.service'
import { RedisService } from '@core/redis/redis.service'
import { Injectable } from '@nestjs/common'
import { PinoLogger } from 'nestjs-pino'
import {
  ServerDataInterface,
  ServersResponseDataInterface,
} from '../types/servers-data.interface'
import { normalizeIp } from '../utils/get-client-ip.util'

/** Время кэширования результата green-check в секундах */
const GREEN_CHECK_CACHE_TTL_SEC = 30

@Injectable()
export class ServersService {
  private readonly serviceName = 'ServersService'

  constructor(
    private readonly prismaService: PrismaService,
    private readonly logger: PinoLogger,
    private readonly redis: RedisService,
  ) {}

  public async getAll(): Promise<ServersResponseDataInterface> {
    const servers = await this.prismaService.greenList.findMany({
      where: { isActive: true },
      select: {
        code: true,
        name: true,
        flagKey: true,
        flagEmoji: true,
        network: true,
        isActive: true,
        isPremium: true,
      },
    })

    let baseServersCount = 0
    let premiumServersCount = 0

    const serversMapped: ServerDataInterface[] = servers.map((server) => {
      if (server.isPremium) premiumServersCount++
      else baseServersCount++
      return server
    })

    return { baseServersCount, premiumServersCount, servers: serversMapped }
  }

  /**
   * Проверяет, находится ли IP в зелёном списке.
   *
   * Нормализует IP перед проверкой (::ffff:x.x.x.x → x.x.x.x),
   * кэширует результат в Redis на 30 секунд чтобы навигация
   * между страницами не генерировала лишние запросы к БД.
   */
  public async greenCheck(rawIp: string): Promise<boolean> {
    // Нормализуем на сервисном уровне — дополнительная защита
    const ip = normalizeIp(rawIp)

    if (!ip || !/^\d{1,3}(?:\.\d{1,3}){3}$|^[\da-fA-F:]+$/.test(ip)) {
      this.logger.warn({
        msg: `greenCheck: некорректный IP после нормализации`,
        rawIp,
        normalizedIp: ip,
        service: this.serviceName,
      })
      return false
    }

    const cacheKey = `green:${ip}`

    // Пробуем кэш — быстрый путь (навигация между страницами)
    try {
      const cached = await this.redis.get(cacheKey)
      if (cached !== null) {
        const result = cached === '1'
        this.logger.debug({
          msg: `greenCheck cache hit`,
          ip,
          result,
          service: this.serviceName,
        })
        return result
      }
    } catch (redisErr) {
      // Redis недоступен — идём в БД, не падаем
      this.logger.warn({
        msg: `greenCheck: Redis недоступен, fallback на БД`,
        err: String(redisErr),
        service: this.serviceName,
      })
    }

    // Запрос в БД
    try {
      const record = await this.prismaService.greenList.findUnique({
        where: { green: ip },
        select: { green: true }, // нам нужен только факт существования
      })

      const result = record !== null

      this.logger.info({
        msg: `greenCheck DB result`,
        ip,
        result,
        service: this.serviceName,
      })

      // Пишем в кэш — ошибка записи не критична
      this.redis
        .set(cacheKey, result ? '1' : '0', 'EX', GREEN_CHECK_CACHE_TTL_SEC)
        .catch((e) =>
          this.logger.warn({
            msg: `greenCheck: не удалось записать кэш`,
            err: String(e),
          }),
        )

      return result
    } catch (error) {
      this.logger.error({
        msg: `greenCheck: ошибка БД для IP ${ip}`,
        error,
        stack: error instanceof Error ? error.stack : undefined,
        service: this.serviceName,
      })
      return false
    }
  }
}
