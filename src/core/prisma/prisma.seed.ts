import { AdsNetworksData } from '@core/prisma/data/ads-networks.data'
import { CurrencyData } from '@core/prisma/data/currency.data'
import { LanguagesData } from '@core/prisma/data/languages.data'
import { OldUsersData } from '@core/prisma/data/old-users.data'
import { PaymentMethodsData } from '@core/prisma/data/payment-methods.data'
import { RolesData } from '@core/prisma/data/roles.data'
import { SettingsData } from '@core/prisma/data/settings.data'
import { Logger } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { UserRolesEnum } from '@shared/enums/user-roles.enum'

const prisma = new PrismaClient({
  transactionOptions: {
    maxWait: 5000,
    timeout: 10000,
    isolationLevel: 'Serializable',
  },
})

export async function PrismaSeed() {
  Logger.log('The beginning of filling in the database', 'Prisma-Seed')

  await prisma.settings.createMany({
    data: SettingsData,
    skipDuplicates: true,
  })

  Logger.log('Settings: added successfully', 'Prisma-Seed')

  await prisma.roles.createMany({
    data: RolesData,
    skipDuplicates: true,
  })

  Logger.log('Roles: added successfully', 'Prisma-Seed')

  await prisma.language.createMany({
    data: LanguagesData,
    skipDuplicates: true,
  })

  Logger.log('Languages: added successfully', 'Prisma-Seed')

  await prisma.currency.createMany({
    data: CurrencyData,
    skipDuplicates: true,
  })

  Logger.log('Currencies: added successfully', 'Prisma-Seed')

  await prisma.adsNetworks.createMany({
    data: AdsNetworksData,
    skipDuplicates: true,
  })

  Logger.log('Ads networks: added successfully', 'Prisma-Seed')

  await prisma.paymentMethods.createMany({
    data: PaymentMethodsData,
    skipDuplicates: true,
  })

  Logger.log('Payment methods: added successfully', 'Prisma-Seed')

  for (const el of OldUsersData) {
    const getUser = await prisma.users.findUnique({
      where: {
        telegramId: el.telegramId,
      },
    })
    if (!getUser) {
      await prisma.$transaction(async (tx) => {
        const balance = await tx.userBalance.create({
          data: {
            paymentBalance: el.balance,
          },
        })
        const tdata = await tx.userTelegramData.create({
          data: {
            firstName: 'ANONIM',
            languageCode: 'ru',
          },
        })
        const language = await tx.language.findUnique({
          where: {
            iso6393: el.language,
          },
        })

        await tx.users.create({
          data: {
            telegramId: el.telegramId,
            languageId: language.id,
            balanceId: balance.id,
            roleId: UserRolesEnum.OLD_USER,
            telegramDataId: tdata.id,
          },
        })
      })
    }
  }

  Logger.log(
    'Users + UsersTelegramData + UserBalance: added successfully',
    'Prisma-Seed',
  )

  const referrals = []
  for (const el of OldUsersData) {
    for (const refLvl1 of el.referrals) {
      const inviterLvl1 = await prisma.users.findUnique({
        where: {
          telegramId: el.telegramId,
        },
      })
      const referralLvl1 = await prisma.users.findUnique({
        where: {
          telegramId: refLvl1,
        },
      })

      referrals.push({
        level: 1,
        inviterId: inviterLvl1.id,
        referralId: referralLvl1.id,
      })

      const getOldRefLvl1 = OldUsersData.find(
        (old) => old.telegramId === refLvl1,
      )

      for (const refLvl2 of getOldRefLvl1.referrals) {
        const inviterLvl2 = await prisma.users.findUnique({
          where: {
            telegramId: refLvl1,
          },
        })
        const referralLvl2 = await prisma.users.findUnique({
          where: {
            telegramId: refLvl2,
          },
        })

        referrals.push({
          level: 2,
          inviterId: inviterLvl2.id,
          referralId: referralLvl2.id,
        })

        const getOldRefLvl2 = OldUsersData.find(
          (old) => old.telegramId === refLvl2,
        )

        for (const refLvl3 of getOldRefLvl2.referrals) {
          const inviterLvl3 = await prisma.users.findUnique({
            where: {
              telegramId: refLvl2,
            },
          })
          const referralLvl3 = await prisma.users.findUnique({
            where: {
              telegramId: refLvl3,
            },
          })

          referrals.push({
            level: 3,
            inviterId: inviterLvl3.id,
            referralId: referralLvl3.id,
          })
        }
      }
    }
  }
  await prisma.referrals.createMany({
    data: referrals,
    skipDuplicates: true,
  })

  Logger.log('Referrals: added successfully', 'Prisma-Seed')

  Logger.log('COMPLETED', 'Prisma-Seed')
  return
}
