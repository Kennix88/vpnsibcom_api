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
    key: CurrencyEnum.AED,
    name: 'United Arab Emirates dirham',
    symbol: 'إ.د',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.ARS,
    name: 'Argentine peso',
    symbol: 'ARS$',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.AUD,
    name: 'Australian dollar',
    symbol: 'A$',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.AZN,
    name: 'Azerbaijani manat',
    symbol: '₼',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.AMD,
    name: 'Armenian dram',
    symbol: '֏',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.BDT,
    name: 'Bangladeshi taka',
    symbol: '৳',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.BYN,
    name: 'Belarussian Ruble',
    symbol: 'Br',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.BGN,
    name: 'Bulgarian lev',
    symbol: 'лв',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.BHD,
    name: 'Bahraini dinar',
    symbol: '.د.ب',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.BOB,
    name: 'Boliviano',
    symbol: '$b',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.BRL,
    name: 'Brazilian real',
    symbol: 'R$',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.CAD,
    name: 'Canadian dollar',
    symbol: 'C$',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.CHF,
    name: 'Swiss franc',
    symbol: '₣',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.CNY,
    name: 'Chinese yuan',
    symbol: '¥',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.COP,
    name: 'Colombian peso',
    symbol: 'COL$',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.CZK,
    name: 'Czech koruna',
    symbol: 'Kč',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.DKK,
    name: 'Danish krone',
    symbol: 'KR',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.EGP,
    name: 'Egyptian pound',
    symbol: '.ج.م',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.GBP,
    name: 'Pound sterling',
    symbol: '£',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.HKD,
    name: 'Hong Kong Dollar',
    symbol: 'HK$',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.HUF,
    name: 'Hungarian forint',
    symbol: 'Ft',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.IDR,
    name: 'Indonesian rupiah',
    symbol: 'Rp',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.INR,
    name: 'Indian rupee',
    symbol: '₹',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.JPY,
    name: 'Japanese yen',
    symbol: '¥',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.KES,
    name: 'Kenyan shilling',
    symbol: 'KSh',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.KWD,
    name: 'Kuwaiti dinar',
    symbol: 'ك.د',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.MAD,
    name: 'Moroccan dirham',
    symbol: 'م.د.',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.MNT,
    name: 'Mongolian tugrik',
    symbol: '₮',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.MXN,
    name: 'Mexican peso',
    symbol: 'Mex$',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.NGN,
    name: 'Nigerian naira',
    symbol: '₦',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.NZD,
    name: 'New Zealand dollar',
    symbol: 'NZ$',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.OMR,
    name: 'Omani rial',
    symbol: 'ر.ع.',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.PEN,
    name: 'Peruvian nuevo sol',
    symbol: 'S/.',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.PHP,
    name: 'Philippine peso',
    symbol: '₱',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.PKR,
    name: 'Pakistani rupee',
    symbol: '₨',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.PLN,
    name: 'Polish złoty',
    symbol: 'zł',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.QAR,
    name: 'Qatari rial',
    symbol: 'ر.ق',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.RON,
    name: 'Romanian new leu',
    symbol: 'lei',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.SAR,
    name: 'Saudi riyal',
    symbol: 'ر.س',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.SEK,
    name: 'Swedish krona',
    symbol: 'kr',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.THB,
    name: 'Thai baht',
    symbol: '฿',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.TRY,
    name: 'Turkish lira',
    symbol: '₺',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.TWD,
    name: 'New Taiwan dollar',
    symbol: 'NT$',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.UAH,
    name: 'Ukrainian hryvnia',
    symbol: '₴',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.UGX,
    name: 'Ugandan shilling',
    symbol: 'USh',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.VND,
    name: 'Vietnamese đồng',
    symbol: '₫',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.ZAR,
    name: 'South African rand',
    symbol: 'R',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.GEL,
    name: 'Georgian lari',
    symbol: '₾',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.KGS,
    name: 'Kyrgyzstani som',
    symbol: 'с',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.MDL,
    name: 'Moldovan leu',
    symbol: 'L',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.NOK,
    name: 'Norwegian krone',
    symbol: 'kr',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.XDR,
    name: 'SDR (Special Drawing Right)',
    symbol: 'XDR',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.SGD,
    name: 'Singapore dollar',
    symbol: 'SG$',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.TJS,
    name: 'Tajikistani somoni',
    symbol: 'с.',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.TMT,
    name: 'Turkmenistani manat',
    symbol: 'm',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.UZS,
    name: 'Uzbekistan som',
    symbol: 'сўм',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.RSD,
    name: 'Serbian dinar',
    symbol: 'din.',
    rate: 0,
    type: CurrencyTypeEnum.FIAT,
    coinmarketcapUCID: null,
  },
  {
    key: CurrencyEnum.KRW,
    name: 'South Korean won',
    symbol: '₩',
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
    rate: Number((1 / 0.013).toFixed(15)),
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
