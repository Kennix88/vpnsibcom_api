import { Controller, Get, HttpCode, HttpStatus, Req, Res } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { FastifyReply, FastifyRequest } from 'fastify'
import { PinoLogger } from 'nestjs-pino'
import { ServersService } from '../services/servers.service'
import { getClientIp } from '../utils/get-client-ip.util'

@Controller('servers')
export class ServersController {
  constructor(
    private readonly serversService: ServersService,
    private readonly logger: PinoLogger,
  ) {}

  @Get('green-check')
  @Throttle({ defaults: { limit: 20, ttl: 60 } })
  @HttpCode(HttpStatus.OK)
  async greenCheck(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) _res: FastifyReply,
  ) {
    const ip = getClientIp(req)

    if (!ip) {
      return { data: { success: false, isGreen: false, ip: 'unknown' } }
    }

    try {
      const isGreen = await this.serversService.greenCheck(ip)
      return { data: { success: true, isGreen, ip } }
    } catch (error) {
      this.logger.error(error, 'GreenCheckError')
      return { data: { success: false, isGreen: false, ip } }
    }
  }
}
