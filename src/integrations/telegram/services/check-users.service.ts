import { PrismaService } from '@core/prisma/prisma.service'
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { DefaultEnum } from '@shared/enums/default.enum'
import { InjectBot } from 'nestjs-telegraf'
import { Client } from 'pg'
import { Telegraf } from 'telegraf'

@Injectable()
export class CheckUsersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CheckUsersService.name)
  private readonly baseGetChatRateLimitPerSecond = 10
  private readonly minGetChatRateLimitPerSecond = 3
  private readonly getChatRecoverySuccessThreshold = 200
  private readonly getChatRetryDelayBufferMs = 500
  private readonly getChatSlotJitterMs = 120
  private readonly maxDetailedWarningsPerRun = 20
  private currentGetChatRateLimitPerSecond = this.baseGetChatRateLimitPerSecond
  private consecutiveGetChatSuccessCount = 0
  private localNextGetChatAt = 0
  private checkInProgress = false
  private readonly checkLockKey = 'telegram:check-users'
  private readonly batchSize = 500
  private lockClient: Client | null = null
  private nextRunStartAfterId: string | undefined

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

  async onModuleDestroy() {
    await this.releaseLock()
  }

  private readonly maxExecutionTimeMs = 30 * 60 * 1000 // 30 минут

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms))
  }

  private async waitForGetChatSlot(): Promise<void> {
    const now = Date.now()
    const jitterMs =
      crypto.getRandomValues(new Uint32Array(1))[0] % this.getChatSlotJitterMs
    const waitMs = Math.max(0, this.localNextGetChatAt - now) + jitterMs
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
    if (this.lockClient) return true

    const connectionString = process.env.POSTGRES_URL
    if (!connectionString) {
      throw new Error('POSTGRES_URL is not defined')
    }

    const client = new Client({ connectionString })
    await client.connect()

    try {
      const result = await client.query<{ locked: boolean }>(
        'SELECT pg_try_advisory_lock(hashtext($1)) as locked',
        [this.checkLockKey],
      )

      if (result.rows[0]?.locked === true) {
        this.lockClient = client
        return true
      }

      await client.end()
      return false
    } catch (error) {
      await client.end()
      throw error
    }
  }

  private async releaseLock(): Promise<void> {
    if (!this.lockClient) return

    const client = this.lockClient
    this.lockClient = null

    try {
      await client.query('SELECT pg_advisory_unlock(hashtext($1))', [
        this.checkLockKey,
      ])
    } finally {
      await client.end()
    }
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
      this.logger.debug('Check users skipped: previous run still in progress')
      return
    }
    const lockAcquired = await this.tryAcquireLock()
    if (!lockAcquired) {
      this.logger.debug('Check users skipped: lock is held by another instance')
      return
    }
    this.checkInProgress = true
    try {
      const settings = await this.prisma.settings.findFirst({
        where: {
          key: DefaultEnum.DEFAULT,
        },
      })
      if (!settings?.isActiveCheckUsers) return
      let lastId: string | undefined = this.nextRunStartAfterId
      let lastProcessedIdInRun: string | undefined = this.nextRunStartAfterId
      let processed = 0
      let nonDefinitiveErrors = 0
      let rateLimitCount = 0
      let timedOut = false
      const startTime = Date.now()

      this.logger.log(
        `Check users started. BatchSize: ${this.batchSize}, startAfterId: ${
          this.nextRunStartAfterId ?? 'none'
        }`,
      )

      while (true) {
        if (Date.now() - startTime > this.maxExecutionTimeMs) {
          timedOut = true
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
        let processedInBatch = 0

        for (const user of shuffledUsers) {
          if (Date.now() - startTime > this.maxExecutionTimeMs) {
            timedOut = true
            break
          }

          if (!user.telegramDataId) continue

          let retryCurrentUser = true

          while (retryCurrentUser) {
            if (Date.now() - startTime > this.maxExecutionTimeMs) {
              timedOut = true
              break
            }

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

              retryCurrentUser = false
            } catch (error) {
              if (this.isRateLimited(error)) {
                rateLimitCount += 1
                await this.handleRateLimit(error)
                continue
              }

              this.consecutiveGetChatSuccessCount = 0

              const { errorCode, description } =
                this.getTelegramErrorMeta(error)
              const errorMessage =
                description ??
                (error instanceof Error ? error.message : String(error))

              if (this.isDefinitelyNotLive(error)) {
                await this.prisma.userTelegramData.update({
                  where: { id: user.telegramDataId },
                  data: { isLive: false },
                })
              } else {
                nonDefinitiveErrors += 1
                if (
                  nonDefinitiveErrors <= this.maxDetailedWarningsPerRun ||
                  nonDefinitiveErrors % 100 === 0
                ) {
                  this.logger.warn(
                    `sendMessage failed without definitive liveness signal: userId=${
                      user.id
                    }, telegramId=${user.telegramId}, errorCode=${
                      errorCode ?? 'unknown'
                    }, error=${errorMessage}`,
                  )
                }
              }

              retryCurrentUser = false
            }
          }

          if (timedOut) break
          lastProcessedIdInRun = user.id
          processedInBatch += 1
        }

        processed += processedInBatch
        lastId = users[users.length - 1].id
        this.logger.log(
          `Check users batch processed: ${processedInBatch}/${users.length}, total: ${processed}`,
        )
        if (timedOut) break
      }

      if (timedOut) {
        this.nextRunStartAfterId = lastProcessedIdInRun
        this.logger.warn(
          `Check users timeout. Processed: ${processed}, maxExecutionTimeMs: ${
            this.maxExecutionTimeMs
          }, nextStartAfterId: ${this.nextRunStartAfterId ?? 'none'}`,
        )
      } else {
        this.nextRunStartAfterId = undefined
      }
      this.logger.log(
        `Check users finished. Processed: ${processed}, rateLimits: ${rateLimitCount}, nonDefinitiveErrors: ${nonDefinitiveErrors}, nextStartAfterId: ${
          this.nextRunStartAfterId ?? 'none'
        }`,
      )
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
