import { PrismaService } from '@core/prisma/prisma.service'
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
  private readonly baseGetChatRateLimitPerSecond = 20
  private readonly minGetChatRateLimitPerSecond = 5
  private readonly getChatRecoverySuccessThreshold = 200
  private readonly getChatRetryDelayBufferMs = 500
  private currentGetChatRateLimitPerSecond = this.baseGetChatRateLimitPerSecond
  private consecutiveGetChatSuccessCount = 0
  private localNextGetChatAt = 0
  private importInProgress = false
  private readonly importLockKey = 'telegram:import-users'
  private readonly batchSize = 200

  constructor(
    @InjectBot() private readonly bot: Telegraf,
    private readonly logger: PinoLogger,
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  async onModuleInit() {
    this.importUsers()
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

  private isRateLimited(error: unknown): boolean {
    const { errorCode, description } = this.getTelegramErrorMeta(error)
    const normalizedDescription = description?.toLowerCase() ?? ''

    return (
      errorCode === 429 || normalizedDescription.includes('too many requests')
    )
  }

  private async handleRateLimit(error: unknown): Promise<void> {
    const previousRate = this.currentGetChatRateLimitPerSecond
    const { retryAfterSeconds, description } = this.getTelegramErrorMeta(error)
    const waitMs =
      Math.max(1, retryAfterSeconds ?? 1) * 1000 +
      this.getChatRetryDelayBufferMs

    this.currentGetChatRateLimitPerSecond = Math.max(
      this.minGetChatRateLimitPerSecond,
      Math.floor(this.currentGetChatRateLimitPerSecond * 0.7),
    )
    this.consecutiveGetChatSuccessCount = 0
    this.localNextGetChatAt = Date.now() + waitMs

    this.logger.warn({
      msg: 'Telegram getChat rate limited during import',
      previousRatePerSecond: previousRate,
      newRatePerSecond: this.currentGetChatRateLimitPerSecond,
      waitMs,
      retryAfterSeconds,
      description,
    })

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

      this.logger.info({
        msg: 'Telegram getChat rate recovered during import',
        ratePerSecond: this.currentGetChatRateLimitPerSecond,
      })
    }
  }

  private async tryAcquireLock(): Promise<boolean> {
    const result = (await this.prisma.$queryRaw<
      { locked: boolean }[]
    >`SELECT pg_try_advisory_lock(hashtext(${this.importLockKey})) as locked`) as {
      locked: boolean
    }[]
    return result?.[0]?.locked === true
  }

  private async releaseLock(): Promise<void> {
    await this.prisma
      .$queryRaw`SELECT pg_advisory_unlock(hashtext(${this.importLockKey}))`
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

  @Cron('0 0 * * * *')
  public async importUsers() {
    if (this.importInProgress) {
      this.logger.warn({
        msg: 'Import users skipped: previous run still in progress',
      })
      return
    }
    const lockAcquired = await this.tryAcquireLock()
    if (!lockAcquired) {
      this.logger.warn({
        msg: 'Import users skipped: lock is held by another instance',
      })
      return
    }
    this.importInProgress = true
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

      for (let index = 0; index < users.length; index += this.batchSize) {
        const batch = users.slice(index, index + this.batchSize)
        const existing = await this.prisma.users.findMany({
          where: {
            telegramId: {
              in: batch,
            },
          },
          select: {
            telegramId: true,
          },
        })
        const existingSet = new Set(existing.map((item) => item.telegramId))

        for (const user of batch) {
          if (existingSet.has(user)) continue

          try {
            await this.waitForGetChatSlot()

            let chatInfo: ChatFromGetChat | undefined
            try {
              chatInfo = await this.bot.telegram.getChat(user)
              this.handleGetChatSuccess()
            } catch (error) {
              if (this.isRateLimited(error)) {
                await this.handleRateLimit(error)
                continue
              }

              this.consecutiveGetChatSuccessCount = 0
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
                last_name: chatInfo.last_name ? chatInfo.last_name : 'Anonimus',
                // @ts-ignore
                first_name: chatInfo.first_name
                  ? // @ts-ignore
                    chatInfo.first_name
                  : 'Anonim',
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
    } finally {
      this.importInProgress = false
      try {
        await this.releaseLock()
      } catch (error) {
        this.logger.warn({
          msg: 'Import users failed to release lock',
          error,
        })
      }
    }
  }
}
