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

  /**
   * Parses an expiry string (e.g., "7d", "1h", "30m") into seconds.
   * @param expiryString - The expiry string to parse.
   * @returns The expiry in seconds.
   * @throws Error if the expiry string format is invalid.
   */
  private parseExpiryToSeconds(expiryString: string): number {
    const value = parseInt(expiryString.slice(0, -1))
    const unit = expiryString.slice(-1)

    if (isNaN(value)) {
      throw new Error(
        `Invalid expiry string: ${expiryString}. Value is not a number.`,
      )
    }

    switch (unit) {
      case 's':
        return value
      case 'm':
        return value * 60
      case 'h':
        return value * 60 * 60
      case 'd':
        return value * 24 * 60 * 60
      default:
        throw new Error(
          `Invalid expiry string: ${expiryString}. Unknown unit: ${unit}`,
        )
    }
  }

  /**
   * Generates access and refresh tokens for a given payload.
   * @param payload - The JWT payload containing user information.
   * @returns An object with accessToken and refreshToken.
   */
  async generateTokens(
    payload: JwtPayload,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.configService.getOrThrow<string>('ACCESS_TOKEN_EXPIRY'),
    })

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.getOrThrow<string>('REFRESH_TOKEN_EXPIRY'),
    })

    // Store refresh token in Redis
    const refreshTokenExpiry = this.configService.getOrThrow<string>(
      'REFRESH_TOKEN_EXPIRY',
    )
    const ttlSeconds = this.parseExpiryToSeconds(refreshTokenExpiry)

    try {
      await this.redis.set(
        `refresh_token:${payload.sub}`,
        refreshToken,
        'EX',
        ttlSeconds,
      )
    } catch (error) {
      throw new Error(
        `Failed to store refresh token for user ID: ${payload.sub}. Error: ${
          (error as Error).message
        }`,
      )
    }

    return { accessToken, refreshToken }
  }

  /**
   * Rotates refresh tokens, invalidating the old one and issuing a new pair.
   * @param userId - The ID of the user.
   * @param oldRefreshToken - The old refresh token to be rotated.
   * @returns An object with new accessToken and refreshToken.
   * @throws Error if the refresh token is invalid.
   */
  async rotateTokens(
    userId: string,
    oldRefreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    try {
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
      const expiresIn = Math.floor(payload.exp - Date.now() / 1000)
      await this.redis.set(
        `blacklist:${oldRefreshToken}`,
        'true',
        'EX',
        expiresIn,
      )

      // Generate new tokens
      const newPayload: JwtPayload = {
        sub: payload.sub,
        telegramId: payload.telegramId,
        role: payload.role,
      }

      return this.generateTokens(newPayload)
    } catch (error) {
      throw new Error(
        `Failed to rotate refresh token for user ID: ${userId}. Error: ${
          (error as Error).message
        }`,
      )
    }
  }

  /**
   * Invalidates access and refresh tokens for a given user.
   * @param userId - The ID of the user.
   * @param token - The access token to be blacklisted.
   */
  async invalidateTokens(userId: string, token: string): Promise<void> {
    try {
      // Add to blacklist
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        ignoreExpiration: true,
      })

      const expiresIn = Math.floor(payload.exp - Date.now() / 1000)
      await this.redis.set(`blacklist:${token}`, 'true', 'EX', expiresIn)

      // Remove refresh token
      await this.redis.del(`refresh_token:${userId}`)
    } catch (error) {
      throw new Error(
        `Failed to invalidate tokens for user ID: ${userId}. Error: ${
          (error as Error).message
        }`,
      )
    }
  }

  /**
   * Checks if a given token is blacklisted.
   * @param token - The token to check.
   * @returns True if the token is blacklisted, false otherwise.
   */
  async isTokenBlacklisted(token: string | null): Promise<boolean> {
    if (!token) {
      return true
    }
    const blacklisted = await this.redis.get(`blacklist:${token}`)
    return !!blacklisted
  }
}
