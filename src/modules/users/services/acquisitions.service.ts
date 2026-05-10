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
      const hasInputData = Boolean(startParams || referralKey)

      const parseStartParams = parseStartParamUtil(startParams ?? '')
      const hasOtherData =
        Object.keys(parseStartParams.params).length > 0 ||
        parseStartParams.none.length > 0

      const user = await this.prismaService.users.findUnique({
        where: {
          id: userId,
        },
        select: {
          acquisitionId: true,
          acquisition: true,
        },
      })

      if (!user) return

      // Self-heal: for old users with null/broken acquisition link create and attach.
      if (!user.acquisition?.id) {
        const acquisition = await this.prismaService.acquisition.create({
          data: {
            ...(parseStartParams.params.source && {
              firstSource: parseStartParams.params.source,
              lastSource: parseStartParams.params.source,
            }),
            ...(referralKey && {
              firstReferralId: referralKey,
              lastReferralId: referralKey,
            }),
            ...(startParams && {
              firstStartParams: startParams,
              lastStartParams: startParams,
            }),
            ...(parseStartParams.params.compaing && {
              firstCompaingId: parseStartParams.params.compaing,
              lastCompaingId: parseStartParams.params.compaing,
            }),
            ...(parseStartParams.params.record && {
              firstRecordId: parseStartParams.params.record,
              lastRecordId: parseStartParams.params.record,
            }),
            ...(hasOtherData && {
              firstOtherData: JSON.stringify({
                ...parseStartParams.params,
                ...parseStartParams.none,
              }),
              lastOtherData: JSON.stringify({
                ...parseStartParams.params,
                ...parseStartParams.none,
              }),
            }),
          },
        })

        await this.prismaService.users.update({
          where: {
            id: userId,
          },
          data: {
            acquisitionId: acquisition.id,
          },
        })

        return
      }

      if (!hasInputData) return

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
          ...(hasOtherData &&
            !user.acquisition.firstOtherData && {
              firstOtherData: JSON.stringify({
                ...parseStartParams.params,
                ...parseStartParams.none,
              }),
            }),
          ...(hasOtherData && {
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
