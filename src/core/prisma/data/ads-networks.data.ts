import { AdsNeworkEnum } from '@shared/enums/ads-nework.enum'

export const AdsNetworksData: {
  key: AdsNeworkEnum
  isActive: boolean
  name: string
}[] = [
  {
    key: AdsNeworkEnum.YANDEX,
    isActive: false,
    name: 'Yandex',
  },
  {
    key: AdsNeworkEnum.ADSGRAM,
    isActive: false,
    name: 'Adsgram',
  },
  {
    key: AdsNeworkEnum.ONCLICKA,
    isActive: false,
    name: 'Onclicka',
  },
  {
    key: AdsNeworkEnum.ADSONAR,
    isActive: false,
    name: 'Adsonar',
  },
  {
    key: AdsNeworkEnum.GIGA,
    isActive: false,
    name: 'Giga',
  },
  {
    key: AdsNeworkEnum.MONETAG,
    isActive: false,
    name: 'Monetag',
  },
]
