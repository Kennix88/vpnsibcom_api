import { CurrencyEnum } from '@shared/enums/currency.enum'

export const CurrencyData: {
  key: CurrencyEnum
  name: string
  symbol: string
  rate: number
  coinmarketcapUCID: string | null
}[] = [
  {
    key: CurrencyEnum.RUB,
    name: 'Russian rouble',
    symbol: '₽',
    rate: 0,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.USD,
    name: 'United States dollar',
    symbol: '$',
    rate: 1,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.EUR,
    name: 'Euro',
    symbol: '€',
    rate: 0,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.KZT,
    name: 'Kazakhstani tenge',
    symbol: '₸',
    rate: 0,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.TON,
    name: 'Toncoin',
    symbol: 'TON',
    rate: 0,
    coinmarketcapUCID: '11419',
  },
  {
    key: CurrencyEnum.MAJOR,
    name: 'Major',
    symbol: 'MAJOR',
    rate: 0,
    coinmarketcapUCID: '33188',
  },
  {
    key: CurrencyEnum.NOT,
    name: 'Notcoin',
    symbol: 'NOT',
    rate: 0,
    coinmarketcapUCID: '28850',
  },
  {
    key: CurrencyEnum.HMSTR,
    name: 'Hamster Kombat',
    symbol: 'HMSTR',
    rate: 0,
    coinmarketcapUCID: '32195',
  },
  {
    key: CurrencyEnum.DOGS,
    name: 'DOGS',
    symbol: 'DOGS',
    rate: 0,
    coinmarketcapUCID: '32698',
  },
  {
    key: CurrencyEnum.CATI,
    name: 'Catizen',
    symbol: 'CATI',
    rate: 0,
    coinmarketcapUCID: '32966',
  },
  {
    key: CurrencyEnum.USDT,
    name: 'Tether',
    symbol: '₮',
    rate: 1,
    coinmarketcapUCID: '825',
  },
  {
    key: CurrencyEnum.XCH,
    name: 'Telegram Stars',
    symbol: 'STARS',
    rate: 0.013,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.JETTON,
    name: 'JetTon Games',
    symbol: 'JETTON',
    rate: 0,
    coinmarketcapUCID: '27894',
  },
  {
    key: CurrencyEnum.PX,
    name: 'Not Pixel',
    symbol: 'PX',
    rate: 0,
    coinmarketcapUCID: '35392',
  },
  {
    key: CurrencyEnum.GRAM,
    name: 'Gram',
    symbol: 'GRAM',
    rate: 0,
    coinmarketcapUCID: '29704',
  },
  {
    key: CurrencyEnum.CATS,
    name: 'Cats',
    symbol: 'CATS',
    rate: 0,
    coinmarketcapUCID: '33323',
  },
]
