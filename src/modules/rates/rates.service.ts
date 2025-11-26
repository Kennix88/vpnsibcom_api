import { PrismaService } from '@core/prisma/prisma.service'
import { CoinmarketcapResponceDataInterface } from '@modules/rates/types/coinmarketcap.interface'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Cron } from '@nestjs/schedule'
import { CurrencyTypeEnum } from '@shared/enums/currency-type.enum'
import { CurrencyEnum } from '@shared/enums/currency.enum'
import { DefaultEnum } from '@shared/enums/default.enum'
import { RatesInterface } from '@shared/types/rates.inteface'
import axios from 'axios'
import { PinoLogger } from 'nestjs-pino'
import { ForexRateInterface } from './types/forexrateapi.interface'

@Injectable()
export class RatesService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly logger: PinoLogger,
  ) {}

  public async getCurrencies() {
    return this.prismaService.currency.findMany({
      select: {
        key: true,
        name: true,
        symbol: true,
        type: true,
        rate: true,
      },
    })
  }

  async getRates(): Promise<RatesInterface> {
    try {
      this.logger.info({
        msg: `Fetching currencies from the database`,
      })

      const currencies = await this.prismaService.currency.findMany()

      this.logger.info({
        msg: `Currencies fetched from the database`,
        currencies,
      })

      const rates = Object.fromEntries(
        currencies.map((currency) => [currency.key, currency.rate]),
      ) as Record<CurrencyEnum, number>

      this.logger.info({
        msg: `Rates constructed from currencies`,
        rates,
      })

      return {
        base: CurrencyEnum.USD,
        rates: rates,
      }
    } catch (e) {
      this.logger.error({
        msg: `Error when getting the exchange rate`,
        err: e,
      })
    }
  }

  async updateStarsRate() {
    try {
      this.logger.info({
        msg: `The process of obtaining the Stars exchange rate has begun`,
      })
      const getSettings = await this.prismaService.settings.findUnique({
        where: {
          key: DefaultEnum.DEFAULT,
        },
      })

      this.logger.info({
        msg: `Settings are obtained from the database`,
        getSettings,
      })

      await this.prismaService.currency.update({
        where: {
          key: CurrencyEnum.XTR,
        },
        data: {
          rate: Number((1 / getSettings.tgStarsToUSD).toFixed(15)),
        },
      })

      this.logger.info({
        msg: `The exchange rate has been updated in the database`,
      })
    } catch (e) {
      this.logger.error({
        msg: `Error when getting the exchange rate stars`,
        error: e,
      })
    }
  }

  /**
   * Updates cryptocurrency rates from Coinmarketcap API
   * Runs every 10 minutes
   * @returns {Promise<void>}
   */
  @Cron('0 */10 * * * *')
  async updateCoinmarketcapRates(): Promise<void> {
    try {
      this.logger.info({
        msg: 'Starting Coinmarketcap exchange rate update process',
      })

      // Fetch currencies with coinmarketcap IDs
      const currencies = await this.prismaService.currency.findMany({
        where: {
          coinmarketcapUCID: { not: null },
          type: CurrencyTypeEnum.CRYPTO,
        },
        select: {
          key: true,
          coinmarketcapUCID: true,
        },
      })

      if (!currencies.length) {
        this.logger.info({
          msg: 'No cryptocurrencies with coinmarketcapUCID found, skipping update',
        })
        return
      }

      this.logger.info({
        msg: 'Retrieved cryptocurrencies from database',
        count: currencies.length,
        currencies: currencies.map((c) => c.key),
      })

      // Prepare API request with timeout
      const coinmarketcapUrl =
        this.configService.getOrThrow<string>('COINMARKETCAP_URL')
      const apiKey = this.configService.getOrThrow<string>(
        'COINMARKETCAP_TOKEN',
      )
      const currencyIds = currencies.map((el) => el.coinmarketcapUCID).join(',')

      let coinmarketcapData: CoinmarketcapResponceDataInterface
      try {
        const response = await axios.get(
          `${coinmarketcapUrl}v2/cryptocurrency/quotes/latest`,
          {
            params: {
              convert: 'USD',
              id: currencyIds,
              aux: 'cmc_rank',
            },
            headers: {
              'X-CMC_PRO_API_KEY': apiKey,
            },
            timeout: 10000, // 10 seconds timeout
          },
        )

        coinmarketcapData = response.data
      } catch (error) {
        this.logger.error({
          msg: 'Failed to fetch data from Coinmarketcap API',
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        })
        throw new Error('Coinmarketcap API request failed')
      }

      // Validate API response
      if (!coinmarketcapData?.data) {
        this.logger.error({
          msg: 'Invalid response from Coinmarketcap API',
          response: coinmarketcapData,
        })
        throw new Error('Invalid Coinmarketcap API response')
      }

      this.logger.info({
        msg: 'Successfully retrieved exchange rates from Coinmarketcap',
        statusCode: 200,
        currenciesReceived: Object.keys(coinmarketcapData.data).length,
      })

      // Prepare batch updates
      const updatePromises: Promise<any>[] = []
      let updatedCount = 0
      let errorCount = 0

      for (const currency of currencies) {
        try {
          const currencyData =
            coinmarketcapData.data[currency.coinmarketcapUCID]

          if (!currencyData?.quote?.USD?.price) {
            this.logger.warn({
              msg: 'Missing price data for currency',
              currency: currency.key,
              ucid: currency.coinmarketcapUCID,
            })
            errorCount++
            continue
          }

          const price = Number(currencyData.quote.USD.price)

          if (isNaN(price) || price <= 0) {
            this.logger.warn({
              msg: 'Invalid price value for currency',
              currency: currency.key,
              price: currencyData.quote.USD.price,
            })
            errorCount++
            continue
          }

          // Calculate rate (1/price) with precision
          const rate = Number((1 / price).toFixed(15))

          updatePromises.push(
            this.prismaService.currency
              .update({
                where: { key: currency.key },
                data: { rate },
              })
              .then(() => {
                updatedCount++
              })
              .catch((error) => {
                this.logger.error({
                  msg: 'Failed to update currency rate in database',
                  currency: currency.key,
                  error: error instanceof Error ? error.message : String(error),
                })
                errorCount++
              }),
          )
        } catch (error) {
          this.logger.error({
            msg: 'Error processing currency data',
            currency: currency.key,
            error: error instanceof Error ? error.message : String(error),
          })
          errorCount++
        }
      }

      // Wait for all updates to complete
      await Promise.all(updatePromises)

      this.logger.info({
        msg: 'Coinmarketcap exchange rates update completed',
        updatedCurrencies: updatedCount,
        failedCurrencies: errorCount,
        date: new Date().toISOString(),
      })
    } catch (error) {
      this.logger.error({
        msg: 'Error during Coinmarketcap exchange rate update process',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
    }
  }

  /**
   * Updates FIAT currency rates from Forexrateapi
   * Runs every 8 hours
   * @returns {Promise<void>}
   */
  @Cron('0 0 */8 * * *')
  async updateForexrateapiRates(): Promise<void> {
    try {
      this.logger.info({
        msg: 'Starting Forexrateapi exchange rate update process',
      })

      // Fetch all FIAT currencies from database
      const fiatCurrencies = await this.prismaService.currency.findMany({
        where: {
          type: CurrencyTypeEnum.FIAT,
        },
        select: {
          key: true,
        },
      })

      if (!fiatCurrencies.length) {
        this.logger.info({
          msg: 'No FIAT currencies found in database, skipping Forexrateapi update',
        })
        return
      }

      this.logger.info({
        msg: 'Retrieved FIAT currencies from database',
        count: fiatCurrencies.length,
        currencies: fiatCurrencies.map((c) => c.key),
      })

      // Prepare API request parameters
      const forexrateapiUrl =
        this.configService.getOrThrow<string>('FOREXRATEAPI_URL')
      const apiKey = this.configService.getOrThrow<string>('FOREXRATEAPI_TOKEN')

      // Make API request with proper URL formatting and timeout
      let forexRates: ForexRateInterface
      try {
        const response = await axios.get(`${forexrateapiUrl}v1/latest`, {
          params: {
            api_key: apiKey,
            base: 'USD',
          },
          timeout: 10000, // 10 seconds timeout
        })
        forexRates = response.data
      } catch (error) {
        this.logger.error({
          msg: 'Failed to fetch data from Forexrateapi API',
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        })
        throw new Error('Forexrateapi API request failed')
      }

      // Validate API response
      if (!forexRates?.success || !forexRates?.rates) {
        this.logger.error({
          msg: 'Invalid response from Forexrateapi API',
          response: forexRates,
        })
        throw new Error('Invalid Forexrateapi API response')
      }

      this.logger.info({
        msg: 'Successfully retrieved exchange rates from Forexrateapi',
        timestamp: forexRates.timestamp,
        base: forexRates.base,
        ratesCount: Object.keys(forexRates.rates).length,
      })

      // Update rates in database
      const updatePromises: Promise<any>[] = []
      let updatedCount = 0
      let errorCount = 0

      // Make sure USD rate exists in the response
      if (!forexRates.rates.USD) {
        this.logger.error({
          msg: 'USD rate missing in Forexrateapi response',
          availableRates: Object.keys(forexRates.rates),
        })
        throw new Error('USD rate missing in Forexrateapi response')
      }

      for (const currency of fiatCurrencies) {
        // Skip if currency not found in API response
        if (!forexRates.rates[currency.key]) {
          this.logger.warn({
            msg: 'Currency rate not found in Forexrateapi response',
            currency: currency.key,
          })
          errorCount++
          continue
        }

        if (currency.key !== 'USD') {
          // Calculate rate relative to USD (how many USD per 1 unit of currency)
          const rateToUSD =
            forexRates.rates[currency.key] / forexRates.rates.USD
          const finalRate = Number((1 / rateToUSD).toFixed(15))

          if (isNaN(finalRate) || !isFinite(finalRate) || finalRate <= 0) {
            this.logger.warn({
              msg: 'Invalid calculated rate',
              currency: currency.key,
              rateToUSD,
              finalRate,
            })
            errorCount++
            continue
          }

          updatePromises.push(
            this.prismaService.currency
              .update({
                where: { key: currency.key },
                data: { rate: finalRate },
              })
              .then(() => {
                updatedCount++
              })
              .catch((error) => {
                this.logger.error({
                  msg: 'Failed to update currency rate in database',
                  currency: currency.key,
                  error: error instanceof Error ? error.message : String(error),
                })
                errorCount++
              }),
          )
        }
      }

      // Update USD rate directly (1 USD = 1 USD)
      updatePromises.push(
        this.prismaService.currency
          .update({
            where: { key: 'USD' },
            data: { rate: 1 },
          })
          .then(() => {
            updatedCount++
          })
          .catch((error) => {
            this.logger.error({
              msg: 'Failed to update USD rate in database',
              error: error instanceof Error ? error.message : String(error),
            })
            errorCount++
          }),
      )

      // Wait for all updates to complete
      await Promise.all(updatePromises)

      this.logger.info({
        msg: 'Forexrateapi exchange rates update completed',
        updatedCurrencies: updatedCount,
        failedCurrencies: errorCount,
        date: new Date().toISOString(),
      })
    } catch (error) {
      this.logger.error({
        msg: 'Error during Forexrateapi exchange rate update process',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
    }
  }
}
