import { PrismaService } from '@core/prisma/prisma.service'
import { GeoService } from '@modules/geo/geo.service'
import { Injectable } from '@nestjs/common'
import { parseStartParamUtil } from '@shared/utils/parse-start-param.util'
import { PinoLogger } from 'nestjs-pino'
import { UAParser } from 'ua-parser-js'
import { SessionPlaceEnum } from '../types/session-place.enum'

@Injectable()
export class SessionsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly logger: PinoLogger,
    private readonly geoService: GeoService,
  ) {}

  public async createSession({
    userId,
    startParams,
    referralKey,
    place,
    ua,
    ip,
  }: {
    userId: string
    place: SessionPlaceEnum
    startParams?: string
    referralKey?: string
    ua?: string
    ip?: string
  }) {
    try {
      const user = await this.prismaService.users.findUnique({
        where: {
          id: userId,
        },
      })

      if (!user) return

      const parseStartParams = parseStartParamUtil(startParams ?? '')
      const country = this.geoService.getCountry(ip)
      const { browser, device, os } = UAParser(ua || '')

      await this.prismaService.sessions.create({
        data: {
          userId,
          place,
          startParams,
          referralId: referralKey,
          userAgent: ua,
          ip,
          ...(ua && {
            browser: JSON.stringify(browser),
            device: JSON.stringify(device),
            os: JSON.stringify(os),
          }),
          ...(country && { country }),
          ...(parseStartParams.params.source && {
            source: parseStartParams.params.source,
          }),
          ...(referralKey && {
            referralKey: referralKey,
          }),
          ...(startParams && {
            startParam: startParams,
          }),
          ...(parseStartParams.params.compaing && {
            compaingId: parseStartParams.params.compaing,
          }),
          ...(parseStartParams.params.record && {
            recordId: parseStartParams.params.record,
          }),
          ...(parseStartParams.params ||
            (parseStartParams.none && {
              otherData: JSON.stringify({
                ...parseStartParams.params,
                ...parseStartParams.none,
              }),
            })),
        },
      })
    } catch (error) {
      this.logger.error(error)
    }
  }
}
