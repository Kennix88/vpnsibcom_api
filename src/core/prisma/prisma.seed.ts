import { BadRequestException, Logger } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { SettingsData } from './data/settings.data'

const prisma = new PrismaClient({
  transactionOptions: {
    maxWait: 5000,
    timeout: 10000,
  },
})

async function main() {
  Logger.log('The beginning of filling in the database', 'Prisma-Seed')

  await prisma.settings.create({
    data: { ...SettingsData },
  })

  Logger.log('Settings added successfully', 'Prisma-Seed')
}

main()
  .catch((e) => {
    Logger.error(e)
    throw new BadRequestException(
      'Error filling in the database',
      'Prisma-Seed',
    )
  })
  .finally(async () => {
    Logger.log('Closing the database connection...', 'Prisma-Seed')
    await prisma.$disconnect()
    Logger.log(
      'The database connection has been successfully closed',
      'Prisma-Seed',
    )
  })
