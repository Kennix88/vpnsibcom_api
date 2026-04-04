import { Controller, Get } from '@nestjs/common'
import * as fs from 'fs'
import { join } from 'path'

@Controller('geo')
export class GeoController {
  private readonly dir = join(process.cwd(), 'data/geo')

  private readonly files = {
    country: 'GeoLite2-Country.mmdb',
    city: 'GeoLite2-City.mmdb',
    asn: 'GeoLite2-ASN.mmdb',
  }

  @Get('health')
  health() {
    const checkFile = (file: string) => {
      const p = join(this.dir, file)
      if (!fs.existsSync(p)) return { exists: false, size: 0 }

      try {
        const stat = fs.statSync(p)
        return { exists: true, size: stat.size }
      } catch {
        return { exists: false, size: 0 }
      }
    }

    const country = checkFile(this.files.country)
    const city = checkFile(this.files.city)
    const asn = checkFile(this.files.asn)

    let lastUpdate: string | null = null
    let ageHours: number | null = null

    try {
      const raw = fs
        .readFileSync(join(this.dir, '.last_update'), 'utf-8')
        .trim()

      const date = new Date(raw)

      if (!isNaN(date.getTime())) {
        lastUpdate = raw
        ageHours = (Date.now() - date.getTime()) / (1000 * 60 * 60)
      }
    } catch {
      lastUpdate = null
    }

    const allExist = country.exists && city.exists && asn.exists

    const allLargeEnough =
      country.size > 100_000 && city.size > 100_000 && asn.size > 50_000

    let status: 'ok' | 'degraded' | 'broken'

    if (allExist && allLargeEnough) {
      status = 'ok'
    } else if (country.exists || city.exists || asn.exists) {
      status = 'degraded'
    } else {
      status = 'broken'
    }

    return {
      status,
      ok: status === 'ok',

      files: {
        country,
        city,
        asn,
      },

      lastUpdate,
      ageHours,
    }
  }
}
