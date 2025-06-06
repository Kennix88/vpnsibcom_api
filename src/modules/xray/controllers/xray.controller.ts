import { AuthService } from '@core/auth/auth.service'
import { CurrentUser } from '@core/auth/decorators/current-user.decorator'
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard'
import { UsersService } from '@modules/users/users.service'
import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { JwtPayload } from '@shared/types/jwt-payload.interface'
import { FastifyReply, FastifyRequest } from 'fastify'
import { PinoLogger } from 'nestjs-pino'
import { ServersService } from '../services/servers.service'

@Controller('servers')
export class ServersController {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UsersService,
    private readonly serversService: ServersService,
    private readonly logger: PinoLogger,
  ) {}

  @Get()
  @Throttle({ defaults: { limit: 5, ttl: 60 } })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getServers(
    @CurrentUser() user: JwtPayload,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    try {
      this.logger.info(
        `Получение серверов для пользователя: ${user.telegramId}`,
      )

      const token = req.headers.authorization?.split(' ')[1]
      if (!token) {
        throw new BadRequestException('Токен авторизации отсутствует')
      }

      await this.authService.updateUserActivity(token)

      const servers = await this.serversService.getAll()

      if (!servers) {
        this.logger.warn(
          `Не удалось получить сервера для пользователя: ${user.telegramId}`,
        )
        res.status(HttpStatus.NOT_FOUND)
        return {
          data: {
            success: false,
            message: 'Сервера не найдены',
          },
        }
      }

      return {
        data: {
          success: true,
          ...servers,
        },
      }
    } catch (error) {
      this.logger.error(
        `Ошибка при получение серверов: ${error.message}`,
        error.stack,
      )
      throw new InternalServerErrorException(
        'Произошла ошибка при получение серверов',
      )
    }
  }

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
    const isGreen = await this.serversService.greenCheck(ip)

    return {
      data: {
        success: true,
        isGreen: isGreen,
        ip: ip,
      },
    }
  }
}
