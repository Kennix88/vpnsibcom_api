import { CurrentUser } from '@core/auth/decorators/current-user.decorator'
import { PreventDuplicateRequest } from '@core/auth/decorators/prevent-duplicate.decorator'
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard'
import { AuthService } from '@core/auth/services/auth.service'
import { UsersService } from '@modules/users/services/users.service'
import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { JwtPayload } from '@shared/types/jwt-payload.interface'
import { FastifyRequest } from 'fastify'
import { PinoLogger } from 'nestjs-pino'
import { NewEraService } from '../services/new-era.service'

@Controller('new-era')
export class NewEraController {
  constructor(
    private readonly authService: AuthService,
    private readonly newEraService: NewEraService,
    private readonly logger: PinoLogger,
    private readonly userService: UsersService,
  ) {}

  private async refreshActivity(req: FastifyRequest): Promise<void> {
    const token = req.headers.authorization?.split(' ')[1]
    if (token) {
      await this.authService.updateUserActivity(token)
    }
  }

  @Post('extensions')
  @UseGuards(JwtAuthGuard)
  @Throttle({ defaults: { limit: 10, ttl: 60 } })
  @HttpCode(HttpStatus.OK)
  async checkExtensions(
    @CurrentUser() user: JwtPayload,
    @Req() req: FastifyRequest,
  ) {
    try {
      await this.refreshActivity(req)
      this.logger.info(
        `Проверка расширений подписок для пользователя: ${user.telegramId}`,
      )

      const [extensions, userData] = await Promise.all([
        this.newEraService.checkSubscriptionTasksByUserId(user.sub),
        this.userService.getResUserByTgId(user.telegramId),
      ])

      if (!extensions || !extensions.success) {
        throw new InternalServerErrorException(
          'Произошла ошибка при проверки расширений подписки',
        )
      }

      return { success: true, extensions: extensions.data, user: userData }
    } catch (error) {
      if (error instanceof HttpException) throw error
      this.logger.error(
        `Ошибка при проверки расширений подписки: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      )
      throw new InternalServerErrorException(
        'Произошла ошибка при проверки расширений подписки',
      )
    }
  }

  @Get('extensions')
  @UseGuards(JwtAuthGuard)
  @Throttle({ defaults: { limit: 10, ttl: 60 } })
  @HttpCode(HttpStatus.OK)
  async getExtensions(
    @CurrentUser() user: JwtPayload,
    @Req() req: FastifyRequest,
  ) {
    try {
      await this.refreshActivity(req)
      this.logger.info(
        `Получение расширений подписок для пользователя: ${user.telegramId}`,
      )

      const [extensions, userData] = await Promise.all([
        this.newEraService.getSubscriptionExtensionsWithConditionsByUserId(
          user.sub,
        ),
        this.userService.getResUserByTgId(user.telegramId),
      ])

      if (!extensions || !extensions.success) {
        throw new InternalServerErrorException(
          'Произошла ошибка при получении расширений подписки',
        )
      }

      return { success: true, extensions: extensions.data, user: userData }
    } catch (error) {
      if (error instanceof HttpException) throw error
      this.logger.error(
        `Ошибка при получении расширений подписки: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      )
      throw new InternalServerErrorException(
        'Произошла ошибка при получении расширений подписки',
      )
    }
  }

  @Get('sub')
  @UseGuards(JwtAuthGuard)
  @Throttle({ defaults: { limit: 10, ttl: 60 } })
  @HttpCode(HttpStatus.OK)
  async get(@CurrentUser() user: JwtPayload, @Req() req: FastifyRequest) {
    try {
      await this.refreshActivity(req)
      this.logger.info(
        `Получение подписок для пользователя: ${user.telegramId}`,
      )

      const [subscription, userData] = await Promise.all([
        this.newEraService.getNewEraSubByUserId(user.sub),
        this.userService.getResUserByTgId(user.telegramId),
      ])

      if (!subscription || !subscription.success) {
        throw new InternalServerErrorException(
          'Произошла ошибка при получении подписки',
        )
      }

      return { success: true, subscription: subscription.data, user: userData }
    } catch (error) {
      if (error instanceof HttpException) throw error
      this.logger.error(
        `Ошибка при получении подписки: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      )
      throw new InternalServerErrorException(
        'Произошла ошибка при получении подписки',
      )
    }
  }

  @Delete('device/:hwid')
  @UseGuards(JwtAuthGuard)
  @PreventDuplicateRequest(60)
  @Throttle({ defaults: { limit: 10, ttl: 60 } })
  @HttpCode(HttpStatus.OK)
  async deleteSub(
    @Param('hwid') hwid: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: FastifyRequest,
  ) {
    try {
      await this.refreshActivity(req)
      this.logger.info(`Удаление устройства пользователя: ${user.telegramId}`)

      const [subscription, userData] = await Promise.all([
        this.newEraService.deleteDevice(user.sub, hwid),
        this.userService.getResUserByTgId(user.telegramId),
      ])

      if (!subscription || !subscription.success) {
        throw new InternalServerErrorException(
          'Произошла ошибка при Удаление устройства',
        )
      }

      return { success: true, subscription: subscription.data, user: userData }
    } catch (error) {
      if (error instanceof HttpException) throw error
      this.logger.error(
        `Ошибка при Удаление устройства: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      )
      throw new InternalServerErrorException(
        'Произошла ошибка при Удаление устройства',
      )
    }
  }

  @Post('sub')
  @UseGuards(JwtAuthGuard)
  @PreventDuplicateRequest(60)
  @Throttle({ defaults: { limit: 10, ttl: 60 } })
  @HttpCode(HttpStatus.OK)
  async renewing(@CurrentUser() user: JwtPayload, @Req() req: FastifyRequest) {
    try {
      await this.refreshActivity(req)
      this.logger.info(`Продление подписки пользователя: ${user.telegramId}`)

      const [subscription, userData] = await Promise.all([
        this.newEraService.renewingNewEraSubByUserId(user.sub),
        this.userService.getResUserByTgId(user.telegramId),
      ])

      if (!subscription || !subscription.success) {
        throw new InternalServerErrorException(
          'Произошла ошибка при продление подписки',
        )
      }

      return { success: true, subscription: subscription.data, user: userData }
    } catch (error) {
      if (error instanceof HttpException) throw error
      this.logger.error(
        `Ошибка при продление подписки: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      )
      throw new InternalServerErrorException(
        'Произошла ошибка при продление подписки',
      )
    }
  }
}
