import { PreventDuplicateRequest } from '@core/auth/decorators/prevent-duplicate.decorator'
import { AuthService } from '@core/auth/services/auth.service'
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { CurrentUser } from '@vpnsibcom/src/core/auth/decorators/current-user.decorator'
import { JwtAuthGuard } from '@vpnsibcom/src/core/auth/guards/jwt-auth.guard'
import { JwtPayload } from '@vpnsibcom/src/shared/types/jwt-payload.interface'
import { FastifyReply, FastifyRequest } from 'fastify'
import { PinoLogger } from 'nestjs-pino'
import { UsersService } from '../../users/users.service'
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

  @Get('by-id/:id')
  @Throttle({ defaults: { limit: 5, ttl: 60 } })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getSubscriptionById(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    try {
      this.logger.info(
        `Получение подписки для пользователя: ${user.telegramId}`,
      )

      const token = req.headers.authorization?.split(' ')[1]
      if (!token) {
        throw new BadRequestException('Токен авторизации отсутствует')
      }

      await this.authService.updateUserActivity(token)

      const subscription = await this.xrayService.getSubscriptionByTokenOrId({
        isToken: false,
        id,
        agent: req.headers['user-agent'],
      })

      if (!subscription) {
        this.logger.warn(
          `Не удалось получить подписку для пользователя: ${user.telegramId}`,
        )
        res.status(HttpStatus.NOT_FOUND)
        return {
          data: {
            success: false,
            message: 'Подписка не найдена',
          },
        }
      }

      return {
        data: {
          success: true,
          ...subscription,
        },
      }
    } catch (error) {
      this.logger.error(
        `Ошибка при получение подписки: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      )
      throw new InternalServerErrorException(
        'Произошла ошибка при получение подписки',
      )
    }
  }

  @Get('by-token/:token')
  @Throttle({ defaults: { limit: 5, ttl: 60 } })
  @HttpCode(HttpStatus.OK)
  async getSubscriptionByToken(
    @Param('token') token: string,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    try {
      this.logger.info(`Getting a subscription using a token: ${token}`)

      const subscription = await this.xrayService.getSubscriptionByTokenOrId({
        isToken: true,
        token,
        agent: req.headers['user-agent'],
      })

      if (!subscription) {
        this.logger.warn(`Couldn't get a token subscription: ${token}`)
        res.status(HttpStatus.NOT_FOUND)
        return {
          data: {
            success: false,
            message: 'Subscription not found',
          },
        }
      }

      return {
        data: {
          success: true,
          ...subscription,
        },
      }
    } catch (error) {
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
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<SubscriptionResponse> {
    try {
      this.logger.info(
        `Активация бесплатного плана для пользователя: ${user.telegramId}`,
      )

      const token = req.headers.authorization?.split(' ')[1]
      if (!token) {
        throw new BadRequestException('Токен авторизации отсутствует')
      }

      await this.authService.updateUserActivity(token)

      const freePlanActivated = await this.xrayService.activateFreePlan(
        user.telegramId,
      )

      if (!freePlanActivated) {
        this.logger.warn(
          `Не удалось активировать бесплатный план для пользователя: ${user.telegramId}`,
        )
        res.status(HttpStatus.FORBIDDEN)
        return {
          data: {
            success: false,
            message: 'Не удалось активировать бесплатный план',
          },
        }
      }

      const [subscriptions, userData] = await Promise.all([
        this.xrayService.getSubscriptions(user.sub),
        this.userService.getResUserByTgId(user.telegramId),
      ])

      this.logger.info(
        `Бесплатный план успешно активирован для пользователя: ${user.telegramId}`,
      )

      return {
        data: {
          success: true,
          subscriptions,
          user: userData,
        },
      }
    } catch (error) {
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

  @Get()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getUserSubscriptions(
    @CurrentUser() user: JwtPayload,
    @Req() req: FastifyRequest,
  ): Promise<SubscriptionResponse> {
    try {
      const token = req.headers.authorization?.split(' ')[1]
      if (!token) {
        throw new BadRequestException('Токен авторизации отсутствует')
      }

      await this.authService.updateUserActivity(token)
      this.logger.info(
        `Получение подписок для пользователя: ${user.telegramId}`,
      )

      const subscriptions = await this.xrayService.getSubscriptions(user.sub)
      const userData = await this.userService.getResUserByTgId(user.telegramId)

      return {
        data: {
          success: true,
          subscriptions,
          user: userData,
        },
      }
    } catch (error) {
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
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<SubscriptionResponse> {
    try {
      this.logger.info(
        `Запрос на покупку подписки от пользователя: ${user.telegramId}, период: ${purchaseDto.period}`,
      )

      const token = req.headers.authorization?.split(' ')[1]
      if (!token) {
        throw new BadRequestException('Токен авторизации отсутствует')
      }

      await this.authService.updateUserActivity(token)

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

      const [subscriptions, userData] = await Promise.all([
        this.xrayService.getSubscriptions(user.sub),
        this.userService.getResUserByTgId(user.telegramId),
      ])

      return {
        data: {
          success: true,
          ...result,
          subscriptions,
          user: userData,
        },
      }
    } catch (error) {
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
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    try {
      const token = req.headers.authorization?.split(' ')[1]
      if (!token) {
        throw new BadRequestException('Токен авторизации отсутствует')
      }
      await this.authService.updateUserActivity(token)

      const result = await this.xrayService.addTraffic(
        id,
        addTrafficDto.traffic,
        addTrafficDto.method,
        user.sub,
      )

      if (!result.success) {
        this.logger.warn(
          `Не удалось Добавить трафик для подписки пользователя: ${user.telegramId}, ID подписки: ${id}, причина: ${result.message}`,
        )
        throw new BadRequestException(result.message)
      }

      const [subscriptions, userData] = await Promise.all([
        this.xrayService.getSubscriptions(user.sub),
        this.userService.getResUserByTgId(user.telegramId),
      ])

      return {
        data: {
          success: true,
          message: 'Traffic is added',
          ...result,
          subscriptions,
          user: userData,
        },
      }
    } catch (error) {
      this.logger.error(
        `Ошибка при Добавлении трафика подписки: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      )
      throw new InternalServerErrorException(
        'Произошла ошибка при Добавлении трафика подписки',
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
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    try {
      const token = req.headers.authorization?.split(' ')[1]
      if (!token) {
        throw new BadRequestException('Токен авторизации отсутствует')
      }
      await this.authService.updateUserActivity(token)

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

      const [subscriptions, userData] = await Promise.all([
        this.xrayService.getSubscriptions(user.sub),
        this.userService.getResUserByTgId(user.telegramId),
      ])

      return {
        data: {
          success: true,
          message: 'Subscription server is changed',
          subscriptions,
          user: userData,
        },
      }
    } catch (error) {
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
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    try {
      this.logger.info(
        `Запрос на изменение имени подписки от пользователя: ${user.telegramId}, ID подписки: ${id}`,
      )

      const token = req.headers.authorization?.split(' ')[1]
      if (!token) {
        throw new BadRequestException('Токен авторизации отсутствует')
      }

      await this.authService.updateUserActivity(token)

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

      const [subscriptions, userData] = await Promise.all([
        this.xrayService.getSubscriptions(user.sub),
        this.userService.getResUserByTgId(user.telegramId),
      ])

      return {
        data: {
          success: true,
          message: 'Subscription name is changed',
          subscriptions,
          user: userData,
        },
      }
    } catch (error) {
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
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<SubscriptionResponse> {
    try {
      this.logger.info(
        `Запрос на удаление подписки от пользователя: ${user.telegramId}, ID подписки: ${deleteDto.subscriptionId}`,
      )

      const token = req.headers.authorization?.split(' ')[1]
      if (!token) {
        throw new BadRequestException('Токен авторизации отсутствует')
      }

      await this.authService.updateUserActivity(token)

      const result = await this.xrayService.deleteSubscription(
        user.telegramId,
        deleteDto.subscriptionId,
      )

      if (!result.success) {
        this.logger.warn(
          `Не удалось удалить подписку для пользователя: ${user.telegramId}, причина: ${result.message}`,
        )

        let statusCode = HttpStatus.BAD_REQUEST
        let message = 'Не удалось удалить подписку'

        // Обработка различных причин неудачи
        if (result.message === 'user_not_found') {
          message = 'Пользователь не найден'
          statusCode = HttpStatus.NOT_FOUND
        } else if (result.message === 'subscription_not_found') {
          message = 'Подписка не найдена или не принадлежит пользователю'
          statusCode = HttpStatus.NOT_FOUND
        }

        res.status(statusCode)
        return {
          data: {
            success: false,
            message,
          },
        }
      }

      const [subscriptions, userData] = await Promise.all([
        this.xrayService.getSubscriptions(user.sub),
        this.userService.getResUserByTgId(user.telegramId),
      ])

      this.logger.info(
        `Подписка успешно удалена пользователем: ${user.telegramId}`,
      )

      return {
        data: {
          success: true,
          message: 'Подписка успешно удалена',
          subscriptions,
          user: userData,
        },
      }
    } catch (error) {
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
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<SubscriptionResponse> {
    try {
      this.logger.info(
        `Запрос на продление подписки от пользователя: ${user.telegramId}, ID подписки: ${id}`,
      )

      const token = req.headers.authorization?.split(' ')[1]
      if (!token) {
        throw new BadRequestException('Токен авторизации отсутствует')
      }

      await this.authService.updateUserActivity(token)

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

      const [subscriptions, userData] = await Promise.all([
        this.xrayService.getSubscriptions(user.sub),
        this.userService.getResUserByTgId(user.telegramId),
      ])

      return {
        data: {
          success: true,
          message: 'Subscription is renewed',
          ...result,
          subscriptions,
          user: userData,
        },
      }
    } catch (error) {
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
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<SubscriptionResponse> {
    try {
      this.logger.info(
        `Запрос на сброс токена подписки от пользователя: ${user.telegramId}, ID подписки: ${resetTokenDto.subscriptionId}`,
      )

      const token = req.headers.authorization?.split(' ')[1]
      if (!token) {
        throw new BadRequestException('Токен авторизации отсутствует')
      }

      await this.authService.updateUserActivity(token)

      const result = await this.xrayService.resetSubscriptionToken(
        user.telegramId,
        resetTokenDto.subscriptionId,
      )

      if (!result.success) {
        this.logger.warn(
          `Не удалось сбросить токен подписки для пользователя: ${user.telegramId}, причина: ${result.message}`,
        )

        let statusCode = HttpStatus.BAD_REQUEST
        let message = 'Не удалось сбросить токен подписки'

        // Обработка различных причин неудачи
        if (result.message === 'user_not_found') {
          message = 'Пользователь не найден'
          statusCode = HttpStatus.NOT_FOUND
        } else if (result.message === 'subscription_not_found') {
          message = 'Подписка не найдена или не принадлежит пользователю'
          statusCode = HttpStatus.NOT_FOUND
        }

        res.status(statusCode)
        return {
          data: {
            success: false,
            message,
          },
        }
      }

      const [subscriptions, userData] = await Promise.all([
        this.xrayService.getSubscriptions(user.sub),
        this.userService.getResUserByTgId(user.telegramId),
      ])

      this.logger.info(
        `Токен подписки успешно сброшен пользователем: ${user.telegramId}`,
      )

      return {
        data: {
          success: true,
          message: 'Токен подписки успешно сброшен',
          subscriptions,
          user: userData,
        },
      }
    } catch (error) {
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
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<SubscriptionResponse> {
    try {
      this.logger.info(
        `Запрос на изменение статуса автопродления от пользователя: ${user.telegramId}, подписка: ${toggleDto.subscriptionId}`,
      )

      const token = req.headers.authorization?.split(' ')[1]
      if (!token) {
        throw new BadRequestException('Токен авторизации отсутствует')
      }

      await this.authService.updateUserActivity(token)

      const result = await this.xrayService.toggleAutoRenewal(
        toggleDto.subscriptionId,
        user.telegramId,
      )

      if (!result.success) {
        this.logger.warn(
          `Не удалось изменить статус автопродления для пользователя: ${user.telegramId}, причина: ${result.message}`,
        )

        let statusCode = HttpStatus.BAD_REQUEST
        let message = 'Не удалось изменить статус автопродления'

        // Обработка различных причин неудачи
        if (result.message === 'user_not_found') {
          message = 'Пользователь не найден'
          statusCode = HttpStatus.NOT_FOUND
        } else if (result.message === 'subscription_not_found') {
          message = 'Подписка не найдена или не принадлежит пользователю'
          statusCode = HttpStatus.NOT_FOUND
        }

        res.status(statusCode)
        return {
          data: {
            success: false,
            message,
          },
        }
      }

      const [subscriptions, userData] = await Promise.all([
        this.xrayService.getSubscriptions(user.sub),
        this.userService.getResUserByTgId(user.telegramId),
      ])

      this.logger.info(
        `Статус автопродления успешно изменен для пользователя: ${user.telegramId}`,
      )

      return {
        data: {
          success: true,
          message: result.isAutoRenewal
            ? 'Автопродление подписки включено'
            : 'Автопродление подписки отключено',
          subscriptions,
          user: userData,
        },
      }
    } catch (error) {
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
