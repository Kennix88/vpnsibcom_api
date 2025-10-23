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
import { LoggerTelegramService } from '../../logger/logger-telegram.service'

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly tokenService: TokenService,
    private readonly telegramLogger: LoggerTelegramService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    this.telegramLogger.debug('JwtAuthGuard: Starting canActivate process.')
    const request = context.switchToHttp().getRequest<FastifyRequest>()
    const token = this.extractTokenFromRequest(request)

    if (!token) {
      this.telegramLogger.warn('JwtAuthGuard: Authorization token not found.')
      throw new UnauthorizedException('Authorization token not found')
    }

    try {
      // Check for blacklist
      this.telegramLogger.debug('JwtAuthGuard: Checking if token is blacklisted.')
      const isBlacklisted = await this.tokenService.isTokenBlacklisted(token)
      if (isBlacklisted) {
        this.telegramLogger.warn('JwtAuthGuard: Token is blacklisted. Unauthorized.')
        throw new UnauthorizedException('Token revoked')
      }
      this.telegramLogger.debug('JwtAuthGuard: Token is not blacklisted.')

      // Token verification
      this.telegramLogger.debug('JwtAuthGuard: Verifying token.')
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      })
      this.telegramLogger.debug(`JwtAuthGuard: Token verified successfully for user ID: ${payload.sub}`)

      request.user = payload
      return true
    } catch (error) {
      this.telegramLogger.error(
        `JwtAuthGuard: Token validation failed: ${(error as Error).message}`,
      )
      throw new UnauthorizedException(
        error?.message || 'Invalid or expired token',
      )
    }
  }

  public extractTokenFromRequest(request: FastifyRequest): string | null {
    // 1. Check in cookies
    const cookieToken = request.cookies?.access_token
    if (cookieToken && typeof cookieToken === 'string') {
      this.telegramLogger.debug('JwtAuthGuard: Token extracted from cookies.')
      return cookieToken
    }

    // 2. Check in Authorization header
    const authHeader = request.headers?.authorization
    if (authHeader && typeof authHeader === 'string') {
      const [type, token] = authHeader.split(' ')
      if (type === 'Bearer' && token) {
        this.telegramLogger.debug('JwtAuthGuard: Token extracted from Authorization header.')
        return token
      }
    }

    this.telegramLogger.debug('JwtAuthGuard: No token found in cookies or Authorization header.')
    return null
  }
}
