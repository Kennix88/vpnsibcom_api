import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { JwtPayload } from '@shared/types/jwt-payload.interface'
import { FastifyRequest } from 'fastify'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { LoggerTelegramService } from '../../logger/logger-telegram.service'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly telegramLogger: LoggerTelegramService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: FastifyRequest) => {
          const token = request.cookies?.access_token
          if (token) {
            telegramLogger.debug('JwtStrategy: Token extracted from cookies.')
          }
          return token
        },
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow('JWT_ACCESS_SECRET'),
    })
    this.telegramLogger.debug('JwtStrategy: Initialized.')
  }

  public async validate(payload: JwtPayload) {
    this.telegramLogger.debug(
      `JwtStrategy: Validating payload for user ID: ${payload.sub}`,
    )
    const user = {
      sub: payload.sub,
      telegramId: payload.telegramId,
      role: payload.role,
    }
    this.telegramLogger.debug(
      `JwtStrategy: Payload validated, returning user: ${JSON.stringify(user)}`,
    )
    return user
  }
}
