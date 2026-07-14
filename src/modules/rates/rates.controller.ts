// rates.controller.ts
import { PreventDuplicateRequest } from '@core/auth/decorators/prevent-duplicate.decorator'
import { RatesService } from '@modules/rates/rates.service'
import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { Public } from '@vpnsibcom/src/core/auth/decorators/public.decorator'

@Controller('currency')
export class RatesController {
  constructor(private readonly ratesService: RatesService) {}

  @Get()
  @Public()
  @PreventDuplicateRequest(120)
  @Throttle({ defaults: { limit: 5, ttl: 60 } })
  @HttpCode(HttpStatus.OK)
  async get() {
    const { currencies, rates } = await this.ratesService.getCurrencyData()

    return {
      data: {
        success: true,
        currencies,
        rates,
      },
    }
  }
}
