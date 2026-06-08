// FIX #3: Приведены к единому алиасу все импорты из auth-модуля.
// Оригинал смешивал '@core/auth/...' и '@vpnsibcom/src/core/auth/...'
// для одних и тех же символов — признак незавершённого рефакторинга.
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
import { AddTrafficSubscriptionDto } from '../types/add-traffic-subscription.dto'
import { DeleteSubscriptionDto } from '../types/delete-subscription.dto'
import { EditSubscriptionNameDto } from '../types/edit-subscription-name.dto'
import { PurchaseSubscriptionDto } from '../types/purchase-subscription.dto'
import { RenewSubscriptionDto } from '../types/renew-subscription.dto'
import { ResetSubscriptionTokenDto } from '../types/reset-subscription-token.dto'
import { ToggleAutoRenewalDto } from '../types/toggle-auto-renewal.dto'
import { UpdateServerDto } from '../types/update-server.dto'

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

  // FIX #4: Выделен общий приватный метод загрузки подписок и данных пользователя,
  // который повторяется в большинстве методов контроллера.
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

  @Post('free-plan-activated')
  @PreventDuplicateRequest(120)
  @Throttle({ defaults: { limit: 5, ttl: 60 } })
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async freePlanActivated(
    @CurrentUser() user: JwtPayload,
    @Req() req: FastifyRequest,
  ): Promise<SubscriptionResponse> {
    try {
      this.logger.info(
        `Активация бесплатного плана для пользователя: ${user.telegramId}`,
      )

      await this.refreshActivity(req)

      const freePlanActivated = await this.xrayService.activateFreePlan(
        user.telegramId,
      )

      if (!freePlanActivated) {
        this.logger.warn(
          `Не удалось активировать бесплатный план для пользователя: ${user.telegramId}`,
        )
        throw new BadRequestException('Не удалось активировать бесплатный план')
      }

      const payload = await this.getSubscriptionsAndUser(
        user.sub,
        user.telegramId,
      )

      this.logger.info(
        `Бесплатный план успешно активирован для пользователя: ${user.telegramId}`,
      )

      return { data: { success: true, ...payload } }
    } catch (error) {
      if (error instanceof HttpException) throw error
      this.logger.error(
        `Ошибка при активации бесплатного плана: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      )
      throw new InternalServerErrorException(
        'Произошла ошибка при активации бесплатного плана',
      )
    }
  }

  // FIX #8: Добавлен @Throttle — единственный GET-эндпоинт без троттлинга,
  // хотя делает два параллельных запроса к БД.
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

  @Post('purchase')
  @PreventDuplicateRequest(60)
  @Throttle({ defaults: { limit: 5, ttl: 60 } })
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async purchaseSubscription(
    @CurrentUser() user: JwtPayload,
    @Body() purchaseDto: PurchaseSubscriptionDto,
    @Req() req: FastifyRequest,
  ): Promise<SubscriptionResponse> {
    try {
      this.logger.info(
        `Запрос на покупку подписки от пользователя: ${user.telegramId}, период: ${purchaseDto.period}`,
      )

      await this.refreshActivity(req)

      const result = await this.xrayService.purchaseSubscription({
        telegramId: user.telegramId,
        method: purchaseDto.method,
        name: purchaseDto.name,
        planKey: purchaseDto.planKey,
        period: purchaseDto.period,
        periodMultiplier: purchaseDto.periodMultiplier,
        devicesCount: purchaseDto.devicesCount,
        isAllBaseServers: purchaseDto.isAllBaseServers,
        trafficReset: purchaseDto.trafficReset,
        isAllPremiumServers: purchaseDto.isAllPremiumServers,
        trafficLimitGb: purchaseDto.trafficLimitGb,
        isUnlimitTraffic: purchaseDto.isUnlimitTraffic,
        servers: purchaseDto.servers,
        isAutoRenewal: purchaseDto.isAutoRenewal,
      })

      if (!result.success) {
        this.logger.warn(
          `Не удалось создать подписку для пользователя: ${user.telegramId}, причина: ${result.message}`,
        )
        throw new BadRequestException(result.message)
      }

      const payload = await this.getSubscriptionsAndUser(
        user.sub,
        user.telegramId,
      )

      return { data: { success: true, ...result, ...payload } }
    } catch (error) {
      if (error instanceof HttpException) throw error
      this.logger.error(
        `Ошибка при покупке подписки: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      )
      throw new InternalServerErrorException(
        'Произошла ошибка при покупке подписки',
      )
    }
  }

  @Post('add-traffic/:id')
  @PreventDuplicateRequest(60)
  @Throttle({ defaults: { limit: 5, ttl: 60 } })
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async addTrafficSubscription(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() addTrafficDto: AddTrafficSubscriptionDto,
    @Req() req: FastifyRequest,
    // FIX #5: Убран @Res — параметр объявлялся, но никогда не использовался.
    // Лишняя инъекция @Res влияет на жизненный цикл ответа Fastify.
  ) {
    try {
      await this.refreshActivity(req)

      const result = await this.xrayService.addTraffic(
        id,
        addTrafficDto.traffic,
        addTrafficDto.method,
        user.sub,
      )

      if (!result.success) {
        this.logger.warn(
          `Не удалось добавить трафик для подписки пользователя: ${user.telegramId}, ID подписки: ${id}, причина: ${result.message}`,
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
          message: 'Traffic is added',
          ...result,
          ...payload,
        },
      }
    } catch (error) {
      if (error instanceof HttpException) throw error
      this.logger.error(
        `Ошибка при добавлении трафика подписки: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      )
      throw new InternalServerErrorException(
        'Произошла ошибка при добавлении трафика подписки',
      )
    }
  }

  @Post('update-server/:id')
  @PreventDuplicateRequest(60)
  @Throttle({ defaults: { limit: 5, ttl: 60 } })
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async updateServerSubscription(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() serverDto: UpdateServerDto,
    @Req() req: FastifyRequest,
    // FIX #5: Убран @Res — не использовался
  ) {
    try {
      await this.refreshActivity(req)

      // FIX #6: Добавлена проверка наличия сервера в массиве перед обращением
      // к индексу 0. Ранее при пустом массиве передавался undefined.
      if (!serverDto.servers || serverDto.servers.length === 0) {
        throw new BadRequestException('Необходимо указать хотя бы один сервер')
      }

      const result = await this.xrayService.updateServer(
        id,
        serverDto.servers[0],
        user.sub,
      )

      if (!result.success) {
        this.logger.warn(
          `Не удалось изменить сервер подписки для пользователя: ${user.telegramId}, ID подписки: ${id}, причина: ${result.message}`,
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
          message: 'Subscription server is changed',
          ...payload,
        },
      }
    } catch (error) {
      if (error instanceof HttpException) throw error
      this.logger.error(
        `Ошибка при изменении сервера подписки: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      )
      throw new InternalServerErrorException(
        'Произошла ошибка при изменении сервера подписки',
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

  @Post('delete')
  @PreventDuplicateRequest(60)
  @Throttle({ defaults: { limit: 5, ttl: 60 } })
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async deleteSubscription(
    @CurrentUser() user: JwtPayload,
    @Body() deleteDto: DeleteSubscriptionDto,
    @Req() req: FastifyRequest,
  ): Promise<SubscriptionResponse> {
    try {
      this.logger.info(
        `Запрос на удаление подписки от пользователя: ${user.telegramId}, ID подписки: ${deleteDto.subscriptionId}`,
      )

      await this.refreshActivity(req)

      const result = await this.xrayService.deleteSubscription(
        user.telegramId,
        deleteDto.subscriptionId,
      )

      if (!result.success) {
        this.logger.warn(
          `Не удалось удалить подписку для пользователя: ${user.telegramId}, причина: ${result.message}`,
        )

        if (result.message === 'user_not_found') {
          throw new NotFoundException('Пользователь не найден')
        }
        if (result.message === 'subscription_not_found') {
          throw new NotFoundException(
            'Подписка не найдена или не принадлежит пользователю',
          )
        }
        throw new BadRequestException('Не удалось удалить подписку')
      }

      const payload = await this.getSubscriptionsAndUser(
        user.sub,
        user.telegramId,
      )

      this.logger.info(
        `Подписка успешно удалена пользователем: ${user.telegramId}`,
      )

      return {
        data: {
          success: true,
          message: 'Подписка успешно удалена',
          ...payload,
        },
      }
    } catch (error) {
      if (error instanceof HttpException) throw error
      this.logger.error(
        `Ошибка при удалении подписки: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      )
      throw new InternalServerErrorException(
        'Произошла ошибка при удалении подписки',
      )
    }
  }

  @Post('renew/:id')
  @PreventDuplicateRequest(60)
  @Throttle({ defaults: { limit: 5, ttl: 60 } })
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async renewSubscription(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() renewDto: RenewSubscriptionDto,
    @Req() req: FastifyRequest,
    // FIX #5: Убран @Res — не использовался
  ): Promise<SubscriptionResponse> {
    try {
      this.logger.info(
        `Запрос на продление подписки от пользователя: ${user.telegramId}, ID подписки: ${id}`,
      )

      await this.refreshActivity(req)

      const result = await this.xrayService.renewSubscription(
        user.telegramId,
        id,
        renewDto.method,
        renewDto.isSavePeriod,
        renewDto.period,
        renewDto.periodMultiplier,
        renewDto.trafficReset,
      )

      if (!result.success) {
        this.logger.warn(
          `Не удалось продлить подписку пользователя: ${user.telegramId}, ID подписки: ${id}, причина: ${result.message}`,
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
          message: 'Subscription is renewed',
          ...result,
          ...payload,
        },
      }
    } catch (error) {
      if (error instanceof HttpException) throw error
      this.logger.error(
        `Ошибка при продлении подписки: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      )
      throw new InternalServerErrorException(
        'Произошла ошибка при продлении подписки',
      )
    }
  }

  @Post('reset-token')
  @PreventDuplicateRequest(60)
  @Throttle({ defaults: { limit: 5, ttl: 60 } })
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async resetSubscriptionToken(
    @CurrentUser() user: JwtPayload,
    @Body() resetTokenDto: ResetSubscriptionTokenDto,
    @Req() req: FastifyRequest,
  ): Promise<SubscriptionResponse> {
    try {
      this.logger.info(
        `Запрос на сброс токена подписки от пользователя: ${user.telegramId}, ID подписки: ${resetTokenDto.subscriptionId}`,
      )

      await this.refreshActivity(req)

      const result = await this.xrayService.resetSubscriptionToken(
        user.telegramId,
        resetTokenDto.subscriptionId,
      )

      if (!result.success) {
        this.logger.warn(
          `Не удалось сбросить токен подписки для пользователя: ${user.telegramId}, причина: ${result.message}`,
        )

        if (result.message === 'user_not_found') {
          throw new NotFoundException('Пользователь не найден')
        }
        if (result.message === 'subscription_not_found') {
          throw new NotFoundException(
            'Подписка не найдена или не принадлежит пользователю',
          )
        }
        throw new BadRequestException('Не удалось сбросить токен подписки')
      }

      const payload = await this.getSubscriptionsAndUser(
        user.sub,
        user.telegramId,
      )

      this.logger.info(
        `Токен подписки успешно сброшен пользователем: ${user.telegramId}`,
      )

      return {
        data: {
          success: true,
          message: 'Токен подписки успешно сброшен',
          ...payload,
        },
      }
    } catch (error) {
      if (error instanceof HttpException) throw error
      this.logger.error(
        `Ошибка при сбросе токена подписки: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      )
      throw new InternalServerErrorException(
        'Произошла ошибка при сбросе токена подписки',
      )
    }
  }

  @Post('toggle-auto-renewal')
  @PreventDuplicateRequest(60)
  @Throttle({ defaults: { limit: 10, ttl: 60 } })
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async toggleAutoRenewal(
    @CurrentUser() user: JwtPayload,
    @Body() toggleDto: ToggleAutoRenewalDto,
    @Req() req: FastifyRequest,
  ): Promise<SubscriptionResponse> {
    try {
      this.logger.info(
        `Запрос на изменение статуса автопродления от пользователя: ${user.telegramId}, подписка: ${toggleDto.subscriptionId}`,
      )

      await this.refreshActivity(req)

      const result = await this.xrayService.toggleAutoRenewal(
        toggleDto.subscriptionId,
        user.telegramId,
      )

      if (!result.success) {
        this.logger.warn(
          `Не удалось изменить статус автопродления для пользователя: ${user.telegramId}, причина: ${result.message}`,
        )

        if (result.message === 'user_not_found') {
          throw new NotFoundException('Пользователь не найден')
        }
        if (result.message === 'subscription_not_found') {
          throw new NotFoundException(
            'Подписка не найдена или не принадлежит пользователю',
          )
        }
        throw new BadRequestException(
          'Не удалось изменить статус автопродления',
        )
      }

      const payload = await this.getSubscriptionsAndUser(
        user.sub,
        user.telegramId,
      )

      this.logger.info(
        `Статус автопродления успешно изменён для пользователя: ${user.telegramId}`,
      )

      return {
        data: {
          success: true,
          message: result.isAutoRenewal
            ? 'Автопродление подписки включено'
            : 'Автопродление подписки отключено',
          ...payload,
        },
      }
    } catch (error) {
      if (error instanceof HttpException) throw error
      this.logger.error(
        `Ошибка при изменении статуса автопродления: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      )
      throw new InternalServerErrorException(
        'Произошла ошибка при изменении статуса автопродления',
      )
    }
  }
}
