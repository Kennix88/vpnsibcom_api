// rates.service.ts
import { CurrencyTypeEnum as PrismaCurrencyTypeEnum } from '@core/prisma/generated/enums'
import { PrismaService } from '@core/prisma/prisma.service'
import { CoinmarketcapResponceDataInterface } from '@modules/rates/types/coinmarketcap.interface'
import { Injectable, InternalServerErrorException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Cron } from '@nestjs/schedule'
import { CurrencyTypeEnum } from '@shared/enums/currency-type.enum'
import { CurrencyEnum } from '@shared/enums/currency.enum'
import { DefaultEnum } from '@shared/enums/default.enum'
import { RatesInterface } from '@shared/types/rates.inteface'
import axios from 'axios'
import { PinoLogger } from 'nestjs-pino'
import { ForexRateInterface } from './types/forexrateapi.interface'

interface CurrencyRateUpdate {
  key: string
  rate: number
}

// то, что реально отдаём наружу (в API-ответе)
export interface CurrencyDto {
  key: CurrencyEnum
  name: string
  symbol: string
  type: CurrencyTypeEnum
  rate: number
}

// этот можно не экспортировать, он используется только внутри private-методов
interface CurrencyRateUpdate {
  key: string
  rate: number
}

// а вот тип возврата getCurrencyData стоит явно объявить и экспортировать,
// чтобы контроллер тоже мог на него опираться при необходимости
export interface CurrencyDataResponse {
  currencies: CurrencyDto[]
  rates: RatesInterface
}

