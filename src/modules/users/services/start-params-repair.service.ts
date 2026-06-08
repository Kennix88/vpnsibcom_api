import { Prisma } from '@core/prisma/generated/client'
import { PrismaService } from '@core/prisma/prisma.service'
import { Injectable } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { parseStartParamUtil } from '@shared/utils/parse-start-param.util'
import { PinoLogger } from 'nestjs-pino'

@Injectable()
export class StartParamsRepairService {
  private readonly REPAIR_BATCH = 200
  private fullRepairCompleted = false

  constructor(
    private readonly prismaService: PrismaService,
    private readonly logger: PinoLogger,
  ) {}

  @Cron(process.env.START_PARAMS_REPAIR_CRON || '30 */10 * * * *')
  public async repairStartParamsData() {
    const always = process.env.START_PARAMS_REPAIR_ALWAYS === 'true'
    if (this.fullRepairCompleted && !always) return

    try {
      const [sessions, acquisitions, events] = await Promise.all([
        this.repairAllSessions(),
        this.repairAllAcquisitions(),
        this.repairAllEvents(),
      ])

      this.fullRepairCompleted = true
      this.logger.info({
        msg: 'Start params full repair completed',
        sessionsUpdated: sessions.updated,
        sessionsScanned: sessions.scanned,
        acquisitionsUpdated: acquisitions.updated,
        acquisitionsScanned: acquisitions.scanned,
        eventsUpdated: events.updated,
        eventsScanned: events.scanned,
      })
    } catch (error) {
      this.logger.error({
        msg: 'Start params repair failed',
        stack: error?.stack,
        error,
      })
    }
  }

  private buildParsed(startParams: string) {
    const parsed = parseStartParamUtil(startParams)
    const hasOtherData =
      Object.keys(parsed.params).length > 0 || parsed.none.length > 0

    return {
      source: parsed.params.source ?? null,
      compaingId: parsed.params.compaing ?? null,
      recordId: parsed.params.record ?? null,
      // [БАГ #6] Единый формат: none[] храним как поле `none`,
      // а не спредим с числовыми ключами.
      otherData: hasOtherData
        ? {
            ...parsed.params,
            ...(parsed.none.length > 0 && { none: parsed.none }),
          }
        : null,
    }
  }

  /**
   * [БАГ #8] Глубокое сравнение объектов без зависимости от порядка ключей.
   * JSON.stringify({ a: 1, b: 2 }) !== JSON.stringify({ b: 2, a: 1 }) —
   * это приводило к лишним UPDATE при неизменённых данных.
   */
  private deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true
    if (a === null || b === null) return a === b
    if (typeof a !== typeof b) return false
    if (typeof a !== 'object') return a === b

    const aObj = a as Record<string, unknown>
    const bObj = b as Record<string, unknown>
    const aKeys = Object.keys(aObj).sort()
    const bKeys = Object.keys(bObj).sort()

