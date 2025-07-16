import { Controller, Get } from '@nestjs/common'

@Controller()
export class CoreController {
  @Get('health')
  health() {
    return {
      status: 'ok',
      uptime: process.uptime(),
      environment: process.env.NODE_ENV,
    }
  }
}
