import { PrismaService } from '@core/prisma/prisma.service'
import { Global, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaModule } from 'nestjs-prisma'

@Global()
@Module({
  imports: [
    PrismaModule.forRootAsync({
      isGlobal: true,
      useFactory: (config: ConfigService) => ({
        prismaOptions: {
          log: ['info', 'warn', 'error'],
          datasources: {
            db: {
              url: config.getOrThrow<string>('POSTGRES_URL'),
            },
          },
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaConnectModule {}
