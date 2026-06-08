import { PrismaService } from '@core/prisma/prisma.service'
import { Injectable, OnModuleInit } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { PinoLogger } from 'nestjs-pino'

@Injectable()
export class AcquisitionRepairService implements OnModuleInit {
  /** Сколько кандидатов обрабатываем за одну итерацию while-loop */
  private readonly BATCH_SIZE = 50

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {}

  async onModuleInit() {
    void this.runHourlyRepair().catch((error) => {
      this.logger.error('Error in AcquisitionRepairService onModuleInit', error)
    })
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Entry point
  // ─────────────────────────────────────────────────────────────────────────

  @Cron('0 * * * *')
  async runHourlyRepair(): Promise<void> {
    this.logger.info({ msg: '[AcquisitionRepair] hourly run started' })

    await this.cleanOrphanAcquisitions()
    await this.repairMissingReferrals()

    this.logger.info({ msg: '[AcquisitionRepair] hourly run finished' })
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 1 — Удаляем Acquisition-записи без привязанного пользователя
  // ─────────────────────────────────────────────────────────────────────────

  private async cleanOrphanAcquisitions(): Promise<void> {
    try {
      // Используем $executeRaw: он возвращает количество удалённых строк
      const deleted = await this.prisma.$executeRaw`
        DELETE FROM acquisitions
        WHERE id NOT IN (
          SELECT acquisition_id
          FROM users
          WHERE acquisition_id IS NOT NULL
        )
      `

      if (deleted > 0) {
        this.logger.info({
          msg: '[AcquisitionRepair] orphan acquisitions deleted',
          count: deleted,
        })
      }
    } catch (e) {
      this.logger.error({
        msg: '[AcquisitionRepair] failed to clean orphan acquisitions',
        e,
      })
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 2 — Восстанавливаем реферальные цепочки
  //
  // Ищем пользователей, у которых:
  //   • в Acquisition.firstReferralId есть значение (пришли по реф-ссылке)
  //   • нет ни одной записи в таблице referrals (inviters: { none: {} })
  //
  // Это именно те, кого bug #3 обошёл стороной.
  // ─────────────────────────────────────────────────────────────────────────

  private async repairMissingReferrals(): Promise<void> {
    let offset = 0
    let totalFixed = 0
    let totalSkipped = 0

    while (true) {
      const candidates = await this.prisma.users.findMany({
        where: {
          acquisition: { firstReferralId: { not: null } },
          inviters: { none: {} }, // ни одной входящей реферальной записи
        },
        select: {
          id: true,
          telegramData: { select: { isPremium: true } },
          acquisition: { select: { firstReferralId: true } },
        },
        skip: offset,
        take: this.BATCH_SIZE,
        orderBy: { createdAt: 'asc' }, // стабильная сортировка для батчей
      })

      if (candidates.length === 0) break

      for (const candidate of candidates) {
        const referralKey = candidate.acquisition!.firstReferralId!
        const isPremium = candidate.telegramData?.isPremium ?? false

        const created = await this.createReferralsForUser(
          candidate.id,
          referralKey,
          isPremium,
        )

        if (created) totalFixed++
        else totalSkipped++
      }

      // Если batch неполный — следующих записей нет
      if (candidates.length < this.BATCH_SIZE) break

      offset += this.BATCH_SIZE
    }

    if (totalFixed > 0 || totalSkipped > 0) {
      this.logger.info({
        msg: '[AcquisitionRepair] referral repair done',
        totalFixed,
        totalSkipped,
      })
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Логика создания цепочки — идентична createReferralsForExistingUser,
  // но без проверки возраста аккаунта: здесь мы целенаправленно чиним
  // старых пользователей, которых баг пропустил.
  // ─────────────────────────────────────────────────────────────────────────

  private async createReferralsForUser(
    userId: string,
    referralKey: string,
    isPremium: boolean,
  ): Promise<boolean> {
    try {
      // Ищем пригласившего по его telegramId (referralKey — это telegramId)
      const inviterLvl1 = await this.prisma.users.findUnique({
        where: { telegramId: referralKey },
        include: {
          inviters: {
            include: {
              inviter: {
                include: { inviters: true },
              },
            },
          },
        },
      })

      if (!inviterLvl1) {
        this.logger.warn({
          msg: '[AcquisitionRepair] inviter not found, skipping',
          userId,
          referralKey,
        })
        return false
      }

      // Строим цепочку до 3-го уровня — точно так же, как в createUser
      const referrals: Array<{
        level: number
        inviterId: string
        referralId: string
        isPremium: boolean
      }> = [
        { level: 1, inviterId: inviterLvl1.id, referralId: userId, isPremium },
      ]

      for (const lvl2 of inviterLvl1.inviters) {
        referrals.push({
          level: 2,
          inviterId: lvl2.inviter.id,
          referralId: userId,
          isPremium,
        })

        for (const lvl3 of lvl2.inviter.inviters) {
          referrals.push({
            level: 3,
            inviterId: lvl3.inviterId,
            referralId: userId,
            isPremium,
          })
        }
      }

      // skipDuplicates страхует от гонки, если крон запустился дважды
      await this.prisma.referrals.createMany({
        data: referrals,
        skipDuplicates: true,
      })

      this.logger.info({
        msg: '[AcquisitionRepair] referrals created for user',
        userId,
        referralKey,
        levelsCreated: referrals.length,
      })

      return true
    } catch (e) {
      this.logger.error({
        msg: '[AcquisitionRepair] failed to create referrals for user',
        userId,
        referralKey,
        e,
      })
      return false
    }
  }
}
