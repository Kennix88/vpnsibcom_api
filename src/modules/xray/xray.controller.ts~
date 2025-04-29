import { AuthService } from '@core/auth/auth.service'
import { UsersService } from '@modules/users/users.service'
import { XrayService } from '@modules/xray/xray.service'
import { Controller, Get, HttpCode, HttpStatus, Req, Res } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { FastifyReply, FastifyRequest } from 'fastify'
import { PinoLogger } from 'nestjs-pino'

@Controller('xray')
export class XrayController {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UsersService,
    private readonly xrayService: XrayService,
    private readonly logger: PinoLogger,
  ) {}

  @Get('green-check')
  @Throttle({ defaults: { limit: 5, ttl: 60 } })
  @HttpCode(HttpStatus.OK)
  async greenCheck(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const ip =
      req.ip == '::1' || req.ip == '127.0.0.1'
        ? req.headers['cf-connecting-ip']
          ? (req.headers['cf-connecting-ip'] as string)
          : (req.headers['x-forwarded-for'] as string)
        : req.ip
    this.logger.info('IP: ' + ip + JSON.stringify(req.headers, null, 2))
    const isGreen = await this.xrayService.greenCheck(ip)

    return {
      data: {
        success: true,
        isGreen: isGreen,
        ip: ip,
      },
    }
  }
}
