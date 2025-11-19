import { AdsNetworkEnum } from '../types/ads-network.enum'
import { AdsPlaceEnum } from '../types/ads-place.enum'
import { AdsTaskRewardsInterface } from '../types/ads-res.interface'
import { AdsTaskTypeEnum } from '../types/ads-task-type.enum'

export class CreateSessionResponseDto {
  type!: AdsTaskTypeEnum
  place!: AdsPlaceEnum
  network!: AdsNetworkEnum
  time!: Date
  rewards!: AdsTaskRewardsInterface
  limit!: number
  verifyKey!: string // JWT
  duration!: number
  blockId!: string
}
