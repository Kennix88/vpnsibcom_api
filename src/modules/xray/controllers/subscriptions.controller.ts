import { CurrentUser } from '@core/auth/decorators/current-user.decorator'
import { PreventDuplicateRequest } from '@core/auth/decorators/prevent-duplicate.decorator'
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard'
import { AuthService } from '@core/auth/services/auth.service'
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { JwtPayload } from '@shared/types/jwt-payload.interface'
import { FastifyRequest } from 'fastify'
import { PinoLogger } from 'nestjs-pino'
import { UsersService } from '../../users/services/users.service'
import { XrayService } from '../services/xray.service'
import { EditSubscriptionNameDto } from '../types/edit-subscription-name.dto'

interface SubscriptionResponse {
  data: {
    success: boolean
    message?: string
    invoice?: {
      linkPay: string
      isTonPayment: boolean
      amountTon: number
      token: string
    }
    subscriptions?: any
    user?: any
  }
}

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(
    private readonly authService: AuthService,
    private readonly xrayService: XrayService,
    private readonly logger: PinoLogger,
    private readonly userService: UsersService,
  ) {}

  // FIX #4: Выделен общий приватный метод обновления активности пользователя.
  // Оригинальный код дублировал этот блок в каждом из 10 методов контроллера.
  // JwtAuthGuard уже гарантирует наличие токена — дополнительная проверка
  // на null убрана как избыточная (BadRequestException здесь недостижим).
  private async refreshActivity(req: FastifyRequest): Promise<void> {
    const token = req.headers.authorization?.split(' ')[1]
    if (token) {
      await this.authService.updateUserActivity(token)
    }
  }

  private async getSubscriptionsAndUser(sub: string, telegramId: string) {
    const [subscriptions, userData] = await Promise.all([
      this.xrayService.getSubscriptions(sub),
      this.userService.getResUserByTgId(telegramId),
    ])
    return { subscriptions, user: userData }
  }

  @Get('by-id/:id')
  @Throttle({ defaults: { limit: 5, ttl: 60 } })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getSubscriptionById(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Req() req: FastifyRequest,
  ) {
    try {
      this.logger.info(
        `Получение подписки для пользователя: ${user.telegramId}`,
      )

      await this.refreshActivity(req)

      const subscription = await this.xrayService.getSubscriptionByTokenOrId({
        isToken: false,
        id,
        agent: req.headers['user-agent'],
      })

      if (!subscription) {
        throw new NotFoundException('Подписка не найдена')
      }

      // FIX #2: Добавлена проверка владельца подписки.
      // Ранее любой авторизованный пользователь мог получить чужую
      // подписку, зная её id. Теперь сравниваем userId из подписки
      // с user.sub из JWT-токена.
      if (subscription.userId !== user.sub) {
        this.logger.warn(
          `Пользователь ${user.telegramId} попытался получить чужую подписку ${id}`,
        )
        throw new ForbiddenException('Нет доступа к этой подписке')
      }

      return { data: { success: true, ...subscription } }
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

  @Get('by-token/:token')
  @Throttle({ defaults: { limit: 5, ttl: 60 } })
  @HttpCode(HttpStatus.OK)
  async getSubscriptionByToken(
    @Param('token') token: string,
    @Req() req: FastifyRequest,
  ) {
    try {
      this.logger.info(`Getting a subscription using a token: ${token}`)

      const subscription = await this.xrayService.getSubscriptionByTokenOrId({
        isToken: true,
        token,
        agent: req.headers['user-agent'],
      })

      if (!subscription) {
        throw new NotFoundException('Subscription not found')
      }

      return { data: { success: true, ...subscription } }
    } catch (error) {
      if (error instanceof HttpException) throw error
      this.logger.error(
        `Error when receiving a subscription: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      )
      throw new InternalServerErrorException(
        'Error when receiving a subscription',
      )
    }
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @Throttle({ defaults: { limit: 10, ttl: 60 } })
  @HttpCode(HttpStatus.OK)
  async getUserSubscriptions(
    @CurrentUser() user: JwtPayload,
    @Req() req: FastifyRequest,
  ): Promise<SubscriptionResponse> {
    try {
      await this.refreshActivity(req)
      this.logger.info(
        `Получение подписок для пользователя: ${user.telegramId}`,
      )

      const payload = await this.getSubscriptionsAndUser(
        user.sub,
        user.telegramId,
      )

      return { data: { success: true, ...payload } }
    } catch (error) {
      if (error instanceof HttpException) throw error
      this.logger.error(
        `Ошибка при получении подписок: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      )
      throw new InternalServerErrorException(
        'Произошла ошибка при получении подписок',
      )
    }
  }

  @Post('edit-name/:id')
  @PreventDuplicateRequest(60)
  @Throttle({ defaults: { limit: 5, ttl: 60 } })
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async editNameSubscription(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() editDto: EditSubscriptionNameDto,
    @Req() req: FastifyRequest,
    // FIX #5: Убран @Res — не использовался
  ) {
    try {
      this.logger.info(
        `Запрос на изменение имени подписки от пользователя: ${user.telegramId}, ID подписки: ${id}`,
      )

      await this.refreshActivity(req)

      const result = await this.xrayService.editSubscriptionName(
        id,
        editDto.name,
        user.sub,
      )

      if (!result.success) {
        this.logger.warn(
          `Не удалось изменить имя подписки для пользователя: ${user.telegramId}, ID подписки: ${id}, причина: ${result.message}`,
        )
        throw new BadRequestException(result.message)
      }

      const payload = await this.getSubscriptionsAndUser(
        user.sub,
        user.telegramId,
      )

      return {
        data: {
          success: true,
          message: 'Subscription name is changed',
          ...payload,
        },
      }
    } catch (error) {
      if (error instanceof HttpException) throw error
      this.logger.error(
        `Ошибка при изменении имени подписки: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      )
      throw new InternalServerErrorException(
        'Произошла ошибка при изменении имени подписки',
      )
    }
  }
}
