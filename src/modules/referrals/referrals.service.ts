import { PrismaService } from '@core/prisma/prisma.service'
import { Injectable } from '@nestjs/common'
import { DefaultEnum } from '@shared/enums/default.enum'
import { ReferralsDataInterface } from '@shared/types/referrals-data.interface'
import { PinoLogger } from 'nestjs-pino'

@Injectable()
export class ReferralsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly logger: PinoLogger,
  ) {}

  public async getReferrals(tgId: string): Promise<ReferralsDataInterface> {
    try {
      const referrals = await this.prismaService.users.findUnique({
        where: {
          telegramId: tgId,
        },
        include: {
          referrals: {
            include: {
              referral: {
                include: {
                  telegramData: true,
                },
              },
            },
          },
        },
      })
      let lvl1 = 0
      let lvl2 = 0
      let lvl3 = 0
      let lvl1TotalUsdtRewarded = 0
      let lvl2TotalUsdtRewarded = 0
      let lvl3TotalUsdtRewarded = 0

      referrals.referrals.map(async (ref) => {
        if (ref.level === 1) {
          lvl1 += 1
          lvl1TotalUsdtRewarded += Number(ref.totalUsdtRewarded)
        } else if (ref.level === 2) {
          lvl2 += 1
          lvl2TotalUsdtRewarded += Number(ref.totalUsdtRewarded)
        } else if (ref.level === 3) {
          lvl3 += 1
          lvl3TotalUsdtRewarded += Number(ref.totalUsdtRewarded)
        }
      })

      const settings = await this.prismaService.settings.findUnique({
        where: {
          key: DefaultEnum.DEFAULT,
        },
      })

      return {
        lvl1TotalUsdtRewarded,
        lvl2TotalUsdtRewarded,
        lvl3TotalUsdtRewarded,
        lvl1Percent: settings.referralOneLevelPercent,
        lvl2Percent: settings.referralTwoLevelPercent,
        lvl3Percent: settings.referralThreeLevelPercent,
        lvl1Count: lvl1,
        lvl2Count: lvl2,
        lvl3Count: lvl3,
      }
    } catch (e) {
      this.logger.error({
        msg: `Error while getting referrals`,
        e,
      })
    }
  }
}
