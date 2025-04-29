import { RedisService } from '@core/redis/redis.service'
import { RatesService } from '@modules/rates/rates.service'
import { UsersService } from '@modules/users/users.service'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { CurrencyTypeEnum } from '@shared/enums/currency-type.enum'
import { CurrencyEnum } from '@shared/enums/currency.enum'
import { PaymentMethodTypeEnum } from '@shared/enums/payment-method-type.enum'
import { PaymentMethodEnum } from '@shared/enums/payment-method.enum'
import { PaymentStatusEnum } from '@shared/enums/payment-status.enum'
import { PaymentSystemEnum } from '@shared/enums/payment-system.enum'
import { PaymentMethodsDataInterface } from '@shared/types/payment-methods-data.interface'
import { fxUtil } from '@shared/utils/fx.util'
import { genToken } from '@shared/utils/gen-token.util'
import { PinoLogger } from 'nestjs-pino'
import { PrismaService } from 'nestjs-prisma'
import { InjectBot } from 'nestjs-telegraf'
import { Telegraf } from 'telegraf'

@Injectable()
export class PaymentsService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly userService: UsersService,
    private readonly logger: PinoLogger,
    private readonly redis: RedisService,
    private readonly ratesService: RatesService,
    @InjectBot() private readonly bot: Telegraf,
  ) {}

  public async createInvoice(
    amount: number,
    method: PaymentMethodEnum,
    tgId: string,
  ): Promise<{
    linkPay: string
    isTmaIvoice: boolean
  }> {
    try {
      return await this.prismaService.$transaction(async (tx) => {
        const getMethod = await tx.paymentMethods.findUnique({
          where: {
            key: method,
            isActive: true,
          },
        })
        if (!getMethod) {
          throw new Error(`Payment method not found or not active`)
        }

        const getUser = await tx.users.findUnique({
          where: {
            telegramId: tgId,
          },
        })

        if (!getUser) {
          throw new Error(`User not found`)
        }

        const rates = await this.ratesService.getRates()

        const token = genToken()

        const convertedAmount =
          getMethod.currencyKey === CurrencyEnum.XTR
            ? amount
            : fxUtil(
                amount,
                CurrencyEnum.XTR,
                getMethod.currencyKey as CurrencyEnum,
                rates,
              )

        const paymentObject = {
          status: PaymentStatusEnum.PENDING,
          amount: convertedAmount,
          amountStars:
            getMethod.key === PaymentMethodEnum.STARS
              ? Number(amount.toFixed(0))
              : amount,
          currencyKey: getMethod.currencyKey,
          methodKey: getMethod.key,
          exchangeRate: rates.rates[getMethod.currencyKey],
          commission: getMethod.commission,
          token,
          userId: getUser.id,
        }

        let linkPay: string | null = null
        let isTmaIvoice = false
        if (getMethod.key === PaymentMethodEnum.STARS) {
          linkPay = await this.createTelegramInvoice(
            amount,
            token,
            `Adding ${amount} STARS to your balance`,
            `Adding ${amount} STARS to your balance`,
          )
          isTmaIvoice = true
        }

        if (!linkPay) {
          throw new Error(`LinkPay not found`)
        }

        const createPayment = await tx.payments.create({
          data: {
            ...paymentObject,
            linkPay,
          },
        })

        return {
          linkPay,
          isTmaIvoice,
        }
      })
    } catch (e) {
      this.logger.error({
        msg: `Error while creating invoice`,
        e,
      })
    }
  }

  public async createTelegramInvoice(
    amount: number,
    token: string,
    title: string,
    description: string,
  ) {
    try {
      const createInvoice = await this.bot.telegram.createInvoiceLink({
        title: title,
        description: description,
        provider_token: '',
        payload: token,
        currency: 'XTR',
        prices: [{ label: 'XTR', amount: Number(amount.toFixed(0)) }],
      })
      return createInvoice
    } catch (e) {
      this.logger.error({
        msg: `Error while creating invoice`,
        e,
      })
    }
  }

  public async updatePayment(
    token: string,
    status: PaymentStatusEnum,
    details?: object,
  ) {
    try {
      // TODO: 1. Логика обновления баланса пользователя. 2. Начисление реферальной комиссии. 3. Создание тразакций к балансам.

      const updatePayment = await this.prismaService.payments.update({
        where: {
          token,
        },
        data: {
          status,
          ...(details && { details }),
        },
      })

      if (!updatePayment) {
        throw new Error(`Payment not found`)
      }

      return {
        amountStars: updatePayment.amountStars,
      }
    } catch (e) {
      this.logger.error({
        msg: `Error while updating invoice`,
        e,
      })
    }
  }

  public async getPaymentMethods(
    isTma: boolean,
  ): Promise<PaymentMethodsDataInterface[]> {
    try {
      const getPaymentMethods =
        await this.prismaService.paymentMethods.findMany({
          where: {
            ...(isTma && {
              key: {
                in: [
                  PaymentMethodEnum.STARS,
                  // PaymentMethodEnum.TON_TON,
                  // PaymentMethodEnum.USDT_TON,
                  // PaymentMethodEnum.HMSTR_TON,
                  // PaymentMethodEnum.NOT_TON,
                  // PaymentMethodEnum.MAJOR_TON,
                  // PaymentMethodEnum.DOGS_TON,
                  // PaymentMethodEnum.CATS_TON,
                  // PaymentMethodEnum.JETTON_TON,
                  // PaymentMethodEnum.PX_TON,
                  // PaymentMethodEnum.CATI_TON,
                  // PaymentMethodEnum.GRAM_TON,
                ],
              },
            }),
            isActive: true,
          },
          include: {
            currency: {
              select: {
                key: true,
                name: true,
                symbol: true,
                type: true,
                rate: true,
              },
            },
          },
        })

      const methods: PaymentMethodsDataInterface[] = getPaymentMethods.map(
        (method) => {
          return {
            key: method.key as PaymentMethodEnum,
            name: method.name,
            isTonBlockchain: method.isTonBlockchain,
            tonSmartContractAddress: method.tonSmartContractAddress,
            minAmount: method.minAmount,
            maxAmount: method.maxAmount,
            commission: method.commission,
            isPlusCommission: method.isPlusCommission,
            type: method.type as PaymentMethodTypeEnum,
            system: method.system as PaymentSystemEnum,
            currency: {
              key: method.currency.key as CurrencyEnum,
              name: method.currency.name,
              symbol: method.currency.symbol,
              type: method.currency.type as CurrencyTypeEnum,
              rate: method.currency.rate,
            },
          }
        },
      )

      return methods
    } catch (e) {
      this.logger.error({
        msg: `Error while getting payment methods`,
        e,
      })
    }
  }
}
