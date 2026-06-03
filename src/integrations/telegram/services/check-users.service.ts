import { Prisma } from '@core/prisma/generated/client'
import { PrismaService } from '@core/prisma/prisma.service'
import {
  GraspilService,
  GraspilUser,
} from '@modules/ads/services/graspil.service'
import { UsersService } from '@modules/users/services/users.service'
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { DefaultEnum } from '@shared/enums/default.enum'
import { Client } from 'pg'

@Injectable()
export class CheckUsersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CheckUsersService.name)
  private checkInProgress = false
  private readonly checkLockKey = 'telegram:check-users'
  private readonly batchSize = 500
  private lockClient: Client | null = null
  private nextRunOffset = 0
  private readonly maxExecutionTimeMs = 30 * 60 * 1000 // 30 минут
  private supportedLanguageCodes: Set<string> | null = null

  constructor(
    private readonly prisma: PrismaService,
    private readonly graspilService: GraspilService,
    private readonly usersService: UsersService,
  ) {}

  async onModuleInit() {
    void this.check().catch((error) => {
      this.logger.error('Error in CheckUsersService onModuleInit', error)
    })
  }

  async onModuleDestroy() {
    await this.releaseLock()
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

  private toBoolean(value: boolean | number | null | undefined): boolean {
    return value === true || value === 1
  }

  private getTelegramDataUpdate(
    graspilUser: GraspilUser,
  ): Prisma.UserTelegramDataUpdateInput {
    return {
      isLive: graspilUser.user_status === 0,
      isBot: this.toBoolean(graspilUser.is_bot),
      isPremium: this.toBoolean(graspilUser.is_premium),
      gender: graspilUser.gender,
      verified: graspilUser.verified,
      scam: graspilUser.scam,
      fake: graspilUser.fake,
      stargiftsCount: graspilUser.stargifts_count,
      personalChannelId:
        graspilUser.personal_channel_id === null ||
        graspilUser.personal_channel_id === undefined
          ? null
          : String(graspilUser.personal_channel_id),
    }
  }

  private getBirthData(graspilUser: GraspilUser):
    | {
        year?: number
        month: number
        day: number
      }
    | undefined {
    if (!graspilUser.birth_day || !graspilUser.birth_month) {
      return undefined
    }

    return {
      day: graspilUser.birth_day,
      month: graspilUser.birth_month,
      ...(graspilUser.birth_year && { year: graspilUser.birth_year }),
    }
  }

  private async getSupportedLanguageCode(
    languageCode: string | null,
  ): Promise<string> {
    if (!languageCode) return 'ru'

    if (!this.supportedLanguageCodes) {
      const languages = await this.prisma.language.findMany({
        select: {
          iso6391: true,
        },
      })
      this.supportedLanguageCodes = new Set(
        languages.map((language) => language.iso6391),
      )
    }

    return this.supportedLanguageCodes.has(languageCode) ? languageCode : 'ru'
  }

  private async createMissingUserFromGraspil(
    graspilUser: GraspilUser,
  ): Promise<boolean> {
    const telegramId = String(graspilUser.user_id)

    try {
      const birth = this.getBirthData(graspilUser)
      const languageCode = await this.getSupportedLanguageCode(
        graspilUser.language_code,
      )
      const country = graspilUser.geo?.countryCode ?? graspilUser.country

      await this.usersService.createUser({
        telegramId,
        userInBotData: {
          id: graspilUser.user_id,
          is_bot: this.toBoolean(graspilUser.is_bot),
          first_name: graspilUser.first_name ?? 'ANONIM',
          ...(graspilUser.last_name && { last_name: graspilUser.last_name }),
          ...(graspilUser.username && { username: graspilUser.username }),
          language_code: languageCode,
          is_premium: this.toBoolean(graspilUser.is_premium),
        },
        ...(country && { country }),
        ...(birth && { birth }),
      })

      const createdUser = await this.prisma.users.findUnique({
        where: { telegramId },
        select: { telegramDataId: true },
      })

      if (createdUser?.telegramDataId) {
        await this.prisma.userTelegramData.update({
          where: { id: createdUser.telegramDataId },
          data: this.getTelegramDataUpdate(graspilUser),
        })
      }

      return true
    } catch (error) {
      this.logger.warn(
        `Failed to create missing user from Graspil: telegramId=${telegramId}, error=${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      return false
    }
  }

  @Cron('0 0 0 * * *')
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
      let offset = this.nextRunOffset
      let processed = 0
      let updated = 0
      let created = 0
      let createFailed = 0
      let timedOut = false
      const startTime = Date.now()

      this.logger.log(
        `Check users started via Graspil. BatchSize: ${this.batchSize}, offset: ${offset}`,
      )

      while (true) {
        if (Date.now() - startTime > this.maxExecutionTimeMs) {
          timedOut = true
          break
        }

        const graspilUsers = await this.graspilService.getUsers({
          limit: this.batchSize,
          offset,
        })
        if (graspilUsers.rows.length === 0) break

        const users = await this.prisma.users.findMany({
          where: {
            telegramId: {
              in: graspilUsers.rows.map((user) => String(user.user_id)),
            },
          },
          select: {
            telegramId: true,
            telegramDataId: true,
          },
        })
        const usersByTelegramId = new Map(
          users
            .filter((user) => user.telegramDataId)
            .map((user) => [user.telegramId, user.telegramDataId]),
        )
        let processedInBatch = 0
        let updatedInBatch = 0

        for (const graspilUser of graspilUsers.rows) {
          if (Date.now() - startTime > this.maxExecutionTimeMs) {
            timedOut = true
            break
          }

          const telegramDataId = usersByTelegramId.get(
            String(graspilUser.user_id),
          )
          if (!telegramDataId) {
            if (await this.createMissingUserFromGraspil(graspilUser)) {
              created += 1
            } else {
              createFailed += 1
            }
            processedInBatch += 1
            continue
          }

          await this.prisma.userTelegramData.update({
            where: { id: telegramDataId },
            data: this.getTelegramDataUpdate(graspilUser),
          })

          updatedInBatch += 1
          processedInBatch += 1
        }

        processed += processedInBatch
        updated += updatedInBatch
        this.logger.log(
          `Check users Graspil page processed: offset=${offset}, processed=${processedInBatch}/${graspilUsers.rows.length}, updated=${updatedInBatch}, created=${created}, createFailed=${createFailed}, total=${processed}`,
        )
        if (timedOut) break
        offset += 1

        if (offset * this.batchSize >= graspilUsers.count) break
      }

      if (timedOut) {
        this.nextRunOffset = offset
        this.logger.warn(
          `Check users timeout. Processed: ${processed}, updated: ${updated}, created: ${created}, createFailed: ${createFailed}, maxExecutionTimeMs: ${this.maxExecutionTimeMs}, nextOffset: ${this.nextRunOffset}`,
        )
      } else {
        this.nextRunOffset = 0
      }
      this.logger.log(
        `Check users finished via Graspil. Processed: ${processed}, updated: ${updated}, created: ${created}, createFailed: ${createFailed}, nextOffset: ${this.nextRunOffset}`,
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
