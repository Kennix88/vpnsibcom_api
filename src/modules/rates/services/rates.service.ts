import { ApilayerCurrencyResponceDataInterface } from '@modules/rates/types/apilayer.interface'
import { CoinmarketcapResponceDataInterface } from '@modules/rates/types/coinmarketcap.interface'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Cron } from '@nestjs/schedule'
import { CurrencyTypeEnum } from '@shared/enums/currency-type.enum'
import { CurrencyEnum } from '@shared/enums/currency.enum'
import { DefaultEnum } from '@shared/enums/default.enum'
import { PinoLogger } from 'nestjs-pino'
import { PrismaService } from 'nestjs-prisma'

@Injectable()
export class RatesService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly logger: PinoLogger,
  ) {}

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
          key: CurrencyEnum.XCH,
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

  @Cron('0 */10 * * * *')
  async updateCoinmarketcapRates() {
    try {
      this.logger.info({
        msg: `The process of obtaining the coinmarketcap exchange rate has begun`,
      })

      const getCurrency = await this.prismaService.currency.findMany({
        where: {
          coinmarketcapUCID: { not: null },
          type: CurrencyTypeEnum.CRYPTO,
        },
      })

      this.logger.info({
        msg: `Currencies are obtained from the database`,
        getCurrency,
      })

      const coinmarketcapBody: CoinmarketcapResponceDataInterface = await fetch(
        `${this.configService.getOrThrow<string>(
          'COINMARKETCAP_URL',
        )}v2/cryptocurrency/quotes/latest?convert=USD&id=${getCurrency
          .map((el) => el.coinmarketcapUCID)
          .join(',')}&aux=cmc_rank`,
        {
          method: 'GET',
          headers: {
            'X-CMC_PRO_API_KEY': this.configService.getOrThrow<string>(
              'COINMARKETCAP_TOKEN',
            ),
          },
        },
      ).then((res) => res.json())

      this.logger.info({
        msg: `The exchange rate has been obtained from coinmarketcap`,
        coinmarketcapBody,
      })

      for (const el of getCurrency) {
        await this.prismaService.currency.update({
          where: { key: el.key },
          data: {
            rate: Number(
              (
                1 /
                Number(
                  coinmarketcapBody.data[el.coinmarketcapUCID].quote.USD.price,
                )
              ).toFixed(15),
            ),
          },
        })
      }

      this.logger.info({
        msg: `The exchange rate has been updated in the database`,
      })
    } catch (e) {
      this.logger.error({
        msg: `Error when getting the exchange rate coinmarketcap`,
        err: e,
      })
    }
  }

  @Cron('0 0 */12 * * *')
  async updateApilayerRates() {
    try {
      this.logger.info({
        msg: `The process of obtaining the apilayer exchange rate has begun`,
      })

      const getCurrency = await this.prismaService.currency.findMany({
        where: {
          type: CurrencyTypeEnum.FIAT,
        },
      })

      this.logger.info({
        msg: `Currencies are obtained from the database`,
        getCurrency,
      })

      const apilayerBody: ApilayerCurrencyResponceDataInterface = await fetch(
        `${this.configService.getOrThrow<string>(
          'APILAYER_URL',
        )}api/live?access_key=${this.configService.getOrThrow(
          'APILAYER_TOKENT',
        )}&currencies=&source=usd&format=1`,
        {
          method: 'GET',
        },
      ).then((res) => res.json())

      this.logger.info({
        msg: `The exchange rate has been obtained from apilayer`,
        apilayerBody,
      })

      for (const el of getCurrency) {
        if (apilayerBody.quotes[`USD${el.key}`])
          await this.prismaService.currency.update({
            where: { key: el.key },
            data: {
              rate: Number(
                (1 / Number(apilayerBody.quotes[`USD${el.key}`])).toFixed(15),
              ),
            },
          })
      }

      this.logger.info({
        msg: `The exchange rate has been updated in the database`,
      })
    } catch (e) {
      this.logger.error({
        msg: `Error when getting the exchange rate apilayer`,
        err: e,
      })
    }
  }
}
