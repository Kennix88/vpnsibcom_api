import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PinoLogger } from 'nestjs-pino'
import { PrismaService } from 'nestjs-prisma'
import { PlansServersSelectTypeEnum } from './types/plans-servers-select-type.enum'
import { PlansEnum } from './types/plans.enum'
import { PlansInterface } from './types/plans.interface'

@Injectable()
export class PlansService {
  private readonly serviceName = 'PlansService'

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly logger: PinoLogger,
  ) {}

  public async getPlans(): Promise<PlansInterface[]> {
    const plans = await this.prismaService.plans.findMany({
      where: {
        key: {
          not: PlansEnum.TRIAL,
        },
      },
    })

    const plansMapped = plans.map(
      (plan): PlansInterface => ({
        key: plan.key as PlansEnum,
        name: plan.name,
        priceStars: plan.priceStars,
        isCustom: plan.isCustom,
        devicesCount: plan.devicesCount,
        isAllBaseServers: plan.isAllBaseServers,
        isAllPremiumServers: plan.isAllPremiumServers,
        trafficLimitGb: plan.trafficLimitGb,
        isUnlimitTraffic: plan.isUnlimitTraffic,
        serversSelectType: plan.serversSelectType as PlansServersSelectTypeEnum,
      }),
    )
    return plansMapped.sort((a, b) => {
      const indexA = Object.values(PlansEnum).indexOf(a.key)
      const indexB = Object.values(PlansEnum).indexOf(b.key)

      const safeIndexA = indexA === -1 ? Infinity : indexA
      const safeIndexB = indexB === -1 ? Infinity : indexB

      return safeIndexA - safeIndexB
    })
  }
}
