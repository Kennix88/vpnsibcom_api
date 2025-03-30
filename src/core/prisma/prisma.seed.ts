import { SettingsData } from '@core/prisma/data/settings.data'
import { BadRequestException, Logger } from '@nestjs/common'
import { Prisma, PrismaClient } from '@prisma/generated'

const prisma = new PrismaClient({
  transactionOptions: {
    maxWait: 5000,
    timeout: 10000,
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  },
})

async function main() {
  Logger.log('The beginning of filling in the database')

  await prisma.settings.create({
    data: { ...SettingsData },
  })

  Logger.log('Settings added successfully')
}

main()
  .catch((e) => {
    Logger.error(e)
    throw new BadRequestException('Error filling in the database')
  })
  .finally(async () => {
    Logger.log('Closing the database connection...')
    await prisma.$disconnect()
    Logger.log('The database connection has been successfully closed')
  })
