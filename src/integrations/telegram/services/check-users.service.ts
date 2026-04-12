import { PrismaService } from '@core/prisma/prisma.service'
import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectBot } from 'nestjs-telegraf'
import { Telegraf } from 'telegraf'

@Injectable()
export class CheckUsersService implements OnModuleInit {
  private readonly logger = new Logger(CheckUsersService.name)
  private readonly baseGetChatRateLimitPerSecond = 20
  private readonly minGetChatRateLimitPerSecond = 5
  private readonly getChatRecoverySuccessThreshold = 200
  private readonly getChatRetryDelayBufferMs = 500
  private currentGetChatRateLimitPerSecond = this.baseGetChatRateLimitPerSecond
  private consecutiveGetChatSuccessCount = 0
  private localNextGetChatAt = 0
  private checkInProgress = false
  private readonly checkLockKey = 'telegram:check-users'
  private readonly batchSize = 500

  constructor(
    private readonly prisma: PrismaService,
    @InjectBot() private readonly bot: Telegraf,
  ) {}

  async onModuleInit() {
    try {
      this.check()
    } catch (error) {
      this.logger.error('Error in CheckUsersService onModuleInit', error)
    }
  }

  private readonly maxExecutionTimeMs = 30 * 60 * 1000 // 30 минут

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

    this.logger.warn(
      `getChat rate limited. PreviousRate=${previousRate}/s, newRate=${
        this.currentGetChatRateLimitPerSecond
      }/s, waitMs=${waitMs}, retryAfterSeconds=${
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

  private async tryAcquireLock(): Promise<boolean> {
    const result = (await this.prisma.$queryRaw<
      { locked: boolean }[]
    >`SELECT pg_try_advisory_lock(hashtext(${this.checkLockKey})) as locked`) as {
      locked: boolean
    }[]
    return result?.[0]?.locked === true
  }

  private async releaseLock(): Promise<void> {
    await this.prisma
      .$queryRaw`SELECT pg_advisory_unlock(hashtext(${this.checkLockKey}))`
  }

  public async secureShuffle(arr) {
    const copy = [...arr]
    for (let i = copy.length - 1; i > 0; i--) {
      const rand = crypto.getRandomValues(new Uint32Array(1))[0]
      const j = rand % (i + 1)
      ;[copy[i], copy[j]] = [copy[j], copy[i]]
    }
    return copy
  }

  @Cron('0 */12 * * * *')
  private async check() {
    if (this.checkInProgress) {
      this.logger.warn('Check users skipped: previous run still in progress')
      return
    }
    const lockAcquired = await this.tryAcquireLock()
    if (!lockAcquired) {
      this.logger.warn('Check users skipped: lock is held by another instance')
      return
    }
    this.checkInProgress = true
    try {
      let lastId: string | undefined
      let processed = 0
      const startTime = Date.now()

      this.logger.log(`Check users started. BatchSize: ${this.batchSize}`)

      while (true) {
        if (Date.now() - startTime > this.maxExecutionTimeMs) {
          this.logger.warn(
            `Check users timeout. Processed: ${processed}, maxExecutionTimeMs: ${this.maxExecutionTimeMs}`,
          )
          break
        }

        const users = await this.prisma.users.findMany({
          where: {
            telegramDataId: {
              not: null,
            },
            ...(lastId && {
              id: {
                gt: lastId,
              },
            }),
          },
          orderBy: {
            id: 'asc',
          },
          take: this.batchSize,
          select: {
            id: true,
            telegramId: true,
            telegramDataId: true,
          },
        })

        if (users.length === 0) break

        const shuffledUsers = await this.secureShuffle(users)

        for (const user of shuffledUsers) {
          await this.waitForGetChatSlot()

          try {
            const sentMessage = await this.bot.telegram.sendMessage(
              user.telegramId,
              'Check live...',
              {
                disable_notification: true,
              },
            )
            this.handleGetChatSuccess()

            // Сразу удаляем сообщение
            try {
              await this.bot.telegram.deleteMessage(
                user.telegramId,
                // @ts-ignore
                sentMessage.message_id,
              )
            } catch (deleteError) {
              this.logger.debug(
                `Failed to delete test message for userId=${user.id}: ${
                  deleteError instanceof Error
                    ? deleteError.message
                    : String(deleteError)
                }`,
              )
            }

            // Сообщение отправлено успешно — пользователь живой
            await this.prisma.userTelegramData.update({
              where: { id: user.telegramDataId },
              data: {
                isLive: true,
              },
            })
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
                `sendMessage failed without definitive liveness signal: userId=${
                  user.id
                }, telegramId=${user.telegramId}, errorCode=${
                  errorCode ?? 'unknown'
                }, error=${errorMessage}`,
              )
            }
          }
        }

        processed += users.length
        lastId = users[users.length - 1].id
        this.logger.log(
          `Check users batch processed: ${users.length}, total: ${processed}`,
        )
      }

      this.logger.log(`Check users finished. Processed: ${processed}`)
    } catch (error) {
      this.logger.error(error)
    } finally {
      this.checkInProgress = false
      try {
        await this.releaseLock()
      } catch (error) {
        this.logger.warn(
          `Check users failed to release lock: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }
    }
  }
}
