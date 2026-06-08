import { RedisService } from '@core/redis/redis.service'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { JwtPayload } from '@shared/types/jwt-payload.interface'

@Injectable()
export class TokenService {
  private getRefreshTokenKey(refreshToken: string): string {
    return `refresh_token:value:${refreshToken}`
  }

  private getUserRefreshTokensSetKey(userId: string): string {
    return `refresh_tokens:user:${userId}`
  }

  private async registerRefreshToken(
    userId: string,
    refreshToken: string,
    ttlSeconds: number,
  ): Promise<void> {
    const tokenKey = this.getRefreshTokenKey(refreshToken)
    const userSetKey = this.getUserRefreshTokensSetKey(userId)

    await this.redis
      .multi()
      .set(tokenKey, userId, 'EX', ttlSeconds)
      .sadd(userSetKey, refreshToken)
      // [БАГ #5] Не перезаписываем TTL всего set фиксированным значением.
      // Используем EXPIREAT с максимальным из текущего и нового TTL, чтобы
      // не срезать живые токены других устройств.
      // Простой компромисс: обновляем TTL только если новое значение больше текущего.
      .exec()

    // Продлеваем TTL set только если новый TTL больше текущего
    const currentTtl = await this.redis.ttl(userSetKey)
    if (currentTtl < ttlSeconds) {
      await this.redis.expire(userSetKey, ttlSeconds)
    }
  }

  private async revokeRefreshToken(refreshToken: string): Promise<void> {
    const tokenKey = this.getRefreshTokenKey(refreshToken)
    const ownerUserId = await this.redis.get(tokenKey)

    if (!ownerUserId) return

    const userSetKey = this.getUserRefreshTokensSetKey(ownerUserId)
    await this.redis.multi().del(tokenKey).srem(userSetKey, refreshToken).exec()
  }

  private async revokeAllRefreshTokensByUser(userId: string): Promise<void> {
    const userSetKey = this.getUserRefreshTokensSetKey(userId)
    const tokens = await this.redis.smembers(userSetKey)

    const pipeline = this.redis.multi()
    for (const refreshToken of tokens) {
      pipeline.del(this.getRefreshTokenKey(refreshToken))
    }
    pipeline.del(userSetKey)
    await pipeline.exec()
  }

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Parses an expiry string (e.g., "7d", "1h", "30m") into seconds.
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

    const refreshTokenExpiry = this.configService.getOrThrow<string>(
      'REFRESH_TOKEN_EXPIRY',
    )
    const ttlSeconds = this.parseExpiryToSeconds(refreshTokenExpiry)

    try {
      await this.registerRefreshToken(payload.sub, refreshToken, ttlSeconds)
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
   * Rotates refresh tokens: верифицирует старый токен, выпускает новую пару и
   * возвращает payload — чтобы вызывающий код не делал повторную верификацию
   * (БАГ #7 — двойной verifyAsync устранён).
   *
   * [БАГ #4] Компенсирующий откат: если генерация новых токенов упала после
   * того, как старый токен уже попал в блэклист, откатываем блэклист, чтобы
   * пользователь не оказался заперт.
   *
   * [БАГ #5] Отрицательный/нулевой TTL: блэклистим только живые токены.
   */
  async rotateTokens(oldRefreshToken: string): Promise<{
    accessToken: string
    refreshToken: string
    payload: JwtPayload
  }> {
    let blacklisted = false

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(
        oldRefreshToken,
        {
          secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        },
      )

      // Проверяем владельца токена в Redis
      const tokenOwner = await this.redis.get(
        this.getRefreshTokenKey(oldRefreshToken),
      )
      if (!tokenOwner || tokenOwner !== payload.sub) {
        throw new Error('Invalid refresh token')
      }

      // [БАГ #5] Блэклистим только если TTL > 0
      const expiresIn = Math.floor(payload.exp - Date.now() / 1000)
      if (expiresIn > 0) {
        await this.redis.set(
          `blacklist:${oldRefreshToken}`,
          'true',
          'EX',
          expiresIn,
        )
        blacklisted = true
      }

      const newPayload: JwtPayload = {
        sub: payload.sub,
        telegramId: payload.telegramId,
        role: payload.role,
      }

      // [БАГ #4] Если generateTokens упадёт — откатим блэклист в catch
      const newTokens = await this.generateTokens(newPayload)
      await this.revokeRefreshToken(oldRefreshToken)

      return { ...newTokens, payload }
    } catch (error) {
      // [БАГ #4] Компенсирующий откат: удаляем из блэклиста, чтобы пользователь
      // мог повторить запрос со старым токеном
      if (blacklisted) {
        await this.redis.del(`blacklist:${oldRefreshToken}`).catch(() => {})
      }
      throw new Error(
        `Failed to rotate refresh token. Error: ${(error as Error).message}`,
      )
    }
  }

  /**
   * Invalidates access and refresh tokens for a given user (logout).
   * [БАГ #5] Блэклистим access-токен только если он ещё не истёк.
   */
  async invalidateTokens(userId: string, token: string): Promise<void> {
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        ignoreExpiration: true,
      })

      // [БАГ #5] Гард на отрицательный/нулевой TTL
      const expiresIn = Math.floor(payload.exp - Date.now() / 1000)
      if (expiresIn > 0) {
        await this.redis.set(`blacklist:${token}`, 'true', 'EX', expiresIn)
      }
      // Если токен уже истёк — блэклистить не нужно, он и так невалиден

      await this.revokeAllRefreshTokensByUser(userId)
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
   */
  async isTokenBlacklisted(token: string | null): Promise<boolean> {
    if (!token) {
      return true
    }
    const blacklisted = await this.redis.get(`blacklist:${token}`)
    return !!blacklisted
  }
}
