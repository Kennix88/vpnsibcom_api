import { LanguagesData } from '@core/prisma/data/languages.data'
import { RolesData } from '@core/prisma/data/roles.data'
import { SettingsData } from '@core/prisma/data/settings.data'
import { Logger } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'

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

  Logger.log('Settings added successfully', 'Prisma-Seed')

  await prisma.roles.createMany({
    data: RolesData,
    skipDuplicates: true,
  })

  Logger.log('Roles added successfully', 'Prisma-Seed')

  await prisma.language.createMany({
    data: LanguagesData,
    skipDuplicates: true,
  })

  Logger.log('Languages added successfully', 'Prisma-Seed')

  Logger.log('COMPLETED', 'Prisma-Seed')
  return
}
