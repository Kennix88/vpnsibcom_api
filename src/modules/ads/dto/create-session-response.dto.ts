import { AdsNetworkEnum } from '../types/ads-network.enum'
import { AdsPlaceEnum } from '../types/ads-place.enum'
import { AdsTaskRewardsInterface } from '../types/ads-res.interface'
import { AdsTypeEnum } from '../types/ads-type.enum'

export class CreateSessionResponseDto {
  type!: AdsTypeEnum
  place!: AdsPlaceEnum
  network!: AdsNetworkEnum
  time!: Date
  rewards!: AdsTaskRewardsInterface
  limit!: number
  verifyKey!: string // JWT
  duration!: number
  blockId!: string
}
