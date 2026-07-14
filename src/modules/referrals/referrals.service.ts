import { Prisma } from '@core/prisma/generated/client'

import { PrismaService } from '@core/prisma/prisma.service'
import { UsersService } from '@modules/users/services/users.service'
import { Injectable } from '@nestjs/common'
import { BalanceTypeEnum } from '@shared/enums/balance-type.enum'
import { DefaultEnum } from '@shared/enums/default.enum'
import { PaymentMethodEnum } from '@shared/enums/payment-method.enum'
import { TransactionReasonEnum } from '@shared/enums/transaction-reason.enum'
import { ReferralsDataInterface } from '@shared/types/referrals-data.interface'
import { addDays } from 'date-fns'
import { PinoLogger } from 'nestjs-pino'

/**
 * Тип клиента транзакции Prisma (то, что приходит в $transaction(async (tx) => ...))
 */
type PrismaTx = Prisma.TransactionClient

/**
 * Настройки, необходимые для расчёта реферальных начислений.
 * Используем Pick, чтобы явно видеть, какие поля Settings реально нужны сервису,
 * а не тянуть весь объект как `any`.
 */
type ReferralSettings = Pick<
  Prisma.SettingsGetPayload<true>,
  | 'referralOneLevelPercent'
  | 'referralTwoLevelPercent'
  | 'referralThreeLevelPercent'
  | 'tgStarsToUSD'
>

/**
 * Запись referrals вместе с инвайтером и его балансом — именно такой include
 * должен быть на payment.user.inviters при загрузке платежа выше по стеку.
 */
type ReferrerWithInviter = Prisma.ReferralsGetPayload<{
  include: {
    inviter: {
      include: {
        balance: true
      }
    }
  }
}>

/**
 * Минимальный контракт платежа, необходимый ReferralsService.
 * Заменить на реальный Prisma.PaymentsGetPayload<{...}>, если у вас есть
 * точный include, использованный при загрузке payment в вызывающем коде.
 */
interface PaymentForReferralCommission {
  userId: string
  amountStars: number
  amountStarsFeeTgPartner: number | null
  isTgPartnerProgram: boolean
  methodKey: PaymentMethodEnum
  user: {
    id: string
    inviters: ReferrerWithInviter[]
  }
}

