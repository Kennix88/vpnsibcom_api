import { resolve4, resolve6 } from 'dns/promises'
import { isIP } from 'net'

/**
 * Резолвит host (IP или домен) в список IP-адресов.
 * - Если host уже IP (v4/v6) — возвращает его как есть, без похода в DNS.
 * - Если host — домен, параллельно резолвит A и AAAA записи.
 *   Отсутствие одного из типов записи (например, только A без AAAA) — не ошибка.
 * - Один "плохой" host не должен ронять проверку остальных нод, поэтому:
 *   таймаут на каждый DNS-запрос + Promise.allSettled внутри.
 *
 * ВАЖНО (ограничения, которые стоит держать в голове):
 * - Если адрес ноды спрятан за CDN/reverse-proxy (Cloudflare и т.п.), резолв даст IP прокси,
 *   а не реальной ноды — эту ситуацию мы осознанно не разруливаем (см. обсуждение).
 * - DNS может отдавать round-robin/несколько IP, часть из которых не имеет отношения
 *   к конкретному серверу (балансировщик, anycast) — тогда список будет шире, чем ожидается.
 * - Хостинг-провайдеры переиспользуют IP после деаллокации VPS: если домен ноды теоретически
 *   мог указывать на IP, который позже отдали другому клиенту — это внешний риск, не про DNS-резолв.
 */
export async function resolveHostToIps(
  rawHost: string,
  timeoutMs = 3000,
): Promise<string[]> {
  const host = rawHost.trim().replace(/^\[|\]$/g, '')

  if (!host) return []
  if (isIP(host)) return [host]

  const withTimeout = <T>(promise: Promise<T>): Promise<T> =>
    Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        setTimeout(
          () =>
            reject(
              new Error(
                `DNS lookup timeout (${timeoutMs}ms) for host "${host}"`,
              ),
            ),
          timeoutMs,
        )
      }),
    ])

  const [v4, v6] = await Promise.allSettled([
    withTimeout(resolve4(host)),
    withTimeout(resolve6(host)),
  ])

  const ips = new Set<string>()

  if (v4.status === 'fulfilled') {
    v4.value.forEach((ip) => ips.add(ip))
  }
  if (v6.status === 'fulfilled') {
    v6.value.forEach((ip) => ips.add(ip))
  }

  // Если оба резолва упали (домен не резолвится вообще / DNS недоступен) — пробрасываем
  // причину наверх, чтобы вызывающий код мог залогировать и корректно деградировать.
  if (v4.status === 'rejected' && v6.status === 'rejected') {
    throw new Error(
      `Failed to resolve host "${host}": A: ${
        v4.reason?.message ?? v4.reason
      }; AAAA: ${v6.reason?.message ?? v6.reason}`,
    )
  }

  return [...ips]
}
