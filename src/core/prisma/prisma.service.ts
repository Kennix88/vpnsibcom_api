import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './generated/client'

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name)

  constructor() {
    const pool = new PrismaPg({ connectionString: process.env.POSTGRES_URL! })
    super({ adapter: pool })
  }

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

  // Proxy calls to extended client if needed, or just use the base methods.
  // Note: In NestJS, if we want the service itself to use the extended client,
  // we might need to change how it's used throughout the app.
}