@Injectable()
export class ReferralsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly logger: PinoLogger,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Возвращает агрегированную статистику по рефералам пользователя.
   * Считается на стороне БД через groupBy — не тянем все строки referrals в память.
   */
  public async getReferrals(
    tgId: string,
  ): Promise<ReferralsDataInterface | null> {
    const user = await this.prismaService.users.findUnique({
      where: { telegramId: tgId },
      select: { id: true },
    })

    if (!user) {
      this.logger.warn({
        msg: `User not found while getting referrals`,
        tgId,
      })
      return null
    }

    const [grouped, settings] = await Promise.all([
      this.prismaService.referrals.groupBy({
        by: ['level'],
        where: { inviterId: user.id },
        _count: { _all: true },
        _sum: { totalUsdtRewarded: true },
      }),
      this.prismaService.settings.findUnique({
        where: { key: DefaultEnum.DEFAULT },
      }),
    ])

    if (!settings) {
      this.logger.warn({
        msg: `Default settings not found while getting referrals`,
        tgId,
      })
      return null
    }

    const byLevel = new Map(grouped.map((row) => [row.level, row]))
    const countOf = (level: number) => byLevel.get(level)?._count._all ?? 0
    const sumOf = (level: number) =>
      Number(byLevel.get(level)?._sum.totalUsdtRewarded ?? 0)

    return {
      lvl1TotalUsdtRewarded: sumOf(1),
      lvl2TotalUsdtRewarded: sumOf(2),
      lvl3TotalUsdtRewarded: sumOf(3),
      lvl1Percent: settings.referralOneLevelPercent,
      lvl2Percent: settings.referralTwoLevelPercent,
      lvl3Percent: settings.referralThreeLevelPercent,
      lvl1Count: countOf(1),
      lvl2Count: countOf(2),
      lvl3Count: countOf(3),
    }
  }

  public async processReferralCommissions(
    tx: PrismaTx,
    payment: PaymentForReferralCommission,
  ): Promise<void> {
    const referrers = payment.user.inviters
    if (!referrers?.length) return
    this.logger.info({
      msg: `Processing referral commissions`,
      referrersCount: referrers.length,
      userId: payment.user.id,
    })
    const settings = await tx.settings.findUnique({
      where: { key: DefaultEnum.DEFAULT },
      select: {
        referralOneLevelPercent: true,
        referralTwoLevelPercent: true,
        referralThreeLevelPercent: true,
        tgStarsToUSD: true,
      },
    })
    if (!settings) {
      this.logger.warn({
        msg: `Default settings not found, skipping referral commissions`,
      })
      return
    }
    // Каждый referrer затрагивает свою собственную строку referrals и свой
    // собственный баланс — строки не пересекаются, поэтому безопасно
    //  обрабатывать их параллельно внутри одной транзакции.
    await Promise.all(
      referrers.map((referrer) =>
        this.processReferralCommission(tx, referrer, settings, payment),
      ),
    )
  }

  private async processReferralCommission(
    tx: PrismaTx,
    referrer: ReferrerWithInviter,
    settings: ReferralSettings,
    payment: PaymentForReferralCommission,
  ): Promise<void> {
    const commissionLvl = this.getReferralCommissionPercent(
      referrer.level,
      settings,
    )
    if (commissionLvl <= 0) return

    const amountStars = new Prisma.Decimal(payment.amountStars)
    const tgPartnerCommission =
      payment.isTgPartnerProgram &&
      payment.methodKey === PaymentMethodEnum.STARS
        ? new Prisma.Decimal(payment.amountStarsFeeTgPartner ?? 0)
        : new Prisma.Decimal(0)

    const commissionBaseStars = amountStars.minus(tgPartnerCommission)
    const referralCommissionStars = commissionBaseStars
      .mul(commissionLvl)
      .toDecimalPlaces(3)

    if (referralCommissionStars.lessThanOrEqualTo(0)) return

    const referralCommissionUsdt = referralCommissionStars.mul(
      settings.tgStarsToUSD,
    )
    const isStarsHold = payment.methodKey === PaymentMethodEnum.STARS

    this.logger.info({
      msg: `Calculated referral commission`,
      referralCommissionStars: referralCommissionStars.toString(),
      referralCommissionUsdt: referralCommissionUsdt.toString(),
      commissionLvl,
      referrerLevel: referrer.level,
      referrerId: referrer.inviter.id,
    })

    await tx.referrals.update({
      where: { id: referrer.id },
      data: {
        isActivated: true,
        totalUsdtRewarded: { increment: referralCommissionUsdt },
      },
    })

    // Начисление USDT — через общий метод: атомарный increment колонки
    // + запись Transactions в той же строке кода, что и во всех остальных
    // местах системы (единая точка правды вместо ручного update+createMany).
    const usdtResult = await this.usersService.addUserBalance(
      referrer.inviter.id,
      referralCommissionUsdt,
      TransactionReasonEnum.REFERRAL,
      BalanceTypeEnum.USDT,
      tx,
    )

    if (!usdtResult.success) {
      this.logger.error({
        msg: `Failed to credit referral USDT commission`,
        referrerId: referrer.inviter.id,
      })
      return
    }

    // HOLD начисляется только для платежей Stars — и требует holdExpiredAt,
    // который теперь можно передать как extra-параметр в общий метод.
    if (isStarsHold) {
      const holdResult = await this.usersService.addUserBalance(
        referrer.inviter.id,
        referralCommissionStars,
        TransactionReasonEnum.REFERRAL,
        BalanceTypeEnum.HOLD,
        tx,
        { holdExpiredAt: addDays(new Date(), 21) },
      )

      if (!holdResult.success) {
        this.logger.error({
          msg: `Failed to credit referral HOLD commission`,
          referrerId: referrer.inviter.id,
        })
      }
    }

    this.logger.info({
      msg: `Updated referrer balance`,
      referrerId: referrer.inviter.id,
      balanceId: referrer.inviter.balanceId,
      amountUsdt: referralCommissionUsdt.toString(),
    })
  }

  private getReferralCommissionPercent(
    level: number,
    settings: ReferralSettings,
  ): number {
    switch (level) {
      case 1:
        return settings.referralOneLevelPercent
      case 2:
        return settings.referralTwoLevelPercent
      case 3:
        return settings.referralThreeLevelPercent
      default:
        return 0
    }
  }
}
