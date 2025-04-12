import { TokenService } from '@core/auth/token.service'
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { FastifyRequest } from 'fastify'

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly tokenService: TokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>()
    const token = this.extractTokenFromRequest(request)

    if (!token) {
      throw new UnauthorizedException('Authorization token not found')
    }

    try {
      // Check if token is blacklisted
      const isBlacklisted = await this.tokenService.isTokenBlacklisted(token)
      if (isBlacklisted) {
        throw new UnauthorizedException('Token revoked')
      }

      request.user = await this.jwtService.verifyAsync(token, {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      })
      return true
    } catch (error) {
      throw new UnauthorizedException(
        error.message || 'Invalid or expired token',
      )
    }
  }

  private extractTokenFromRequest(request: FastifyRequest): string | null {
    // 1. Check cookies first
    const cookieToken = request.cookies?.access_token
    if (cookieToken && typeof cookieToken === 'string') {
      return cookieToken
    }

    // 2. Check authorization header
    const authHeader = request.headers?.authorization
    if (authHeader && typeof authHeader === 'string') {
      const [type, token] = authHeader.split(' ')
      return type === 'Bearer' ? token : null
    }

    // 3. Check query parameters (optional)
    // const queryToken = getQueryToken(request)
    // if (queryToken) return queryToken

    return null
  }
}
