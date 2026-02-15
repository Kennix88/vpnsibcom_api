import { ConfigService } from '@nestjs/config'
import { LoggerModuleAsyncParams } from 'nestjs-pino'
import { join } from 'path'
import { IS_DEV_ENV } from '@shared/utils/is-dev.util'

// Определяем типы для разных целей логирования
type ConsoleTargetOptions = {
  colorize: boolean
  levelFirst: boolean
  translateTime: string
  ignore: string
}

type FileTargetOptions = {
  destination: string
  mkdir: boolean
  maxSize: string
  maxFiles: number
}

type ConsoleTarget = {
  target: string
  level: string
  options: ConsoleTargetOptions
}

type FileTarget = {
  target: string
  level: string
  options: FileTargetOptions
}

// Общий тип для всех целей логирования
type LogTarget = ConsoleTarget | FileTarget

export const pinoConfig: LoggerModuleAsyncParams = {
  useFactory: async (configService: ConfigService) => {
    const isDevelopment = configService.get('NODE_ENV') === 'development'
    
    // Базовые настройки для консольного логгера
    const consoleTarget: ConsoleTarget = {
      target: 'pino-pretty',
      level: 'info',
      options: {
        colorize: true,
        levelFirst: true,
        translateTime: 'yyyy-mm-dd HH:MM:ss',
        ignore: 'pid,hostname',
      },
    }
    
    // Настройки для файловых логгеров
    const fileTargets: FileTarget[] = [
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
    ]
    
    // Определяем целевые логгеры в зависимости от режима
    const pinoTargets: LogTarget[] = [consoleTarget]
    
    // В режиме разработки и продакшн добавляем файловые логгеры
    // Это исправляет проблему с отсутствием логов в файлах в режиме разработки
    pinoTargets.push(...fileTargets)
    
    return {
      pinoHttp: {
        transport: {
          targets: [consoleTarget],
        },
      },
      // Это отдельный логгер, используемый через `Logger` из `nestjs-pino`
      pino: {
        transport: {
          targets: pinoTargets,
        },
        level: 'debug',
      },
    }
  },
  inject: [ConfigService],
}
