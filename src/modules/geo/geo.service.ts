import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import * as fs from 'fs'
import * as maxmind from 'maxmind'
import { join } from 'path'

@Injectable()
export class GeoService implements OnModuleInit {
  private readonly logger = new Logger(GeoService.name)
  private countryReader: maxmind.Reader<Record<string, any>> | null = null
  private cityReader: maxmind.Reader<Record<string, any>> | null = null
  private asnReader: maxmind.Reader<Record<string, any>> | null = null

  private readonly dir = join(process.cwd(), 'data/geo')

  async onModuleInit() {
    this.ensureDirExists()
    await this.loadAllIfExists()
  }

  private ensureDirExists() {
    try {
      if (!fs.existsSync(this.dir)) {
        fs.mkdirSync(this.dir, { recursive: true })
        this.logger.log(`Created geo dir: ${this.dir}`)
      }
    } catch (e) {
      this.logger.warn(`Failed to ensure geo dir exists: ${String(e)}`)
    }
  }

  // try to close readers (if supported) to free resources
  private async closeReaders() {
    const closeIf = (r: maxmind.Reader<Record<string, any>> | null) => {
      try {
        // Reader may expose close(); guard against missing typings at runtime
        const c = (r as any)?.close
        if (typeof c === 'function') c.call(r)
      } catch (e) {
        this.logger.warn(`Failed to close reader: ${String(e)}`)
      }
    }
    closeIf(this.countryReader)
    closeIf(this.cityReader)
    closeIf(this.asnReader)
  }

  private async loadIfExists(
    file: string,
  ): Promise<maxmind.Reader<Record<string, any>> | null> {
    const p = join(this.dir, file)
    if (!fs.existsSync(p)) return null
    try {
      return await maxmind.open<Record<string, any>>(p)
    } catch (e) {
      this.logger.warn(`Failed to open ${file}: ${e?.message ?? String(e)}`)
      return null
    }
  }

  private async loadAllIfExists() {
    // close previous readers if any
    await this.closeReaders()

    // open new ones (order: independent)
    this.countryReader = await this.loadIfExists('GeoLite2-Country.mmdb')
    this.cityReader = await this.loadIfExists('GeoLite2-City.mmdb')
    this.asnReader = await this.loadIfExists('GeoLite2-ASN.mmdb')
  }

  // call after files replaced
  async reloadAll() {
    await this.loadAllIfExists()
    this.logger.log('Reloaded Geo readers')
  }

  getCountry(ip: string): string | null {
    if (!this.countryReader) return null
    try {
      const r = this.countryReader.get(ip)
      // guard against missing iso_code
      const iso = r?.country?.iso_code
      return typeof iso === 'string' ? iso.toLowerCase() : null
    } catch (e) {
      this.logger.warn(`getCountry failed for ip=${ip}: ${String(e)}`)
      return null
    }
  }

  getCity(
    ip: string,
  ): { country?: string; city?: string; lat?: number; lon?: number } | null {
    if (!this.cityReader) return null
    try {
      const r = this.cityReader.get(ip)
      if (!r) return null
      const country =
        typeof r?.country?.iso_code === 'string'
          ? r.country.iso_code.toLowerCase()
          : undefined
      const city =
        r?.city?.names?.en ??
        r?.city?.names?.ru ??
        (typeof r?.city?.names === 'object'
          ? Object.values(r.city.names)[0]
          : null)
      const lat =
        typeof r?.location?.latitude === 'number'
          ? r.location.latitude
          : undefined
      const lon =
        typeof r?.location?.longitude === 'number'
          ? r.location.longitude
          : undefined
      return { country, city: city ?? undefined, lat, lon }
    } catch (e) {
      this.logger.warn(`getCity failed for ip=${ip}: ${String(e)}`)
      return null
    }
  }

  getASN(ip: string): {
    autonomous_system_number?: number | null
    autonomous_system_organization?: string | null
  } | null {
    if (!this.asnReader) return null
    try {
      const r = this.asnReader.get(ip)
      if (!r) return null
      const asn =
        typeof r?.autonomous_system_number === 'number'
          ? r.autonomous_system_number
          : null
      const org =
        typeof r?.autonomous_system_organization === 'string'
          ? r.autonomous_system_organization
          : null
      return {
        autonomous_system_number: asn,
        autonomous_system_organization: org,
      }
    } catch (e) {
      this.logger.warn(`getASN failed for ip=${ip}: ${String(e)}`)
      return null
    }
  }
}
