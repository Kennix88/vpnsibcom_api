import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { createReadStream, createWriteStream, promises as fs } from 'fs'
import { readdir } from 'fs/promises'
import { join, parse } from 'path'
import { createGzip } from 'zlib'
import { LoggerTelegramService } from './logger-telegram.service'

@Injectable()
export class LogRotationService {
  private readonly logger = new Logger(LogRotationService.name)
  private readonly logsDir = join(process.cwd(), 'logs')
  private readonly maxAgeDays = 30
  private readonly maxConcurrentRotations = 5

  constructor(private readonly telegram: LoggerTelegramService) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleCron() {
    this.logger.log('→ Starting log rotation…')
    await this.ensureLogsDir()
    try {
      const files = await readdir(this.logsDir)
      const logFiles = files.filter((f) => f.endsWith('.log'))

      await this.processInBatches(
        logFiles,
        this.maxConcurrentRotations,
        async (file) => {
          try {
            await this.rotateAndCompress(file)
          } catch (err) {
            const msg = `❌ Failed to rotate ${file}: ${(err as Error).message}`
            this.logger.error(msg)
            await this.telegram.warn(msg)
          }
        },
      )

      this.logger.log('→ Log rotation completed')
    } catch (err) {
      const msg = `💥 Rotation failed: ${(err as Error).message}`
      this.logger.error(msg)
      await this.telegram.error(msg)
    }
  }

  private async ensureLogsDir() {
    try {
      await fs.access(this.logsDir)
    } catch {
      this.logger.warn('logs/ not found → creating directory')
      await fs.mkdir(this.logsDir, { recursive: true })
    }
  }

  private async rotateAndCompress(fileName: string) {
    const filePath = join(this.logsDir, fileName)
    const { name } = parse(fileName)
    const date = new Date().toISOString().slice(0, 10)
    const tmpArchive = join(this.logsDir, `${name}_${date}.log`)
    const gzArchive = `${tmpArchive}.gz`

    // Шаг 1: Переименование
    await fs.rename(filePath, tmpArchive)

    // Шаг 2: Сжатие
    await new Promise<void>((res, rej) => {
      createReadStream(tmpArchive)
        .pipe(createGzip())
        .pipe(createWriteStream(gzArchive))
        .on('finish', res)
        .on('error', rej)
    })

    // Шаг 3: Удаление временного
    await fs.unlink(tmpArchive)

    // Шаг 4: Новый пустой лог
    await fs.writeFile(filePath, '')

    const archiveMsg = `📦 Archived: ${fileName} → ${name}_${date}.log.gz`
    this.logger.log(archiveMsg)
    await this.telegram.info(archiveMsg)

    // Шаг 5: Удаление старых архивов
    await this.deleteOldArchives(name)
  }

  private async deleteOldArchives(baseName: string) {
    const now = Date.now()
    const threshold = this.maxAgeDays * 86_400_000

    const files = await readdir(this.logsDir)
    const oldFiles = files.filter(
      (f) => f.startsWith(`${baseName}_`) && f.endsWith('.log.gz'),
    )

    for (const file of oldFiles) {
      const fullPath = join(this.logsDir, file)
      try {
        const stat = await fs.stat(fullPath)
        if (now - stat.mtimeMs > threshold) {
          await fs.unlink(fullPath)
          const msg = `🗑️ Deleted old archive: ${file}`
          this.logger.log(msg)
          await this.telegram.debug(msg)
        }
      } catch (err) {
        this.logger.warn(`Could not delete ${file}: ${(err as Error).message}`)
      }
    }
  }

  private async processInBatches<T>(
    items: T[],
    batchSize: number,
    handler: (item: T) => Promise<void>,
  ) {
    const executing: Promise<void>[] = []

    for (const item of items) {
      const p = handler(item)
      executing.push(p)

      if (executing.length >= batchSize) {
        await Promise.race(executing.map((e) => e.catch(() => undefined)))
        // Remove settled promises
        for (let i = executing.length - 1; i >= 0; i--) {
          if (executing[i].then) {
            executing.splice(i, 1)
          }
        }
      }
    }

    await Promise.allSettled(executing)
  }
}