    if (aKeys.length !== bKeys.length) return false
    for (let i = 0; i < aKeys.length; i++) {
      if (aKeys[i] !== bKeys[i]) return false
      if (!this.deepEqual(aObj[aKeys[i]], bObj[bKeys[i]])) return false
    }
    return true
  }

  private async repairAllSessions(): Promise<{
    scanned: number
    updated: number
  }> {
    let scanned = 0
    let updated = 0
    let cursorId: string | undefined

    while (true) {
      const rows = await this.prismaService.sessions.findMany({
        where: {
          AND: [{ startParams: { not: null } }, { startParams: { not: '' } }],
        },
        select: {
          id: true,
          startParams: true,
          source: true,
          compaingId: true,
          recordId: true,
          otherData: true,
        },
        orderBy: { id: 'asc' },
        ...(cursorId && { cursor: { id: cursorId }, skip: 1 }),
        take: this.REPAIR_BATCH,
      })

      if (rows.length === 0) break
      cursorId = rows[rows.length - 1].id

      // [БАГ #8] Собираем все нужные апдейты и выполняем одной транзакцией
      // вместо N отдельных запросов.
      const updateOps: Prisma.PrismaPromise<unknown>[] = []

      for (const row of rows) {
        scanned++
        const startParams = row.startParams?.trim()
        if (!startParams) continue

        const parsed = this.buildParsed(startParams)
        const currentOtherData =
          row.otherData === null || row.otherData === undefined
            ? null
            : row.otherData

        // [БАГ #8] Используем deepEqual вместо JSON.stringify
        const needsUpdate =
          (row.source ?? null) !== parsed.source ||
          (row.compaingId ?? null) !== parsed.compaingId ||
          (row.recordId ?? null) !== parsed.recordId ||
          !this.deepEqual(currentOtherData, parsed.otherData)

        if (!needsUpdate) continue

        updateOps.push(
          this.prismaService.sessions.update({
            where: { id: row.id },
            data: {
              source: parsed.source,
              compaingId: parsed.compaingId,
              recordId: parsed.recordId,
              otherData:
                parsed.otherData === null
                  ? Prisma.DbNull
                  : (parsed.otherData as Prisma.InputJsonValue),
            },
          }),
        )
        updated++
      }

      if (updateOps.length > 0) {
        await this.prismaService.$transaction(updateOps)
      }
    }

    return { scanned, updated }
  }

  private async repairAllAcquisitions(): Promise<{
    scanned: number
    updated: number
  }> {
    let scanned = 0
    let updated = 0
    let cursorId: string | undefined

    while (true) {
      const rows = await this.prismaService.acquisition.findMany({
        where: {
          OR: [
            {
              AND: [
                { firstStartParams: { not: null } },
                { firstStartParams: { not: '' } },
              ],
            },
            {
              AND: [
                { lastStartParams: { not: null } },
                { lastStartParams: { not: '' } },
              ],
            },
          ],
        },
        select: {
          id: true,
          firstStartParams: true,
          firstSource: true,
          firstCompaingId: true,
          firstRecordId: true,
          firstOtherData: true,
          lastStartParams: true,
          lastSource: true,
          lastCompaingId: true,
          lastRecordId: true,
          lastOtherData: true,
        },
        orderBy: { id: 'asc' },
        ...(cursorId && { cursor: { id: cursorId }, skip: 1 }),
        take: this.REPAIR_BATCH,
      })

      if (rows.length === 0) break
      cursorId = rows[rows.length - 1].id

      // [БАГ #8] Батчевые апдейты
      const updateOps: Prisma.PrismaPromise<unknown>[] = []

      for (const row of rows) {
        scanned++
        const data: Record<string, unknown> = {}
        let needsUpdate = false

        const firstStartParams = row.firstStartParams?.trim()
        if (firstStartParams) {
          const parsed = this.buildParsed(firstStartParams)
          const currentOtherData =
            row.firstOtherData === null || row.firstOtherData === undefined
              ? null
              : row.firstOtherData

          // [БАГ #8] deepEqual вместо JSON.stringify
          if (
            (row.firstSource ?? null) !== parsed.source ||
            (row.firstCompaingId ?? null) !== parsed.compaingId ||
            (row.firstRecordId ?? null) !== parsed.recordId ||
            !this.deepEqual(currentOtherData, parsed.otherData)
          ) {
            data.firstSource = parsed.source
            data.firstCompaingId = parsed.compaingId
            data.firstRecordId = parsed.recordId
            data.firstOtherData =
              parsed.otherData === null
                ? Prisma.DbNull
                : (parsed.otherData as Prisma.InputJsonValue)
            needsUpdate = true
          }
        }

        const lastStartParams = row.lastStartParams?.trim()
        if (lastStartParams) {
          const parsed = this.buildParsed(lastStartParams)
          const currentOtherData =
            row.lastOtherData === null || row.lastOtherData === undefined
              ? null
              : row.lastOtherData

          // [БАГ #8] deepEqual вместо JSON.stringify
          if (
            (row.lastSource ?? null) !== parsed.source ||
            (row.lastCompaingId ?? null) !== parsed.compaingId ||
            (row.lastRecordId ?? null) !== parsed.recordId ||
            !this.deepEqual(currentOtherData, parsed.otherData)
          ) {
            data.lastSource = parsed.source
            data.lastCompaingId = parsed.compaingId
            data.lastRecordId = parsed.recordId
            data.lastOtherData =
              parsed.otherData === null
                ? Prisma.DbNull
                : (parsed.otherData as Prisma.InputJsonValue)
            needsUpdate = true
          }
        }

        if (!needsUpdate) continue

        updateOps.push(
          this.prismaService.acquisition.update({
            where: { id: row.id },
            data,
          }),
        )
        updated++
      }

      if (updateOps.length > 0) {
        await this.prismaService.$transaction(updateOps)
      }
    }

    return { scanned, updated }
  }

  private async repairAllEvents(): Promise<{
    scanned: number
    updated: number
  }> {
    let scanned = 0
    let updated = 0
    let cursorId: string | undefined

    while (true) {
      const rows = await this.prismaService.events.findMany({
        where: {
          AND: [{ startParams: { not: null } }, { startParams: { not: '' } }],
        },
        select: {
          id: true,
          startParams: true,
          source: true,
          compaingId: true,
          recordId: true,
          otherData: true,
        },
        orderBy: { id: 'asc' },
        ...(cursorId && { cursor: { id: cursorId }, skip: 1 }),
        take: this.REPAIR_BATCH,
      })

      if (rows.length === 0) break
      cursorId = rows[rows.length - 1].id

      // [БАГ #8] Батчевые апдейты
      const updateOps: Prisma.PrismaPromise<unknown>[] = []

      for (const row of rows) {
        scanned++
        const startParams = row.startParams?.trim()
        if (!startParams) continue

        const parsed = this.buildParsed(startParams)
        const currentOtherData =
          row.otherData === null || row.otherData === undefined
            ? null
            : row.otherData

        // [БАГ #8] deepEqual вместо JSON.stringify
        const needsUpdate =
          (row.source ?? null) !== parsed.source ||
          (row.compaingId ?? null) !== parsed.compaingId ||
          (row.recordId ?? null) !== parsed.recordId ||
          !this.deepEqual(currentOtherData, parsed.otherData)

        if (!needsUpdate) continue

        updateOps.push(
          this.prismaService.events.update({
            where: { id: row.id },
            data: {
              source: parsed.source,
              compaingId: parsed.compaingId,
              recordId: parsed.recordId,
              otherData:
                parsed.otherData === null
                  ? Prisma.DbNull
                  : (parsed.otherData as Prisma.InputJsonValue),
            },
          }),
        )
        updated++
      }

      if (updateOps.length > 0) {
        await this.prismaService.$transaction(updateOps)
      }
    }

    return { scanned, updated }
  }
}
