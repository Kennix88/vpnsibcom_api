import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { FastifyRequest } from 'fastify'
import { PinoLogger } from 'nestjs-pino'

@Controller('auth')
export class AuthController {
  constructor(
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {}

  @UsePipes(new ValidationPipe())
  @HttpCode(HttpStatus.OK)
  @Post('telegram')
  async authTelegram(@Req() req: FastifyRequest) {}
}
