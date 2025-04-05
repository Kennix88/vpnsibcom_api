import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PinoLogger } from 'nestjs-pino'
import { PrismaService } from 'nestjs-prisma'

@Injectable()
export class UsersService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly logger: PinoLogger,
  ) {}

  public async getUserByTgId(tgId: string) {
    try {
      return await this.prismaService.users.findUnique({
        where: {
          telegramId: tgId,
        },
      })
    } catch (e) {
      this.logger.error({
        msg: `Error while getting user by tgId`,
        e,
      })
    }
  }
}
