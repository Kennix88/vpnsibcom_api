import { FastifyRequest } from 'fastify'

/**
 * Нормализует IP-адрес к чистому IPv4 или IPv6 без порта.
 * Обрабатывает: ::ffff:x.x.x.x, [::1]:port, 1.2.3.4:port
 */
export function normalizeIp(raw: string): string {
  if (!raw) return ''
  let ip = raw.trim()
  const bracketMatch = ip.match(/^\[([^\]]+)](?::\d+)?$/)
  if (bracketMatch) ip = bracketMatch[1]
  const ipv4MappedMatch = ip.match(
    /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i,
  )
  if (ipv4MappedMatch) return ipv4MappedMatch[1]
  if (ip.includes('.') && ip.includes(':')) {
    const candidate = ip.slice(0, ip.lastIndexOf(':'))
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(candidate)) return candidate
  }
  return ip
}

/**
 * Извлекает реальный IP клиента с учётом цепочки Bunny/Cloudflare → Caddy → Docker → Fastify.
 *
 * Порядок приоритетов:
 * 1. CF-Connecting-IP  — если трафик идёт через Cloudflare
 * 2. X-Real-IP          — ДОБАВЛЕНО: Bunny.net отдаёт чистый IP клиента именно в этом заголовке
 *    (в отличие от X-Forwarded-For, где он идёт вторым после IP самой CDN-ноды Bunny)
 * 3. req.ip — Fastify с trustProxy:true уже корректно разворачивает XFF
 * 4. X-Forwarded-For первый элемент как fallback
 */
export function getClientIp(req: FastifyRequest): string {
  const { headers } = req

  // 1. Cloudflare (если когда-нибудь появится перед Caddy)
  const cfIp = headers['cf-connecting-ip']
  if (cfIp) return normalizeIp(String(cfIp))

  // 2. ДОБАВЛЕНО: Bunny.net — X-Real-IP содержит только IP клиента,
  //    не нужно парсить цепочку прокси как в X-Forwarded-For
  const bunnyRealIp = headers['x-real-ip']
  if (bunnyRealIp) {
    const normalized = normalizeIp(String(bunnyRealIp))
    if (normalized) return normalized
  }

  // 3. Fastify с trustProxy:true сам разворачивает XFF → req.ip = реальный клиент
  if (req.ip) {
    const normalized = normalizeIp(req.ip)
    if (normalized) return normalized
  }

  // 4. Fallback: ручной XFF (CDN IP, IP юзера через запятую — берём первый значимый)
  //    Для Bunny первый элемент здесь — IP самой CDN-ноды, а не клиента,
  //    поэтому этот fallback актуален в основном для Cloudflare/generic-прокси случаев
  const xff = headers['x-forwarded-for']
  if (xff) return normalizeIp(String(xff).split(',')[0])

  return ''
}
