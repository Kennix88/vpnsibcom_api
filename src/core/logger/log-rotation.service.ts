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

  constructor(private readonly telegram: LoggerTelegramService) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleCron() {
    this.logger.log('→ Starting log rotation…')
    await this.ensureLogsDir()
    try {
      const files = await readdir(this.logsDir)
      for (const file of files.filter((f) => f.endsWith('.log'))) {
        await this.rotateAndCompress(file)
      }
      this.logger.log('→ Log rotation completed')
    } catch (err) {
      const msg = (err as Error).message
      this.logger.error('Rotation failed', msg)
      await this.telegram.error(`Rotation error: ${msg}`)
    }
  }

  private async ensureLogsDir() {
    try {
      await fs.access(this.logsDir)
    } catch {
      this.logger.log('logs/ not found → creating directory')
      await fs.mkdir(this.logsDir, { recursive: true })
    }
  }

  private async rotateAndCompress(fileName: string) {
    const filePath = join(this.logsDir, fileName)
    const { name } = parse(fileName)
    const date = new Date().toISOString().slice(0, 10)
    const tmpArchive = join(this.logsDir, `${name}_${date}.log`)
    const gzArchive = `${tmpArchive}.gz`

    // 1) Переименовываем текущий .log → временный файл
    await fs.rename(filePath, tmpArchive)

    // 2) Сжимаем временный файл в .gz
    await new Promise<void>((res, rej) => {
      createReadStream(tmpArchive)
        .pipe(createGzip())
        .pipe(createWriteStream(gzArchive))
        .on('finish', res)
        .on('error', rej)
    })

    // 3) Удаляем временный несжатый файл
    await fs.unlink(tmpArchive)

    // 4) Очищаем оригинальный .log (создаётся пустой новый)
    await fs.writeFile(filePath, '')

    const info = `Archived ${fileName} → ${name}_${date}.log.gz`
    this.logger.log(info)
    await this.telegram.info(info)

    // 5) Удаляем архивы старше maxAgeDays
    const now = Date.now()
    const thresh = this.maxAgeDays * 86400_000
    const archives = (await readdir(this.logsDir)).filter(
      (f) => f.startsWith(name + '_') && f.endsWith('.log.gz'),
    )

    for (const arc of archives) {
      const stat = await fs.stat(join(this.logsDir, arc))
      if (now - stat.mtimeMs > thresh) {
        await fs.unlink(join(this.logsDir, arc))
        const delMsg = `Deleted old archive ${arc}`
        this.logger.log(delMsg)
        await this.telegram.info(delMsg)
      }
    }
  }
}
