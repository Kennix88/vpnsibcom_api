import { lookup } from 'geoip-lite'
import * as countries from 'i18n-iso-countries'

import type { FastifyRequest } from 'fastify'
import { IS_DEV_ENV } from './is-dev.util'

import { SessionMetadata } from '@shared/types/session-metadata.interface'
import * as DeviceDetector from 'device-detector-js'
import i18n_iso_countries from 'i18n-iso-countries/langs/en.json'

countries.registerLocale(i18n_iso_countries)

export function getSessionMetadata(
  req: FastifyRequest,
  userAgent: string,
): SessionMetadata {
  const ip = IS_DEV_ENV
    ? '173.166.164.121'
    : Array.isArray(req.headers['cf-connecting-ip'])
    ? req.headers['cf-connecting-ip'][0]
    : req.headers['cf-connecting-ip'] ||
      (typeof req.headers['x-forwarded-for'] === 'string'
        ? req.headers['x-forwarded-for'].split(',')[0]
        : req.ip)

  const location = lookup(ip)
  const device = new DeviceDetector().parse(userAgent)

  return {
    location: {
      country: countries.getName(location.country, 'en') || null,
      city: location.city || null,
      latidute: location.ll[0] || 0,
      longitude: location.ll[1] || 0,
    },
    device: {
      browser: device.client.name,
      os: device.os.name,
      type: device.device.type,
    },
    ip,
  }
}
