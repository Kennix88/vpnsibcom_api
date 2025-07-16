import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PrismaService as NestjsPrismaService } from 'nestjs-prisma'

export class PrismaService
  extends NestjsPrismaService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name)

  async onModuleInit() {
    try {
      await this.$connect()
      this.logger.log('Prisma connected to the database successfully')
    } catch (error) {
      this.logger.error('Failed to connect to the database', error)
      throw error
    }
  }

  async onModuleDestroy() {
    await this.$disconnect()
    this.logger.log('Prisma disconnected from the database')
  }

  // Можно добавить кастомные методы, если нужно
}
