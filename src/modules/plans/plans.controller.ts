import { PreventDuplicateRequest } from '@core/auth/decorators/prevent-duplicate.decorator'
import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { PlansService } from './plans.service'

@Controller('plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  @Throttle({ defaults: { limit: 5, ttl: 60 } })
  @PreventDuplicateRequest(120)
  @HttpCode(HttpStatus.OK)
  async getAll() {
    const plans = await this.plansService.getPlans()

    return {
      data: {
        success: true,
        plans,
      },
    }
  }
}
