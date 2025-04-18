import { RedisService } from '@core/redis/redis.service'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { JwtPayload } from '@shared/types/jwt-payload.interface'

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
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
    await this.redis.set(
      `refresh_token:${payload.sub}`,
      refreshToken,
      'EX',
      7 * 24 * 60 * 60, // 7 days in seconds
    )

    return { accessToken, refreshToken }
  }

  async rotateTokens(userId: string, oldRefreshToken: string) {
    // Verify old refresh token
    const payload = await this.jwtService.verifyAsync<JwtPayload>(
      oldRefreshToken,
      {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      },
    )

    // Check if token is in Redis
    const storedRefreshToken = await this.redis.get(`refresh_token:${userId}`)

    if (!storedRefreshToken || storedRefreshToken !== oldRefreshToken) {
      throw new Error('Invalid refresh token')
    }

    // Blacklist old token
    await this.redis.set(
      `blacklist:${oldRefreshToken}`,
      'true',
      'EX',
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

    await this.redis.set(
      `blacklist:${token}`,
      'true',
      'EX',
      Math.floor(payload.exp - Date.now() / 1000),
    )

    // Remove refresh token
    await this.redis.del(`refresh_token:${userId}`)
  }

  async isTokenBlacklisted(token: string | null): Promise<boolean> {
    if (!token) return true
    const blacklisted = await this.redis.get(`blacklist:${token}`)
    return !!blacklisted
  }
}
