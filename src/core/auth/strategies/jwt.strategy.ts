import { UsersService } from '@modules/users/services/users.service'
import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { TelegramInitDataInterface } from '@shared/types/telegram-init-data.interface'
import { isValid, parse, ValidateValue } from '@telegram-apps/init-data-node'
import { PinoLogger } from 'nestjs-pino'
import { ExtractJwt, Strategy } from 'passport-jwt'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
    private readonly logger: PinoLogger,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow('JWT_SECRET'),
    })
  }

  public async validate(initData: ValidateValue) {
    const isValidData = isValid(
      initData,
      this.configService.getOrThrow('TELEGRAM_BOT_TOKEN'),
    )

    if (!isValidData) {
      this.logger.error({
        msg: 'Invalid init data',
      })
      throw new UnauthorizedException('Invalid init data')
    }

    const parceInitData = parse(initData) as TelegramInitDataInterface

    if (!parceInitData) {
      this.logger.error({
        msg: 'Invalid init data',
      })
      throw new UnauthorizedException('Invalid init data')
    }

    if (!parceInitData.user) {
      this.logger.error({
        msg: 'Is not user in init data',
      })
      throw new UnauthorizedException('Is not user in init data')
    }

    const user = await this.usersService.getUserByTgId(
      parceInitData.user.id.toString(),
    )

    if (!user) {
      const createdUser = await this.usersService.createUser({
        tgId: parceInitData.user.id.toString(),
        initData: parceInitData,
      })
    } else {
      return user.id
    }
  }
}
