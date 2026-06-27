import { FastifyRequest } from 'fastify'

/**
 * Нормализует IP-адрес к чистому IPv4 или IPv6 без порта.
 * Обрабатывает: ::ffff:x.x.x.x, [::1]:port, 1.2.3.4:port
 */
export function normalizeIp(raw: string): string {
  if (!raw) return ''
  let ip = raw.trim()

  // [::1]:port или [::ffff:x.x.x.x]:port → убираем скобки и порт
  const bracketMatch = ip.match(/^\[([^\]]+)](?::\d+)?$/)
  if (bracketMatch) ip = bracketMatch[1]

  // ::ffff:1.2.3.4 или ::FFFF:1.2.3.4 → 1.2.3.4
  // (Docker/Linux возвращает IPv4-mapped IPv6 когда слушаем на 0.0.0.0)
  const ipv4MappedMatch = ip.match(
    /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i,
  )
  if (ipv4MappedMatch) return ipv4MappedMatch[1]

  // 1.2.3.4:port → 1.2.3.4 (только для IPv4, у IPv6 двоеточия — часть адреса)
  if (ip.includes('.') && ip.includes(':')) {
    const candidate = ip.slice(0, ip.lastIndexOf(':'))
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(candidate)) return candidate
  }

  return ip
}

/**
 * Извлекает реальный IP клиента с учётом Caddy → Docker → Fastify цепочки.
 *
 * Порядок приоритетов:
 * 1. CF-Connecting-IP (если трафик идёт через Cloudflare)
 * 2. req.ip — Fastify с trustProxy:true уже корректно разворачивает XFF
 * 3. X-Forwarded-For первый элемент как fallback
 */
export function getClientIp(req: FastifyRequest): string {
  const { headers } = req

  // 1. Cloudflare (если когда-нибудь появится перед Caddy)
  const cfIp = headers['cf-connecting-ip']
  if (cfIp) return normalizeIp(String(cfIp))

  // 2. Fastify с trustProxy:true сам разворачивает XFF → req.ip = реальный клиент
  //    Это самый надёжный источник при наличии trustProxy
  if (req.ip) {
    const normalized = normalizeIp(req.ip)
    if (normalized) return normalized
  }

  // 3. Fallback: ручной XFF (на случай если trustProxy не отработал)
  const xff = headers['x-forwarded-for']
  if (xff) return normalizeIp(String(xff).split(',')[0])

  return ''
}
