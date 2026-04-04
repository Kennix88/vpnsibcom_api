import { RedisService } from '@core/redis/redis.service'
import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import axios from 'axios'
import * as fs from 'fs'
import { join } from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { GeoService } from './geo.service'

@Injectable()
export class GeoUpdaterService implements OnModuleInit {
  private readonly logger = new Logger(GeoUpdaterService.name)

  private readonly base =
    process.env.GEO_MIRROR_BASE ||
    'https://github.com/P3TERX/GeoLite.mmdb/releases/latest/download'

  private readonly dir = join(process.cwd(), 'data/geo')
  private readonly lockKey = 'geo-updater-lock'
  private readonly lockTtlSeconds = 10 * 60

  private readonly files = [
    { name: 'GeoLite2-Country.mmdb', url: 'GeoLite2-Country.mmdb' },
    { name: 'GeoLite2-City.mmdb', url: 'GeoLite2-City.mmdb' },
    { name: 'GeoLite2-ASN.mmdb', url: 'GeoLite2-ASN.mmdb' },
  ]

  private updating = false

  constructor(
    private readonly geoService: GeoService,
    private readonly redisService: RedisService,
  ) {}

  async onModuleInit() {
    // Geo refresh must not block the HTTP server startup.
    void this.updateAll().catch((error) => {
      this.logger.error(
        'Initial geo update failed: ' +
          (error?.stack ?? error?.message ?? String(error)),
      )
    })
  }

  @Cron(process.env.GEO_UPDATE_CRON || '0 3 * * 1')
  async scheduled() {
    // jitter to avoid cluster sync
    await new Promise((r) => setTimeout(r, Math.random() * 30_000))
    await this.updateAll()
  }

  private async withLock<T>(fn: () => Promise<T>): Promise<T | null> {
    const got = await this.redisService.setWithExpiryNx(
      this.lockKey,
      '1',
      this.lockTtlSeconds,
    )

    if (!got) {
      this.logger.log('Another instance holds geo update lock — skipping')
      return null
    }

    try {
      return await fn()
    } finally {
      try {
        await this.redisService.del(this.lockKey)
      } catch (e) {
        this.logger.error('Failed to release geo lock: ' + String(e))
      }
    }
  }

  async updateAll() {
    if (this.updating) {
      this.logger.warn('Geo update already running locally — skipping')
      return
    }

    this.updating = true

    try {
      return await this.withLock(async () => {
        this.logger.log('Starting geo update')

        if (!fs.existsSync(this.dir)) {
          fs.mkdirSync(this.dir, { recursive: true })
        }

        // tmp inside same FS for atomic rename
        const tmp = fs.mkdtempSync(join(this.dir, '.tmp-'))

        try {
          for (const f of this.files) {
            await this.fetchFile(f.url, join(tmp, f.name))
          }

          for (const f of this.files) {
            const src = join(tmp, f.name)

            if (!fs.existsSync(src)) {
              this.logger.warn(`${f.name} not downloaded — skipping`)
              continue
            }

            const tmpFinal = join(this.dir, `${f.name}.tmp`)
            const final = join(this.dir, f.name)

            fs.copyFileSync(src, tmpFinal)
            fs.renameSync(tmpFinal, final)

            this.logger.log(`Replaced ${f.name}`)
          }

          await this.geoService.reloadAll()

          fs.writeFileSync(
            join(this.dir, '.last_update'),
            new Date().toISOString(),
            'utf-8',
          )

          this.logger.log('Geo update finished successfully')
        } catch (e) {
          this.logger.error(
            'Geo update error: ' + (e?.stack ?? e?.message ?? e),
          )
        } finally {
          try {
            fs.rmSync(tmp, { recursive: true, force: true })
          } catch (e) {
            this.logger.error(`Failed to remove tmp dir ${tmp}: ${String(e)}`)
          }
        }
      })
    } finally {
      this.updating = false
    }
  }

  private async fetchFile(urlPath: string, outPath: string): Promise<void> {
    const url = `${this.base}/${urlPath}`
    this.logger.log(`Downloading ${url}`)

    const response = await axios.get(url, {
      responseType: 'stream',
      timeout: 120_000,
      maxRedirects: 5,
      validateStatus: (status) => status >= 200 && status < 300,
    })

    const contentLength = Number(response.headers['content-length'] || 0)

    if (contentLength && contentLength < 100_000) {
      throw new Error(
        `Downloaded file too small (${contentLength} bytes) — suspicious`,
      )
    }

    const stream = response.data as Readable

    await pipeline(stream, fs.createWriteStream(outPath))

    this.logger.log(`Downloaded ${urlPath}`)
  }
}
