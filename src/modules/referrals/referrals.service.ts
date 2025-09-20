import { RedisService } from '@core/redis/redis.service'
import { UsersService } from '@modules/users/users.service'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DefaultEnum } from '@shared/enums/default.enum'
import {
  ReferralDataInterface,
  ReferralsDataInterface,
} from '@shared/types/referrals-data.interface'
import { PinoLogger } from 'nestjs-pino'
import { PrismaService } from 'nestjs-prisma'

@Injectable()
export class ReferralsService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly userService: UsersService,
    private readonly logger: PinoLogger,
    private readonly redis: RedisService,
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
      const lvl1: ReferralDataInterface[] = []
      const lvl2: ReferralDataInterface[] = []
      const lvl3: ReferralDataInterface[] = []
      let lvl1TotalPaymentsRewarded = 0
      let lvl2TotalPaymentsRewarded = 0
      let lvl3TotalPaymentsRewarded = 0
      let lvl1TotalTrafficRewarded = 0
      let lvl2TotalTrafficRewarded = 0
      let lvl3TotalTrafficRewarded = 0
      let lvl1IsActivated = 0
      let lvl2IsActivated = 0
      let lvl3IsActivated = 0
      let lvl1IsActivatedPremium = 0
      let lvl2IsActivatedPremium = 0
      let lvl3IsActivatedPremium = 0

      referrals.referrals.map(async (ref) => {
        const nextData = {
          id: ref.id,
          isActivated: ref.isActivated,
          isPremium: ref.isPremium,
          fullName: `${ref.referral.telegramData.firstName}${
            ref.referral.telegramData.lastName
              ? ` ${ref.referral.telegramData.lastName}`
              : ''
          }`,
          username: ref.referral.telegramData.username,
          photoUrl: ref.referral.telegramData.photoUrl,
          totalPaymentsRewarded: ref.totalPaymentsRewarded,
          totalTrafficRewarded: ref.totalTrafficRewarded,
        }
        if (ref.level === 1) {
          lvl1.push(nextData)
          lvl1TotalPaymentsRewarded += ref.totalPaymentsRewarded
          lvl1TotalTrafficRewarded += ref.totalTrafficRewarded
          if (ref.isActivated) {
            lvl1IsActivated += 1
            if (ref.isPremium) {
              lvl1IsActivatedPremium += 1
            }
          }
        } else if (ref.level === 2) {
          lvl2.push(nextData)
          lvl2TotalPaymentsRewarded += 0
          lvl2TotalTrafficRewarded += ref.totalTrafficRewarded
          if (ref.isActivated) {
            lvl2IsActivated += 1
            if (ref.isPremium) {
              lvl2IsActivatedPremium += 1
            }
          }
        } else if (ref.level === 3) {
          lvl3.push(nextData)
          lvl3TotalPaymentsRewarded += 0
          lvl3TotalTrafficRewarded += ref.totalTrafficRewarded
          if (ref.isActivated) {
            lvl3IsActivated += 1
            if (ref.isPremium) {
              lvl3IsActivatedPremium += 1
            }
          }
        }
      })

      const settings = await this.prismaService.settings.findUnique({
        where: {
          key: DefaultEnum.DEFAULT,
        },
      })

      return {
        lvl1IsActivated,
        lvl2IsActivated,
        lvl3IsActivated,
        lvl1IsActivatedPremium,
        lvl2IsActivatedPremium,
        lvl3IsActivatedPremium,
        lvl1IsActivatedBase: lvl2IsActivated - lvl1IsActivatedPremium,
        lvl2IsActivatedBase: lvl3IsActivated - lvl2IsActivatedPremium,
        lvl3IsActivatedBase: lvl3IsActivated - lvl3IsActivatedPremium,
        lvl1TotalPaymentsRewarded,
        lvl2TotalPaymentsRewarded: 0,
        lvl3TotalPaymentsRewarded: 0,
        lvl1TotalTrafficRewarded,
        lvl2TotalTrafficRewarded,
        lvl3TotalTrafficRewarded,
        lvl1Percent: settings.referralOneLevelPercent,
        lvl2Percent: settings.referralTwoLevelPercent,
        lvl3Percent: settings.referralThreeLevelPercent,
        inviteReward: settings.referralInviteRewardGb,
        invitePremiumReward: settings.referralInvitePremiumRewardGb,
        inviteFriendReward: settings.trialGbForReferrals,
        invitePremiumFriendReward: settings.trialGbForPremiumReferrals,
        lvl1Count: lvl1.length,
        lvl2Count: lvl2.length,
        lvl3Count: lvl3.length,
        lvl1List: lvl1
          .sort((a, b) => {
            return (
              b.totalPaymentsRewarded +
              (b.totalTrafficRewarded / 1024) * settings.trafficGbPriceStars -
              (a.totalPaymentsRewarded +
                (a.totalTrafficRewarded / 1024) * settings.trafficGbPriceStars)
            )
          })
          .slice(0, 100),
        lvl2List: lvl2
          .sort((a, b) => {
            return (
              b.totalPaymentsRewarded +
              (b.totalTrafficRewarded / 1024) * settings.trafficGbPriceStars -
              (a.totalPaymentsRewarded +
                (a.totalTrafficRewarded / 1024) * settings.trafficGbPriceStars)
            )
          })
          .slice(0, 100),
        lvl3List: lvl3
          .sort((a, b) => {
            return (
              b.totalPaymentsRewarded +
              (b.totalTrafficRewarded / 1024) * settings.trafficGbPriceStars -
              (a.totalPaymentsRewarded +
                (a.totalTrafficRewarded / 1024) * settings.trafficGbPriceStars)
            )
          })
          .slice(0, 100),
      }
    } catch (e) {
      this.logger.error({
        msg: `Error while getting referrals`,
        e,
      })
    }
  }
}
