import { PrismaService } from '@core/prisma/prisma.service'
import { RedisService } from '@core/redis/redis.service'
import { UsersService } from '@modules/users/services/users.service'
import { Injectable, OnModuleInit } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { DefaultEnum } from '@shared/enums/default.enum'
import axios from 'axios'
import { PinoLogger } from 'nestjs-pino'
import { InjectBot } from 'nestjs-telegraf'
import { Telegraf } from 'telegraf'
import { ChatFromGetChat } from 'telegraf/typings/core/types/typegram'

@Injectable()
export class ImportUsersService implements OnModuleInit {
  private readonly getChatRateKeyPrefix = 'tg:import-users:get-chat'
  private readonly getChatRateLimitPerSecond = 10
  private readonly getChatRateRetryDelayMs = 120
  private localNextGetChatAt = 0

  constructor(
    @InjectBot() private readonly bot: Telegraf,
    private readonly logger: PinoLogger,
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly usersService: UsersService,
  ) {}

  async onModuleInit() {
    this.importUsers()
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms))
  }

  private async waitForGetChatSlot(): Promise<void> {
    while (true) {
      const secondBucket = Math.floor(Date.now() / 1000)
      const key = `${this.getChatRateKeyPrefix}:${secondBucket}`

      try {
        const current = await this.redisService.incr(key)
        if (current === 1) {
          await this.redisService.expire(key, 2)
        }

        if (current <= this.getChatRateLimitPerSecond) return
      } catch (error) {
        this.logger.warn({
          msg: 'Redis rate-limit error during import users',
          error,
        })

        const stepMs = Math.ceil(1000 / this.getChatRateLimitPerSecond)
        const now = Date.now()
        const waitMs = Math.max(0, this.localNextGetChatAt - now)
        this.localNextGetChatAt =
          Math.max(this.localNextGetChatAt, now) + stepMs

        if (waitMs > 0) {
          await this.sleep(waitMs)
        }

        return
      }

      await this.sleep(this.getChatRateRetryDelayMs)
    }
  }

  private validateImportUsersFile(
    fileContent: string,
    contentType?: string,
  ): string[] {
    if (typeof fileContent !== 'string') {
      throw new Error('Import users file is not a text file')
    }

    if (
      contentType &&
      !contentType.includes('text/plain') &&
      !contentType.includes('application/octet-stream')
    ) {
      throw new Error(`Invalid import users content-type: ${contentType}`)
    }

    const lines = fileContent
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)

    if (!lines.length) {
      throw new Error('Import users file is empty')
    }

    const invalidIds = lines.filter((line) => !/^\d+$/.test(line))
    if (invalidIds.length > 0) {
      throw new Error(
        `Import users file contains invalid Telegram IDs: ${invalidIds
          .slice(0, 10)
          .join(', ')}`,
      )
    }

    return [...new Set(lines)]
  }

  @Cron('0 0 0 * * *')
  public async importUsers() {
    try {
      const settings = await this.prisma.settings.findFirst({
        where: {
          key: DefaultEnum.DEFAULT,
        },
      })
      const importUsersUrl = settings?.importUsersUrl
      if (!importUsersUrl) return

      const response = await axios.get<string>(importUsersUrl, {
        responseType: 'text',
      })
      const users = this.validateImportUsersFile(
        response.data,
        response.headers['content-type'],
      )

      this.logger.info({
        msg: 'Import users started',
        total: users.length,
      })

      for (const user of users) {
        try {
          const getUser = await this.usersService.getResUserByTgId(user)
          if (getUser) continue

          await this.waitForGetChatSlot()

          let chatInfo: ChatFromGetChat | undefined
          try {
            chatInfo = await this.bot.telegram.getChat(user)
          } catch (error) {
            this.logger.warn({
              msg: `Telegram user info unavailable during import`,
              telegramId: user,
              error,
            })
            continue
          }

          const birth = chatInfo &&
            // @ts-ignore
            chatInfo.birthdate && {
              // @ts-ignore
              year: chatInfo.birthdate.year ?? null,
              // @ts-ignore
              month: chatInfo.birthdate.month ?? null,
              // @ts-ignore
              day: chatInfo.birthdate.day ?? null,
            }

          await this.usersService.createUser({
            telegramId: user.toString(),
            userInBotData: {
              id: Number(user),
              is_bot: false,
              // @ts-ignore
              ...(chatInfo.username && { username: chatInfo.username }),
              // @ts-ignore
              lastName: chatInfo.last_name ? chatInfo.last_name : 'Anonimus',
              // @ts-ignore
              firstName: chatInfo.first_name ? chatInfo.first_name : 'Anonim',
            },
            ...(birth && { birth }),
          })

          this.logger.info({
            msg: 'Import user finished',
            telegramId: user,
          })
        } catch (error) {
          this.logger.error({
            msg: 'Error import user',
            telegramId: user,
            error,
          })
        }
      }

      this.logger.info({
        msg: 'Import users finished',
        total: users.length,
      })
    } catch (e) {
      this.logger.error({
        msg: `Error import users`,
        e,
      })
    }
  }
}
