import { PrismaService } from '@core/prisma/prisma.service'
import { RedisService } from '@core/redis/redis.service'
import { Injectable } from '@nestjs/common'
import { PinoLogger } from 'nestjs-pino'

import { RemnaService } from '../remna/remna.service'
import { resolveHostToIps } from '../utils/dns-resolve.util'
import { normalizeIp } from '../utils/get-client-ip.util'

/** Время кэширования множества "зелёных" IP (адреса нод + резолв их доменов) в секундах */
const GREEN_IP_SET_CACHE_TTL_SEC = 30

/** Таймаут на резолв одного домена ноды, чтобы одна зависшая DNS-запись не тормозила всю проверку */
const NODE_DNS_RESOLVE_TIMEOUT_MS = 3000

const GREEN_IP_SET_CACHE_KEY = 'green:node-ip-set'

const IP_REGEX = /^\d{1,3}(?:\.\d{1,3}){3}$|^[\da-fA-F:]+$/

@Injectable()
export class ServersService {
  private readonly serviceName = 'ServersService'

  constructor(
    private readonly prismaService: PrismaService,
    private readonly logger: PinoLogger,
    private readonly redis: RedisService,
    private readonly remnaService: RemnaService,
  ) {}

  /**
   * Проверяет, находится ли IP в зелёном списке (т.е. принадлежит одной из нод панели).
   *
   * Нормализует IP перед проверкой (::ffff:x.x.x.x → x.x.x.x).
   * Сверяется не только с "сырым" `node.address` (когда там уже IP), но и с адресами,
   * в которые резолвится `node.address`, если там указан домен.
   *
   * Множество "зелёных" IP кэшируется в Redis на 30 секунд одним ключом — это дешевле,
   * чем ходить в Remnawave API и резолвить DNS на каждый уникальный проверяемый IP.
   */
  public async greenCheck(rawIp: string): Promise<boolean> {
    const ip = normalizeIp(rawIp)

    if (!ip || !IP_REGEX.test(ip)) {
      this.logger.warn({
        msg: `greenCheck: некорректный IP после нормализации`,
        rawIp,
        normalizedIp: ip,
        service: this.serviceName,
      })
      return false
    }

    try {
      const greenIpSet = await this.getGreenIpSet()
      const result = greenIpSet.has(ip)

      this.logger.debug({
        msg: `greenCheck result`,
        ip,
        result,
        service: this.serviceName,
      })

      return result
    } catch (error) {
      this.logger.error({
        msg: `greenCheck: не удалось построить множество зелёных IP`,
        ip,
        error,
        stack: error instanceof Error ? error.stack : undefined,
        service: this.serviceName,
      })
      return false
    }
  }

  /**
   * Строит (или берёт из кэша) множество IP-адресов всех нод панели.
   * Для нод с доменным `address` резолвит A/AAAA записи; для нод с IP-адресом
   * использует его напрямую, без похода в DNS.
   *
   * Сбой резолва домена ОДНОЙ ноды не должен ронять всю проверку — такая нода
   * просто не попадёт в множество в этом цикле обновления кэша, ошибка логируется.
   */
  private async getGreenIpSet(): Promise<Set<string>> {
    try {
      const cached = await this.redis.getObject<string[]>(
        GREEN_IP_SET_CACHE_KEY,
      )
      if (cached) {
        return new Set(cached)
      }
    } catch (redisErr) {
      this.logger.warn({
        msg: `greenCheck: Redis недоступен на чтении кэша множества IP, идём напрямую в Remnawave`,
        err: String(redisErr),
        service: this.serviceName,
      })
    }

    const nodes = await this.remnaService.getAllNodes()

    const resolutions = await Promise.allSettled(
      nodes.map(async (node) => ({
        node,
        ips: await resolveHostToIps(node.address, NODE_DNS_RESOLVE_TIMEOUT_MS),
      })),
    )

    const ipSet = new Set<string>()

    for (const resolution of resolutions) {
      if (resolution.status === 'fulfilled') {
        for (const ip of resolution.value.ips) {
          const normalized = normalizeIp(ip) ?? ip
          ipSet.add(normalized)
        }
        continue
      }

      // Не знаем, для какой ноды именно упало (allSettled не даёт node в reject-ветке),
      // поэтому логируем best-effort по исходному списку адресов — для точечного дебага
      // почти всегда достаточно самого сообщения ошибки резолва (в нём есть host).
      this.logger.warn({
        msg: `greenCheck: не удалось зарезолвить адрес одной из нод, нода пропущена в этом цикле`,
        err:
          resolution.reason instanceof Error
            ? resolution.reason.message
            : String(resolution.reason),
        service: this.serviceName,
      })
    }

    this.redis
      .setObjectWithExpiry(
        GREEN_IP_SET_CACHE_KEY,
        [...ipSet],
        GREEN_IP_SET_CACHE_TTL_SEC,
      )
      .catch((e) =>
        this.logger.warn({
          msg: `greenCheck: не удалось записать кэш множества зелёных IP`,
          err: String(e),
          service: this.serviceName,
        }),
      )

    return ipSet
  }
}
