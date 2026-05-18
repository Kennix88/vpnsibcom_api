import { PrismaService } from '@core/prisma/prisma.service'
import { Prisma } from '@core/prisma/generated/client'
import { GeoService } from '@modules/geo/geo.service'
import { Injectable } from '@nestjs/common'
import { parseStartParamUtil } from '@shared/utils/parse-start-param.util'
import { PinoLogger } from 'nestjs-pino'
import { UAParser } from 'ua-parser-js'
import { SessionPlaceEnum } from '../types/session-place.enum'

@Injectable()
export class SessionsService {
  private static readonly DUPLICATE_WINDOW_MS = 30_000

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
      const normalizedStartParams = startParams?.trim()
      const normalizedReferralKey = referralKey?.trim()
      const normalizedUa = ua?.trim()
      const normalizedIp = ip?.trim()

      const parseStartParams = parseStartParamUtil(normalizedStartParams ?? '')
      const country = this.geoService.getCountry(normalizedIp)
      const { browser, device, os } = UAParser(normalizedUa || '')
      const duplicateSince = new Date(
        Date.now() - SessionsService.DUPLICATE_WINDOW_MS,
      )

      await this.prismaService.$transaction(async (tx) => {
        const user = await tx.users.findUnique({
          where: {
            id: userId,
          },
          select: { id: true },
        })

        if (!user) return

        await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`

        const existingSession = await tx.sessions.findFirst({
          where: {
            userId,
            place,
            startParams: normalizedStartParams,
            referralId: normalizedReferralKey,
            userAgent: normalizedUa,
            ip: normalizedIp,
            startedAt: {
              gte: duplicateSince,
            },
          },
          select: { id: true },
          orderBy: { startedAt: 'desc' },
        })

        if (existingSession) {
          return
        }

        await tx.sessions.create({
          data: {
            userId,
            place,
            startParams: normalizedStartParams,
            referralId: normalizedReferralKey,
            userAgent: normalizedUa,
            ip: normalizedIp,
            ...(normalizedUa && {
              browser: browser as unknown as Prisma.InputJsonValue,
              device: device as unknown as Prisma.InputJsonValue,
              os: os as unknown as Prisma.InputJsonValue,
            }),
            ...(country && { country }),
            ...(parseStartParams.params.source && {
              source: parseStartParams.params.source,
            }),
            ...(parseStartParams.params.compaing && {
              compaingId: parseStartParams.params.compaing,
            }),
            ...(parseStartParams.params.record && {
              recordId: parseStartParams.params.record,
            }),
            ...((Object.keys(parseStartParams.params).length > 0 ||
              parseStartParams.none.length > 0) && {
              otherData: {
                ...parseStartParams.params,
                none: parseStartParams.none,
              } as Prisma.InputJsonValue,
            }),
          },
        })
      })
    } catch (error) {
      this.logger.error(error)
    }
  }
}
