import { ConfigService } from '@nestjs/config'
import { LoggerModuleAsyncParams } from 'nestjs-pino'
import { join } from 'path'

export const pinoConfig: LoggerModuleAsyncParams = {
  useFactory: async (configService: ConfigService) => ({
    pinoHttp: {
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: false,
          levelFirst: true,
          translateTime: 'yyyy-mm-dd HH:MM:ss',
          ignore: 'pid,hostname',
          destination: join(process.cwd(), 'logs', 'app.log'),
        },
      },
      level: 'info',
    },
    pino: {
      transport: {
        targets: [
          {
            target: 'pino/file',
            level: 'info',
            options: {
              destination: 'logs/info.log',
              mkdir: true,
              maxSize: '1m',
              maxFiles: 3,
            },
          },
          {
            target: 'pino/file',
            level: 'error',
            options: {
              destination: 'logs/error.log',
              mkdir: true,
              maxSize: '1m',
              maxFiles: 3,
            },
          },
          {
            target: 'pino/file',
            level: 'debug',
            options: {
              destination: 'logs/debug.log',
              mkdir: true,
              maxSize: '1m',
              maxFiles: 3,
            },
          },
        ],
      },
    },
  }),
  inject: [ConfigService],
}
