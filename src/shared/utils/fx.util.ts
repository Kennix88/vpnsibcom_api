import { CurrencyEnum } from '@shared/enums/currency.enum'
import { RatesInterface } from '@shared/types/rates.inteface'

export function fxUtil(
  value: number,
  from: CurrencyEnum,
  to: CurrencyEnum = CurrencyEnum.USD,
  ratesObj: RatesInterface,
): number {
  const convert = function (val: number) {
    return Number((val * getRate(to, from)).toFixed(15))
  }

  const getRate = function (to: CurrencyEnum, from: CurrencyEnum) {
    const rates = ratesObj.rates
    rates[ratesObj.base] = 1

    if (from === ratesObj.base) {
      return rates[to]
    }

    if (to === ratesObj.base) {
      return Number((1 / rates[from]).toFixed(15))
    }

    return Number((rates[to] * (1 / rates[from])).toFixed(15))
  }

  return convert(value)
}
