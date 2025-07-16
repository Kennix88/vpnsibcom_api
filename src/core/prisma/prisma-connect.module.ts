import { Global, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaModule } from 'nestjs-prisma'
import { PrismaService } from './prisma.service'

@Global()
@Module({
  imports: [
    PrismaModule.forRootAsync({
      isGlobal: true,
      useFactory: (config: ConfigService) => {
        const isProd = config.get('NODE_ENV') === 'production'
        return {
          prismaOptions: {
            log: isProd ? ['warn', 'error'] : ['info', 'warn', 'error'],
            datasources: {
              db: {
                url: config.getOrThrow<string>('POSTGRES_URL'),
              },
            },
          },
        }
      },
      inject: [ConfigService],
    }),
  ],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaConnectModule {}
