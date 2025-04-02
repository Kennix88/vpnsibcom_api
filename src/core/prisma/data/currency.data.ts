import { CurrencyTypeEnum } from '@shared/enums/currency-type.enum'
import { CurrencyEnum } from '@shared/enums/currency.enum'

export const CurrencyData: {
  key: CurrencyEnum
  name: string
  symbol: string
  rate: number
  type: CurrencyTypeEnum
  coinmarketcapUCID: string | null
}[] = [
  {
    key: CurrencyEnum.RUB,
    name: 'Russian rouble',
    symbol: '₽',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.USD,
    name: 'United States dollar',
    symbol: '$',
    rate: 1,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.EUR,
    name: 'Euro',
    symbol: '€',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.KZT,
    name: 'Kazakhstani tenge',
    symbol: '₸',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.TON,
    name: 'Toncoin',
    symbol: 'TON',
    rate: 0,
    type: CurrencyTypeEnum.CRYPTO,
    coinmarketcapUCID: '11419',
  },
  {
    key: CurrencyEnum.MAJOR,
    name: 'Major',
    symbol: 'MAJOR',
    rate: 0,
    type: CurrencyTypeEnum.CRYPTO,
    coinmarketcapUCID: '33188',
  },
  {
    key: CurrencyEnum.NOT,
    name: 'Notcoin',
    symbol: 'NOT',
    rate: 0,
    type: CurrencyTypeEnum.CRYPTO,
    coinmarketcapUCID: '28850',
  },
  {
    key: CurrencyEnum.HMSTR,
    name: 'Hamster Kombat',
    symbol: 'HMSTR',
    rate: 0,
    type: CurrencyTypeEnum.CRYPTO,
    coinmarketcapUCID: '32195',
  },
  {
    key: CurrencyEnum.DOGS,
    name: 'DOGS',
    symbol: 'DOGS',
    rate: 0,
    type: CurrencyTypeEnum.CRYPTO,
    coinmarketcapUCID: '32698',
  },
  {
    key: CurrencyEnum.CATI,
    name: 'Catizen',
    symbol: 'CATI',
    rate: 0,
    type: CurrencyTypeEnum.CRYPTO,
    coinmarketcapUCID: '32966',
  },
  {
    key: CurrencyEnum.USDT,
    name: 'Tether',
    symbol: '₮',
    rate: 1,
    type: CurrencyTypeEnum.CRYPTO,
    coinmarketcapUCID: '825',
  },
  {
    key: CurrencyEnum.XCH,
    name: 'Telegram Stars',
    symbol: 'STARS',
    rate: 0.013,
    type: CurrencyTypeEnum.TELEGRAM,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.JETTON,
    name: 'JetTon Games',
    symbol: 'JETTON',
    rate: 0,
    type: CurrencyTypeEnum.CRYPTO,
    coinmarketcapUCID: '27894',
  },
  {
    key: CurrencyEnum.PX,
    name: 'Not Pixel',
    symbol: 'PX',
    rate: 0,
    type: CurrencyTypeEnum.CRYPTO,
    coinmarketcapUCID: '35392',
  },
  {
    key: CurrencyEnum.GRAM,
    name: 'Gram',
    symbol: 'GRAM',
    rate: 0,
    type: CurrencyTypeEnum.CRYPTO,
    coinmarketcapUCID: '29704',
  },
  {
    key: CurrencyEnum.CATS,
    name: 'Cats',
    symbol: 'CATS',
    rate: 0,
    type: CurrencyTypeEnum.CRYPTO,
    coinmarketcapUCID: '33323',
  },
]
