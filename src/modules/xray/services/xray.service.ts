import { RedisService } from '@core/redis/redis.service'
import { UsersService } from '@modules/users/users.service'
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from 'nestjs-prisma'
import { MarzbanService } from './marzban.service'

@Injectable()
export class XrayService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly userService: UsersService,
    private readonly logger: Logger,
    private readonly redis: RedisService,
    private readonly marzbanService: MarzbanService,
  ) {}

  public async activateFreePlan(telegramId: string) {
    try {
      const user = await this.userService.getResUserByTgId(telegramId)

      if (!user) return false
      if (!user.isFreePlanAvailable) return false
    } catch (e) {
      this.logger.error({
        msg: `Error activating free plan`,
        e,
      })
    }
  }

  // public async createSubscription(
  //   telegramId: string,
  //   period: SubscriptionPeriodEnum,
  //   trialDays?: number,
  // ) {
  //   try {
  //   } catch (e) {
  //     this.logger.error({
  //       msg: `Error creating subscription`,
  //       e,
  //     })
  //   }
  // }

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
