import { ConfigService } from '@nestjs/config'
import { LoggerModuleAsyncParams } from 'nestjs-pino'
import { join } from 'path'

export const pinoConfig: LoggerModuleAsyncParams = {
  useFactory: async (configService: ConfigService) => ({
    pinoHttp: {
      transport: {
        targets: [
          {
            target: 'pino-pretty',
            level: 'info',
            options: {
              colorize: true,
              levelFirst: true,
              translateTime: 'yyyy-mm-dd HH:MM:ss',
              ignore: 'pid,hostname',
            },
          },
        ],
      },
    },
    // Это отдельный логгер, используемый через `Logger` из `nestjs-pino`
    pino: {
      transport: {
        targets: [
          {
            target: 'pino-pretty',
            level: 'info',
            options: {
              colorize: true,
              levelFirst: true,
              translateTime: 'yyyy-mm-dd HH:MM:ss',
              ignore: 'pid,hostname',
            },
          },
          {
            target: 'pino/file',
            level: 'info',
            options: {
              destination: join(process.cwd(), 'logs', 'info.log'),
              mkdir: true,
              maxSize: '5m',
              maxFiles: 5,
            },
          },
          {
            target: 'pino/file',
            level: 'error',
            options: {
              destination: join(process.cwd(), 'logs', 'error.log'),
              mkdir: true,
              maxSize: '5m',
              maxFiles: 5,
            },
          },
          {
            target: 'pino/file',
            level: 'debug',
            options: {
              destination: join(process.cwd(), 'logs', 'debug.log'),
              mkdir: true,
              maxSize: '5m',
              maxFiles: 5,
            },
          },
        ],
      },
      level: 'debug',
    },
  }),
  inject: [ConfigService],
}
