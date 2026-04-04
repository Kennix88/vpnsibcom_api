import { PrismaService } from '@core/prisma/prisma.service'
import { RedisService } from '@core/redis/redis.service'
import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectBot } from 'nestjs-telegraf'
import { Telegraf } from 'telegraf'
import { ChatFromGetChat } from 'telegraf/typings/core/types/typegram'

@Injectable()
export class CheckUsersService implements OnModuleInit {
  private readonly logger = new Logger(CheckUsersService.name)
  private readonly getChatRateKeyPrefix = 'tg:check-users:get-chat'
  private readonly getChatRateLimitPerSecond = 10
  private readonly getChatRateRetryDelayMs = 120
  private localNextGetChatAt = 0

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    @InjectBot() private readonly bot: Telegraf,
  ) {}

  async onModuleInit() {
    this.check()
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
        this.logger.warn(
          `Redis rate-limit error: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )

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

  @Cron('0 0 */6 * * *')
  private async check() {
    try {
      const users = await this.prisma.users.findMany()
      this.logger.log(`Check users started. Total: ${users.length}`)
      for (const user of users) {
        try {
          await this.waitForGetChatSlot()

          let chatInfo: ChatFromGetChat | undefined
          try {
            chatInfo = await this.bot.telegram.getChat(user.telegramId)
          } catch (error) {
            chatInfo = undefined
          }

          if (!chatInfo) {
            await this.prisma.userTelegramData.update({
              where: { id: user.telegramDataId },
              data: { isLive: false },
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

          await this.prisma.userTelegramData.update({
            where: { id: user.telegramDataId },
            data: {
              isLive: true,
              birthDay: birth?.day ?? null,
              birthMonth: birth?.month ?? null,
              birthYear: birth?.year ?? null,
              // @ts-ignore
              ...(chatInfo.username && { username: chatInfo.username }),
              // @ts-ignore
              ...(chatInfo.last_name && { lastName: chatInfo.last_name }),
              // @ts-ignore
              ...(chatInfo.first_name && { firstName: chatInfo.first_name }),
            },
          })
        } catch (error) {
          this.logger.error(
            `Check user failed: userId=${user.id}, telegramId=${
              user.telegramId
            }, error=${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }

      this.logger.log(`Check users finished. Processed: ${users.length}`)
    } catch (error) {
      this.logger.error(error)
    }
  }
}
