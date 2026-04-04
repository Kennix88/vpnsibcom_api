import { AdsNetworkEnum } from './ads-network.enum'
import { AdsPlaceEnum } from './ads-place.enum'
import { AdsTypeEnum } from './ads-type.enum'
import { RichAdsGetAdResponseInterface } from './richads.interface'
import { TaddyGetAdResponseInterface } from './taddy.interface'

export interface AdsResInterface {
  isNoAds: boolean
  ad?: AdsDataInterface
  taddy?: TaddyGetAdResponseInterface
  richAds?: RichAdsGetAdResponseInterface
}

export interface AdsDataInterface {
  type: AdsTypeEnum
  place: AdsPlaceEnum
  network: AdsNetworkEnum
  time: Date
  blockId: string
  verifyKey: string
}
