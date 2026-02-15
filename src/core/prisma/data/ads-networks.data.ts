import { AdsNetworkEnum } from '@modules/ads/types/ads-network.enum'

export const AdsNetworksData: {
  key: AdsNetworkEnum
  isActive: boolean
  name: string
}[] = [
  {
    key: AdsNetworkEnum.YANDEX,
    isActive: false,
    name: 'Yandex',
  },
  {
    key: AdsNetworkEnum.ADSGRAM,
    isActive: false,
    name: 'Adsgram',
  },
  {
    key: AdsNetworkEnum.ONCLICKA,
    isActive: false,
    name: 'Onclicka',
  },
  {
    key: AdsNetworkEnum.ADSONAR,
    isActive: false,
    name: 'Adsonar',
  },
  {
    key: AdsNetworkEnum.GIGA,
    isActive: false,
    name: 'Giga',
  },
  {
    key: AdsNetworkEnum.MONETAG,
    isActive: false,
    name: 'Monetag',
  },
]
