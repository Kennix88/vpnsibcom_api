import { Injectable } from '@nestjs/common'
import { PinoLogger } from 'nestjs-pino'
import { PrismaService } from 'nestjs-prisma'
import {
  ServerDataInterface,
  ServersResponseDataInterface,
} from '../types/servers-data.interface'

@Injectable()
export class ServersService {
  private readonly serviceName = 'ServersService'
  constructor(
    private readonly prismaService: PrismaService,
    private readonly logger: PinoLogger,
  ) {}

  public async getAll(): Promise<ServersResponseDataInterface> {
    const servers = await this.prismaService.greenList.findMany({
      where: {
        isActive: true,
      },
    })

    let baseServersCount = 0
    let premiumServersCount = 0

    const serversMapped: ServerDataInterface[] = servers.map((server) => {
      if (server.isPremium) premiumServersCount++
      else baseServersCount++

      return {
        code: server.code,
        name: server.name,
        flagKey: server.flagKey,
        flagEmoji: server.flagEmoji,
        network: server.network,
        isActive: server.isActive,
        isPremium: server.isPremium,
      }
    })

    return {
      baseServersCount,
      premiumServersCount,
      servers: serversMapped,
    }
  }

  /**
   * Проверяет, находится ли IP в зеленом списке
   * @param ip - IP-адрес для проверки
   * @returns true, если IP в зеленом списке, иначе false
   */
  public async greenCheck(ip: string): Promise<boolean> {
    try {
      if (!ip || typeof ip !== 'string') {
        this.logger.warn({
          msg: `Некорректный IP-адрес для проверки: ${ip}`,
          service: this.serviceName,
        })
        return false
      }

      this.logger.info({
        msg: `Проверка IP в зеленом списке: ${ip}`,
        service: this.serviceName,
      })

      const getIp = await this.prismaService.greenList.findUnique({
        where: {
          green: ip,
        },
      })

      const result = !!getIp

      this.logger.info({
        msg: `Результат проверки IP ${ip} в зеленом списке: ${
          result ? 'найден' : 'не найден'
        }`,
        service: this.serviceName,
      })

      return result
    } catch (error) {
      this.logger.error({
        msg: `Ошибка при проверке IP в зеленом списке: ${ip}`,
        error,
        stack: error instanceof Error ? error.stack : undefined,
        service: this.serviceName,
      })
      return false
    }
  }
}
