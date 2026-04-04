import { AdsNetworkEnum } from '../types/ads-network.enum'
import { AdsPlaceEnum } from '../types/ads-place.enum'
import { AdsTypeEnum } from '../types/ads-type.enum'

export class CreateSessionResponseDto {
  type!: AdsTypeEnum
  place!: AdsPlaceEnum
  network!: AdsNetworkEnum
  time!: Date
  limit!: number
  verifyKey!: string // JWT
  duration!: number
  blockId!: string
}
