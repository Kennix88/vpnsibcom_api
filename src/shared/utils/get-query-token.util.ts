import { FastifyRequest } from 'fastify'

export function getQueryToken(request: FastifyRequest): string | null {
  if (request.query && typeof request.query === 'object') {
    const query = request.query as Record<string, unknown>
    const token = query.token
    return typeof token === 'string' ? token : null
  }
  return null
}
