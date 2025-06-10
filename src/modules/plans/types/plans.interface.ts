import { PlansServersSelectTypeEnum } from '@modules/plans/types/plans-servers-select-type.enum'
import { PlansEnum } from '@modules/plans/types/plans.enum'

export interface PlansInterface {
  key: PlansEnum
  name: string
  priceStars?: number
  isCustom: boolean
  devicesCount: number
  isAllBaseServers: boolean
  isAllPremiumServers: boolean
  trafficLimitGb?: number
  isUnlimitTraffic: boolean
  serversSelectType: PlansServersSelectTypeEnum
}

export interface PlansResponseDataInterface {
  plans: PlansInterface[]
}
