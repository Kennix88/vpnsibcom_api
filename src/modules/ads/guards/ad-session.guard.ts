import { RedisService } from '@core/redis/redis.service'
import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import type { FastifyRequest } from 'fastify'

@Injectable()
export class AdSessionGuard implements CanActivate {
  constructor(
    private readonly redisService: RedisService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  private extractVerifyKey(req: FastifyRequest): string | null {
    // ищем JWT только в body.verifyKey
    // @ts-ignore
    if (req.body && typeof req.body.verifyKey === 'string')
      // @ts-ignore
      return req.body.verifyKey
    return null
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<FastifyRequest>()
    const user = (req as any).user
    if (!user?.sub) {
      throw new ForbiddenException('User must be authenticated')
    }

    const verifyKey = this.extractVerifyKey(req)
    if (!verifyKey) {
      throw new BadRequestException('verifyKey not provided')
    }

    // verify JWT and obtain sessionId
    const secret = this.configService.get<string>('ADS_SESSION_SECRET')
    if (!secret) {
      throw new InternalServerErrorException(
        'ADS_SESSION_SECRET not configured',
      )
    }

    let payload: any
    try {
      payload = await this.jwtService.verifyAsync(verifyKey, { secret })
    } catch (err) {
      throw new BadRequestException('Invalid or expired verifyKey')
    }

    const sessionId = payload?.sid
    if (!sessionId) {
      throw new BadRequestException('verifyKey payload invalid')
    }

    try {
      const metaKey = `ad:session:meta:${sessionId}`
      const meta = await this.redisService.getObject<Record<string, any>>(
        metaKey,
      )
      if (!meta) {
        throw new BadRequestException('ad session not found or expired')
      }

      if (String(meta.userId) !== String(user.sub)) {
        throw new ForbiddenException('ad session user mismatch')
      }

      // Проверяем, что сессия еще не была использована
      const usedKey = `ad:session:used:${sessionId}`
      const isUsed = await this.redisService.get(usedKey)
      if (isUsed !== null) {
        throw new BadRequestException('ad session already used')
      }

      // pass meta and sessionId forward
      ;(req as any).adSession = { ...meta, sessionId, verifyKey }
      return true
    } catch (err) {
      if (err.status && err.message) throw err
      throw new InternalServerErrorException('Failed to validate ad session')
    }
  }
}
