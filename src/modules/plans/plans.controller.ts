import { Controller, Get, HttpCode, HttpStatus, Req, Res } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { FastifyReply, FastifyRequest } from 'fastify'
import { PinoLogger } from 'nestjs-pino'
import { PlansService } from './plans.service'

@Controller('plans')
export class PlansController {
  constructor(
    private readonly plansService: PlansService,
    private readonly logger: PinoLogger,
  ) {}

  @Get()
  @Throttle({ defaults: { limit: 5, ttl: 60 } })
  @HttpCode(HttpStatus.OK)
  async getAll(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const plans = await this.plansService.getPlans()

    return {
      data: {
        success: true,
        plans: plans,
      },
    }
  }
}
