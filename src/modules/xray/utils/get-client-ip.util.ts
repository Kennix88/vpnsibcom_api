import { FastifyRequest } from 'fastify'

export function getClientIp(req: FastifyRequest): string {
  const headers = req.headers

  // Cloudflare IP
  const cfConnectingIp = headers['cf-connecting-ip']
  if (cfConnectingIp) return cleanIp(cfConnectingIp.toString())

  // x-forwarded-for (первый IP из списка)
  const xForwardedFor = headers['x-forwarded-for']
  if (xForwardedFor) return cleanIp(xForwardedFor.toString().split(',')[0])

  // Fallback
  return cleanIp(req.ip)
}

function cleanIp(ip: string): string {
  ip = ip.trim()

  // IPv6 в формате [::1]:port
  const ipv6Match = ip.match(/^\[([^\]]+)](?::\d+)?$/)
  if (ipv6Match) return ipv6Match[1]

  // IPv4 с портом: 192.168.0.1:12345 → 192.168.0.1
  const [cleanedIp] = ip.split(':')
  return cleanedIp
}
