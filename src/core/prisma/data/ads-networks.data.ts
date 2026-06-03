import { AdsNetworkEnum } from '@modules/ads/types/ads-network.enum'

export const AdsNetworksData: {
  key: AdsNetworkEnum
  isActive: boolean
  name: string
  priority: number
}[] = [
  {
    key: AdsNetworkEnum.YANDEX,
    isActive: false,
    name: 'Yandex',
    priority: 100,
  },
  {
    key: AdsNetworkEnum.ADSGRAM,
    isActive: false,
    name: 'Adsgram',
    priority: 100,
  },
  {
    key: AdsNetworkEnum.ONCLICKA,
    isActive: false,
    name: 'Onclicka',
    priority: 100,
  },
  {
    key: AdsNetworkEnum.ADSONAR,
    isActive: false,
    name: 'Adsonar',
    priority: 100,
  },
  {
    key: AdsNetworkEnum.GIGA,
    isActive: false,
    name: 'Giga',
    priority: 100,
  },
  {
    key: AdsNetworkEnum.MONETAG,
    isActive: false,
    name: 'Monetag',
    priority: 100,
  },
]
