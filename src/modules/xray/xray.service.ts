import { RedisService } from '@core/redis/redis.service'
import { UsersService } from '@modules/users/users.service'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PinoLogger } from 'nestjs-pino'
import { PrismaService } from 'nestjs-prisma'

@Injectable()
export class XrayService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly userService: UsersService,
    private readonly logger: PinoLogger,
    private readonly redis: RedisService,
  ) {}

  public async greenCheck(ip: string) {
    try {
      const getIp = await this.prismaService.greenList.findUnique({
        where: {
          green: ip,
        },
      })

      return !!getIp
    } catch (e) {
      this.logger.error({
        msg: `Error checking ip`,
        e,
      })
    }
  }
}
