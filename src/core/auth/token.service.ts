import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { JwtPayload } from '@shared/types/jwt-payload.interface'
import { Cache } from 'cache-manager'

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async generateTokens(payload: JwtPayload) {
    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.configService.getOrThrow<string>('ACCESS_TOKEN_EXPIRY'),
    })

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.getOrThrow<string>('REFRESH_TOKEN_EXPIRY'),
    })

    // Store refresh token in Redis
    await this.cacheManager.set(
      `refresh_token:${payload.sub}`,
      refreshToken,
      7 * 24 * 60 * 60 * 1000, // 7 days
    )

    return { accessToken, refreshToken }
  }

  async rotateTokens(userId: string, oldRefreshToken: string) {
    // Verify old refresh token
    const payload = await this.jwtService.verifyAsync<JwtPayload>(
      oldRefreshToken,
      { secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET') },
    )

    // Check if token is in Redis
    const storedRefreshToken = await this.cacheManager.get<string>(
      `refresh_token:${userId}`,
    )

    if (!storedRefreshToken || storedRefreshToken !== oldRefreshToken) {
      throw new Error('Invalid refresh token')
    }

    // Blacklist old token
    await this.cacheManager.set(
      `blacklist:${oldRefreshToken}`,
      'true',
      Math.floor(payload.exp - Date.now() / 1000),
    )

    // Generate new tokens
    const newPayload: JwtPayload = {
      sub: payload.sub,
      telegramId: payload.telegramId,
      role: payload.role,
    }

    return this.generateTokens(newPayload)
  }

  async invalidateTokens(userId: string, token: string) {
    // Add to blacklist
    const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
      secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      ignoreExpiration: true,
    })

    await this.cacheManager.set(
      `blacklist:${token}`,
      'true',
      Math.floor(payload.exp - Date.now() / 1000),
    )

    // Remove refresh token
    await this.cacheManager.del(`refresh_token:${userId}`)
  }

  async isTokenBlacklisted(token: string | null): Promise<boolean> {
    if (!token) return true
    const blacklisted = await this.cacheManager.get(`blacklist:${token}`)
    return !!blacklisted
  }
}
