import { PrismaService } from '@core/prisma/prisma.service'
import { Injectable } from '@nestjs/common'
import { parseStartParamUtil } from '@shared/utils/parse-start-param.util'
import { PinoLogger } from 'nestjs-pino'

@Injectable()
export class AcquisitionsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly logger: PinoLogger,
  ) {}

  public async updateAcquisition({
    userId,
    startParams,
    referralKey,
  }: {
    userId: string
    startParams?: string
    referralKey?: string
  }) {
    try {
      if (!startParams && !referralKey) return

      const user = await this.prismaService.users.findUnique({
        where: {
          id: userId,
        },
        select: {
          acquisition: true,
        },
      })

      if (!user?.acquisition?.id) return

      const parseStartParams = parseStartParamUtil(startParams ?? '')

      await this.prismaService.acquisition.update({
        where: {
          id: user.acquisition.id,
        },
        data: {
          ...(parseStartParams.params.source &&
            !user.acquisition.firstSource && {
              firstSource: parseStartParams.params.source,
            }),
          ...(parseStartParams.params.source && {
            lastSource: parseStartParams.params.source,
          }),
          ...(referralKey && !user.acquisition.firstReferralId && {
            firstReferralId: referralKey,
          }),
          ...(referralKey && {
            lastReferralId: referralKey,
          }),
          ...(startParams && !user.acquisition.firstStartParams && {
            firstStartParams: startParams,
          }),
          ...(startParams && {
            lastStartParams: startParams,
          }),
          ...(parseStartParams.params.compaing &&
            !user.acquisition.firstCompaingId && {
              firstCompaingId: parseStartParams.params.compaing,
            }),
          ...(parseStartParams.params.compaing && {
            lastCompaingId: parseStartParams.params.compaing,
          }),
          ...(parseStartParams.params.record &&
            !user.acquisition.firstRecordId && {
              firstRecordId: parseStartParams.params.record,
            }),
          ...(parseStartParams.params.record && {
            lastRecordId: parseStartParams.params.record,
          }),
          ...((Object.keys(parseStartParams.params).length > 0 ||
            parseStartParams.none.length > 0) &&
            !user.acquisition.firstOtherData && {
              firstOtherData: JSON.stringify({
                ...parseStartParams.params,
                ...parseStartParams.none,
              }),
            }),
          ...((Object.keys(parseStartParams.params).length > 0 ||
            parseStartParams.none.length > 0) && {
            lastOtherData: JSON.stringify({
              ...parseStartParams.params,
              ...parseStartParams.none,
            }),
          }),
        },
      })
    } catch (error) {
      this.logger.error(error)
    }
  }
}
