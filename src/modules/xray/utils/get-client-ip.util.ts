import { FastifyRequest } from 'fastify'

export function getClientIp(req: FastifyRequest): string {
  const headers = req.headers

  // Сначала пробуем Cloudflare
  const cfConnectingIp = headers['cf-connecting-ip']
  if (cfConnectingIp) return cfConnectingIp.toString().split(',')[0].trim()

  // Затем стандартный x-forwarded-for
  const xForwardedFor = headers['x-forwarded-for']
  if (xForwardedFor) return xForwardedFor.toString().split(',')[0].trim()

  // Fallback: req.ip (может быть 127.0.0.1 за прокси)
  return req.ip
}
