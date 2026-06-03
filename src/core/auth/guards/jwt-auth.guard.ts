import { TokenService } from '@core/auth/services/token.service'
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Reflector } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import { FastifyRequest } from 'fastify'
import { SKIP_AUTH_KEY } from '../decorators/skip-auth.decorator'

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly tokenService: TokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const skipAuth = this.reflector.getAllAndOverride<boolean>(SKIP_AUTH_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (skipAuth) {
      return true
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>()
    const token = this.extractTokenFromRequest(request)

    if (!token) {
      throw new UnauthorizedException('Authorization token not found')
    }

    try {
      const isBlacklisted = await this.tokenService.isTokenBlacklisted(token)
      if (isBlacklisted) {
        throw new UnauthorizedException('Token revoked')
      }

      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      })

      request.user = payload
      return true
    } catch (error) {
      throw new UnauthorizedException(
        error instanceof Error ? error.message : 'Invalid or expired token',
      )
    }
  }

  public extractTokenFromRequest(request: FastifyRequest): string | null {
    const cookieToken = request.cookies?.access_token
    if (cookieToken && typeof cookieToken === 'string') {
      return cookieToken
    }

    const authHeader = request.headers?.authorization
    if (authHeader && typeof authHeader === 'string') {
      const [type, token] = authHeader.split(' ')
      if (type === 'Bearer' && token) {
        return token
      }
    }

    return null
  }
}