@Injectable()
export class RatesService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly logger: PinoLogger,
  ) {}

  async getRates(): Promise<RatesInterface> {
    const { rates } = await this.getCurrencyData()
    return rates
  }

  async getCurrencyData(): Promise<CurrencyDataResponse> {
    try {
      const currencies = await this.prismaService.currency.findMany({
        select: {
          key: true,
          name: true,
          symbol: true,
          type: true,
          rate: true,
        },
      })

      // явный маппинг на границе Prisma -> Domain,
      // здесь и только здесь мы "доверяем" что значения совпадают
      const mapped: CurrencyDto[] = currencies.map((c) => ({
        key: c.key as unknown as CurrencyEnum,
        name: c.name,
        symbol: c.symbol,
        type: c.type as unknown as CurrencyTypeEnum,
        rate: c.rate,
      }))

      const rates = Object.fromEntries(
        mapped.map((currency) => [currency.key, currency.rate]),
      ) as Record<CurrencyEnum, number>

      return {
        currencies: mapped,
        rates: {
          base: CurrencyEnum.USD,
          rates,
        },
      }
    } catch (e) {
      this.logger.error({
        msg: 'Error fetching currency data',
        err: e instanceof Error ? e.message : String(e),
      })
      throw new InternalServerErrorException('Failed to fetch currency data')
    }
  }

  async updateStarsRate(): Promise<void> {
    try {
      const settings = await this.prismaService.settings.findUnique({
        where: { key: DefaultEnum.DEFAULT },
      })

      if (!settings?.tgStarsToUSD || settings.tgStarsToUSD <= 0) {
        this.logger.warn({
          msg: 'tgStarsToUSD is missing or invalid, skipping Stars rate update',
          tgStarsToUSD: settings?.tgStarsToUSD,
        })
        return
      }

      const rate = Number((1 / settings.tgStarsToUSD).toFixed(15))

      if (!isFinite(rate) || rate <= 0) {
        this.logger.warn({ msg: 'Computed Stars rate is invalid', rate })
        return
      }

      await this.prismaService.currency.update({
        where: { key: CurrencyEnum.XTR },
        data: { rate },
      })

      this.logger.info({ msg: 'Stars exchange rate updated', rate })
    } catch (e) {
      this.logger.error({
        msg: 'Error updating Stars exchange rate',
        err: e instanceof Error ? e.message : String(e),
      })
    }
  }

  private async bulkUpdateRates(
    updates: CurrencyRateUpdate[],
  ): Promise<{ updated: number; failed: number }> {
    if (!updates.length) return { updated: 0, failed: 0 }

    try {
      const queries = updates.map(({ key, rate }) =>
        this.prismaService.currency.update({
          where: { key: key as any },
          data: { rate },
        }),
      )

      await this.prismaService.$transaction(queries)

      return { updated: updates.length, failed: 0 }
    } catch (e) {
      this.logger.error({
        msg: 'Bulk rate update transaction failed, no rates were changed',
        err: e instanceof Error ? e.message : String(e),
        affectedKeys: updates.map((u) => u.key),
      })
      return { updated: 0, failed: updates.length }
    }
  }

  @Cron('0 */10 * * * *')
  async updateCoinmarketcapRates(): Promise<void> {
    try {
      const currencies = await this.prismaService.currency.findMany({
        where: {
          coinmarketcapUCID: { not: null },
          type: PrismaCurrencyTypeEnum.CRYPTO,
        },
        select: { key: true, coinmarketcapUCID: true },
      })

      if (!currencies.length) {
        this.logger.info({
          msg: 'No cryptocurrencies with coinmarketcapUCID found, skipping update',
        })
        return
      }

      const coinmarketcapUrl =
        this.configService.getOrThrow<string>('COINMARKETCAP_URL')
      const apiKey = this.configService.getOrThrow<string>(
        'COINMARKETCAP_TOKEN',
      )
      const currencyIds = currencies.map((el) => el.coinmarketcapUCID).join(',')

      let coinmarketcapData: CoinmarketcapResponceDataInterface
      try {
        const response = await axios.get<CoinmarketcapResponceDataInterface>(
          `${coinmarketcapUrl}v2/cryptocurrency/quotes/latest`,
          {
            params: { convert: 'USD', id: currencyIds, aux: 'cmc_rank' },
            headers: { 'X-CMC_PRO_API_KEY': apiKey },
            timeout: 10000,
          },
        )
        coinmarketcapData = response.data
      } catch (error) {
        this.logger.error({
          msg: 'Failed to fetch data from Coinmarketcap API',
          error: error instanceof Error ? error.message : String(error),
        })
        return
      }

      if (!coinmarketcapData?.data) {
        this.logger.error({ msg: 'Invalid response from Coinmarketcap API' })
        return
      }

      const updates: CurrencyRateUpdate[] = []
      let skipped = 0

      for (const currency of currencies) {
        const currencyData = coinmarketcapData.data[currency.coinmarketcapUCID]
        const price = currencyData?.quote?.USD?.price

        if (!price || isNaN(price) || price <= 0) {
          skipped++
          continue
        }

        updates.push({
          key: currency.key,
          rate: Number((1 / price).toFixed(15)),
        })
      }

      const { updated, failed } = await this.bulkUpdateRates(updates)

      this.logger.info({
        msg: 'Coinmarketcap exchange rates update completed',
        updatedCurrencies: updated,
        failedCurrencies: failed,
        skippedCurrencies: skipped,
      })
    } catch (error) {
      this.logger.error({
        msg: 'Error during Coinmarketcap exchange rate update process',
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  @Cron('0 0 */8 * * *')
  async updateForexrateapiRates(): Promise<void> {
    try {
      const fiatCurrencies = await this.prismaService.currency.findMany({
        where: { type: PrismaCurrencyTypeEnum.FIAT },
        select: { key: true },
      })

      if (!fiatCurrencies.length) {
        this.logger.info({
          msg: 'No FIAT currencies found in database, skipping Forexrateapi update',
        })
        return
      }

      const forexrateapiUrl =
        this.configService.getOrThrow<string>('FOREXRATEAPI_URL')
      const apiKey = this.configService.getOrThrow<string>('FOREXRATEAPI_TOKEN')

      let forexRates: ForexRateInterface
      try {
        const response = await axios.get<ForexRateInterface>(
          `${forexrateapiUrl}v1/latest`,
          {
            params: { api_key: apiKey, base: 'USD' },
            timeout: 10000,
          },
        )
        forexRates = response.data
      } catch (error) {
        this.logger.error({
          msg: 'Failed to fetch data from Forexrateapi API',
          error: error instanceof Error ? error.message : String(error),
        })
        return
      }

      if (!forexRates?.success || !forexRates?.rates?.USD) {
        this.logger.error({
          msg: 'Invalid response from Forexrateapi API (missing success or USD base rate)',
        })
        return
      }

      const updates: CurrencyRateUpdate[] = [{ key: CurrencyEnum.USD, rate: 1 }]
      let skipped = 0

      for (const currency of fiatCurrencies) {
        if (currency.key === CurrencyEnum.USD) continue

        const rawRate = forexRates.rates[currency.key]
        if (!rawRate) {
          skipped++
          continue
        }

        const rateToUSD = rawRate / forexRates.rates.USD
        const finalRate = Number((1 / rateToUSD).toFixed(15))

        if (!isFinite(finalRate) || finalRate <= 0) {
          skipped++
          continue
        }

        updates.push({ key: currency.key, rate: finalRate })
      }

      const { updated, failed } = await this.bulkUpdateRates(updates)

      this.logger.info({
        msg: 'Forexrateapi exchange rates update completed',
        updatedCurrencies: updated,
        failedCurrencies: failed,
        skippedCurrencies: skipped,
      })
    } catch (error) {
      this.logger.error({
        msg: 'Error during Forexrateapi exchange rate update process',
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}
