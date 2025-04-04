import { randomUUID } from 'crypto'
import type { RawRequestDefaultExpression, RawServerBase } from 'fastify'

export const genReqId = (req: RawRequestDefaultExpression<RawServerBase>) =>
  <string>req.headers['X-Request-Id'] || randomUUID()
