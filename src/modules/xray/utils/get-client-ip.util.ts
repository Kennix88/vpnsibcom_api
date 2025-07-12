import { FastifyRequest } from 'fastify'

export function getClientIp(req: FastifyRequest): string {
  const headers = req.headers

  // Cloudflare (при использовании CDN)
  const cfConnectingIp = headers['cf-connecting-ip']

  // Стандартные заголовки прокси
  const xForwardedFor = headers['x-forwarded-for']

  // Попытка взять IP из заголовков (список через запятую — берём первый)
  const forwardedIp = (cfConnectingIp || xForwardedFor)
    ?.toString()
    .split(',')[0]
    ?.trim()

  // Учитываем localhost при разработке
  const isLocalhost = req.ip === '127.0.0.1' || req.ip === '::1'

  return (isLocalhost && forwardedIp) ?? req.ip
}
