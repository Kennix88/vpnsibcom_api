import { RedisService } from '@core/redis/redis.service'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { JwtPayload } from '@shared/types/jwt-payload.interface'
import { LoggerTelegramService } from '../logger/logger-telegram.service'

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
    private readonly telegramLogger: LoggerTelegramService,
  ) {}

  /**
   * Generates access and refresh tokens for a given payload.
   * @param payload - The JWT payload containing user information.
   * @returns An object with accessToken and refreshToken.
   */
  async generateTokens(payload: JwtPayload): Promise<{ accessToken: string; refreshToken: string }> {
    this.telegramLogger.debug(`Generating tokens for user ID: ${payload.sub}`)
    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.configService.getOrThrow<string>('ACCESS_TOKEN_EXPIRY'),
    })
    this.telegramLogger.debug(`Access token generated for user ID: ${payload.sub}`)

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.getOrThrow<string>('REFRESH_TOKEN_EXPIRY'),
    })
    this.telegramLogger.debug(`Refresh token generated for user ID: ${payload.sub}`)

    // Store refresh token in Redis
    await this.redis.set(
      `refresh_token:${payload.sub}`,
      refreshToken,
      'EX',
      7 * 24 * 60 * 60, // 7 days in seconds
    )
    this.telegramLogger.info(`Refresh token stored in Redis for user ID: ${payload.sub}`)

    return { accessToken, refreshToken }
  }

  /**
   * Rotates refresh tokens, invalidating the old one and issuing a new pair.
   * @param userId - The ID of the user.
   * @param oldRefreshToken - The old refresh token to be rotated.
   * @returns An object with new accessToken and refreshToken.
   * @throws Error if the refresh token is invalid.
   */
  async rotateTokens(userId: string, oldRefreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    this.telegramLogger.debug(`Attempting to rotate tokens for user ID: ${userId}`)
    try {
      // Verify old refresh token
      const payload = await this.jwtService.verifyAsync<JwtPayload>(
        oldRefreshToken,
        {
          secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        },
      )
      this.telegramLogger.debug(`Old refresh token verified for user ID: ${userId}`)

      // Check if token is in Redis
      const storedRefreshToken = await this.redis.get(`refresh_token:${userId}`)
      this.telegramLogger.debug(`Stored refresh token retrieved for user ID: ${userId}`)

      if (!storedRefreshToken || storedRefreshToken !== oldRefreshToken) {
        this.telegramLogger.warn(`Invalid refresh token for user ID: ${userId}. Stored: ${storedRefreshToken ? 'exists' : 'not exists'}, Provided: ${oldRefreshToken ? 'exists' : 'not exists'}`)
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
      this.telegramLogger.info(`Old refresh token blacklisted for user ID: ${userId}. Expires in: ${expiresIn} seconds`)

      // Generate new tokens
      const newPayload: JwtPayload = {
        sub: payload.sub,
        telegramId: payload.telegramId,
        role: payload.role,
      }
      this.telegramLogger.debug(`Generating new tokens with payload for user ID: ${userId}`)

      return this.generateTokens(newPayload)
    } catch (error) {
      this.telegramLogger.error(`Failed to rotate tokens for user ID: ${userId}. Error: ${(error as Error).message}`)
      throw error
    }
  }

  /**
   * Invalidates access and refresh tokens for a given user.
   * @param userId - The ID of the user.
   * @param token - The access token to be blacklisted.
   */
  async invalidateTokens(userId: string, token: string): Promise<void> {
    this.telegramLogger.debug(`Attempting to invalidate tokens for user ID: ${userId}`)
    try {
      // Add to blacklist
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        ignoreExpiration: true,
      })
      this.telegramLogger.debug(`Access token verified for blacklisting for user ID: ${userId}`)

      const expiresIn = Math.floor(payload.exp - Date.now() / 1000)
      await this.redis.set(
        `blacklist:${token}`,
        'true',
        'EX',
        expiresIn,
      )
      this.telegramLogger.info(`Access token blacklisted for user ID: ${userId}. Expires in: ${expiresIn} seconds`)

      // Remove refresh token
      await this.redis.del(`refresh_token:${userId}`)
      this.telegramLogger.info(`Refresh token removed from Redis for user ID: ${userId}`)
    } catch (error) {
      this.telegramLogger.error(`Failed to invalidate tokens for user ID: ${userId}. Error: ${(error as Error).message}`)
      throw error
    }
  }

  /**
   * Checks if a given token is blacklisted.
   * @param token - The token to check.
   * @returns True if the token is blacklisted, false otherwise.
   */
  async isTokenBlacklisted(token: string | null): Promise<boolean> {
    this.telegramLogger.debug(`Checking if token is blacklisted: ${token ? 'exists' : 'not exists'}`)
    if (!token) {
      this.telegramLogger.debug('Token is null, considered blacklisted.')
      return true
    }
    const blacklisted = await this.redis.get(`blacklist:${token}`)
    this.telegramLogger.debug(`Blacklist status for token: ${token ? 'exists' : 'not exists'} is ${!!blacklisted}`)
    return !!blacklisted
  }
}
