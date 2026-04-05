import { PrismaService } from '@core/prisma/prisma.service'
import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectBot } from 'nestjs-telegraf'
import { Telegraf } from 'telegraf'
import { ChatFromGetChat } from 'telegraf/typings/core/types/typegram'

@Injectable()
export class CheckUsersService implements OnModuleInit {
  private readonly logger = new Logger(CheckUsersService.name)
  private readonly baseGetChatRateLimitPerSecond = 20
  private readonly minGetChatRateLimitPerSecond = 5
  private readonly getChatRecoverySuccessThreshold = 200
  private readonly getChatRetryDelayBufferMs = 500
  private currentGetChatRateLimitPerSecond =
    this.baseGetChatRateLimitPerSecond
  private consecutiveGetChatSuccessCount = 0
  private localNextGetChatAt = 0

  constructor(
    private readonly prisma: PrismaService,
    @InjectBot() private readonly bot: Telegraf,
  ) {}

  async onModuleInit() {
    this.check()
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms))
  }

  private async waitForGetChatSlot(): Promise<void> {
    const now = Date.now()
    const waitMs = Math.max(0, this.localNextGetChatAt - now)
    this.localNextGetChatAt =
      Math.max(this.localNextGetChatAt, now) + this.getCurrentGetChatStepMs()

    if (waitMs > 0) {
      await this.sleep(waitMs)
    }
  }

  private getCurrentGetChatStepMs(): number {
    return Math.ceil(1000 / this.currentGetChatRateLimitPerSecond)
  }

  private getTelegramErrorMeta(error: unknown): {
    errorCode?: number
    description?: string
    retryAfterSeconds?: number
  } {
    if (!error || typeof error !== 'object') {
      return {}
    }

    const response = 'response' in error ? error.response : undefined
    if (!response || typeof response !== 'object') {
      return {}
    }

    const errorCode =
      'error_code' in response && typeof response.error_code === 'number'
        ? response.error_code
        : undefined
    const description =
      'description' in response && typeof response.description === 'string'
        ? response.description
        : undefined
    const retryAfterSeconds =
      'parameters' in response &&
      response.parameters &&
      typeof response.parameters === 'object' &&
      'retry_after' in response.parameters &&
      typeof response.parameters.retry_after === 'number'
        ? response.parameters.retry_after
        : undefined

    return { errorCode, description, retryAfterSeconds }
  }

  private isDefinitelyNotLive(error: unknown): boolean {
    const { errorCode, description } = this.getTelegramErrorMeta(error)
    const normalizedDescription = description?.toLowerCase() ?? ''

    return (
      errorCode === 403 ||
      normalizedDescription.includes('bot was blocked by the user') ||
      normalizedDescription.includes('user is deactivated') ||
      normalizedDescription.includes('chat not found')
    )
  }

  private isRateLimited(error: unknown): boolean {
    const { errorCode, description } = this.getTelegramErrorMeta(error)
    const normalizedDescription = description?.toLowerCase() ?? ''

    return errorCode === 429 || normalizedDescription.includes('too many requests')
  }

  private async handleRateLimit(error: unknown): Promise<void> {
    const previousRate = this.currentGetChatRateLimitPerSecond
    const { retryAfterSeconds, description } = this.getTelegramErrorMeta(error)
    const waitMs =
      Math.max(1, retryAfterSeconds ?? 1) * 1000 + this.getChatRetryDelayBufferMs

    this.currentGetChatRateLimitPerSecond = Math.max(
      this.minGetChatRateLimitPerSecond,
      Math.floor(this.currentGetChatRateLimitPerSecond * 0.7),
    )
    this.consecutiveGetChatSuccessCount = 0
    this.localNextGetChatAt = Date.now() + waitMs

    this.logger.warn(
      `getChat rate limited. PreviousRate=${previousRate}/s, newRate=${this.currentGetChatRateLimitPerSecond}/s, waitMs=${waitMs}, retryAfterSeconds=${
        retryAfterSeconds ?? 'unknown'
      }, error=${description ?? 'Too Many Requests'}`,
    )

    await this.sleep(waitMs)
  }

  private handleGetChatSuccess(): void {
    if (
      this.currentGetChatRateLimitPerSecond >=
      this.baseGetChatRateLimitPerSecond
    ) {
      this.consecutiveGetChatSuccessCount = 0
      return
    }

    this.consecutiveGetChatSuccessCount += 1
    if (
      this.consecutiveGetChatSuccessCount >=
      this.getChatRecoverySuccessThreshold
    ) {
      this.currentGetChatRateLimitPerSecond += 1
      this.consecutiveGetChatSuccessCount = 0

      this.logger.log(
        `getChat rate recovered to ${this.currentGetChatRateLimitPerSecond}/s`,
      )
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
            this.handleGetChatSuccess()
          } catch (error) {
            if (this.isRateLimited(error)) {
              await this.handleRateLimit(error)
              continue
            }

            this.consecutiveGetChatSuccessCount = 0

            const { errorCode, description } = this.getTelegramErrorMeta(error)
            const errorMessage =
              description ??
              (error instanceof Error ? error.message : String(error))

            if (this.isDefinitelyNotLive(error)) {
              await this.prisma.userTelegramData.update({
                where: { id: user.telegramDataId },
                data: { isLive: false },
              })
            } else {
              this.logger.warn(
                `getChat failed without definitive liveness signal: userId=${user.id}, telegramId=${user.telegramId}, errorCode=${
                  errorCode ?? 'unknown'
                }, error=${errorMessage}`,
              )
            }
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
