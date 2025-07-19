import { RatesService } from '@modules/rates/rates.service'
import { Controller, Get, HttpCode, HttpStatus, Req, Res } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { Public } from '@vpnsibcom/src/core/auth/decorators/public.decorator'
import { FastifyReply, FastifyRequest } from 'fastify'

@Controller('currency')
export class RatesController {
  constructor(private readonly ratesService: RatesService) {}

  @Get()
  @Public()
  @Throttle({ defaults: { limit: 5, ttl: 60 } })
  @HttpCode(HttpStatus.OK)
  async get(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const rates = await this.ratesService.getRates()
    const currencies = await this.ratesService.getCurrencies()
    return {
      data: {
        success: true,
        currencies: currencies,
        rates: rates,
      },
    }
  }
}
