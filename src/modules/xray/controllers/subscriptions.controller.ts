import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { AuthService } from '@vpnsibcom/src/core/auth/auth.service'
import { CurrentUser } from '@vpnsibcom/src/core/auth/decorators/current-user.decorator'
import { JwtAuthGuard } from '@vpnsibcom/src/core/auth/guards/jwt-auth.guard'
import { JwtPayload } from '@vpnsibcom/src/shared/types/jwt-payload.interface'
import { FastifyReply, FastifyRequest } from 'fastify'
import { PinoLogger } from 'nestjs-pino'
import { UsersService } from '../../users/users.service'
import { XrayService } from '../services/xray.service'
import { DeleteSubscriptionDto } from '../types/delete-subscription.dto'
import { PurchaseSubscriptionDto } from '../types/purchase-subscription.dto'
import { RenewSubscriptionDto } from '../types/renew-subscription.dto'
import { ResetSubscriptionTokenDto } from '../types/reset-subscription-token.dto'
import { ToggleAutoRenewalDto } from '../types/toggle-auto-renewal.dto'

interface SubscriptionResponse {
  data: {
    success: boolean
    message?: string
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

  @Post('free-plan-activated')
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
        `Ошибка при активации бесплатного плана: ${error.message}`,
        error.stack,
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
        `Ошибка при получении подписок: ${error.message}`,
        error.stack,
      )
      throw new InternalServerErrorException(
        'Произошла ошибка при получении подписок',
      )
    }
  }

  @Post('purchase')
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

      const result = await this.xrayService.purchaseSubscription(
        user.telegramId,
        purchaseDto.period,
        purchaseDto.isAutoRenewal,
      )

      if (!result.success) {
        this.logger.warn(
          `Не удалось купить подписку для пользователя: ${user.telegramId}, причина: ${result.message}`,
        )

        let statusCode = HttpStatus.BAD_REQUEST
        let message = 'Не удалось купить подписку'

        // Обработка различных причин неудачи
        if (result.message === 'insufficient_balance') {
          message = 'Недостаточно средств на балансе'
          statusCode = HttpStatus.PAYMENT_REQUIRED
        } else if (result.message === 'subscription_limit_exceeded') {
          message = 'Превышен лимит подписок'
          statusCode = HttpStatus.FORBIDDEN
        } else if (result.message === 'user_not_found') {
          message = 'Пользователь не найден'
          statusCode = HttpStatus.NOT_FOUND
        }

        res.status(statusCode)
        return {
          data: {
            success: false,
            message,
            ...result,
          },
        }
      }

      const [subscriptions, userData] = await Promise.all([
        this.xrayService.getSubscriptions(user.sub),
        this.userService.getResUserByTgId(user.telegramId),
      ])

      this.logger.info(
        `Подписка успешно куплена пользователем: ${user.telegramId}`,
      )

      return {
        data: {
          success: true,
          message: 'Подписка успешно куплена',
          subscriptions,
          user: userData,
        },
      }
    } catch (error) {
      this.logger.error(
        `Ошибка при покупке подписки: ${error.message}`,
        error.stack,
      )
      throw new InternalServerErrorException(
        'Произошла ошибка при покупке подписки',
      )
    }
  }

  @Post('delete')
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
        `Ошибка при удалении подписки: ${error.message}`,
        error.stack,
      )
      throw new InternalServerErrorException(
        'Произошла ошибка при удалении подписки',
      )
    }
  }

  @Post('renew')
  @Throttle({ defaults: { limit: 5, ttl: 60 } })
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async renewSubscription(
    @CurrentUser() user: JwtPayload,
    @Body() renewDto: RenewSubscriptionDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<SubscriptionResponse> {
    try {
      this.logger.info(
        `Запрос на продление подписки от пользователя: ${user.telegramId}, ID подписки: ${renewDto.subscriptionId}`,
      )

      const token = req.headers.authorization?.split(' ')[1]
      if (!token) {
        throw new BadRequestException('Токен авторизации отсутствует')
      }

      await this.authService.updateUserActivity(token)

      const result = await this.xrayService.renewSubscription(
        user.telegramId,
        renewDto.subscriptionId,
      )

      if (!result.success) {
        this.logger.warn(
          `Не удалось продлить подписку для пользователя: ${user.telegramId}, причина: ${result.message}`,
        )

        let statusCode = HttpStatus.BAD_REQUEST
        let message = 'Не удалось продлить подписку'

        // Обработка различных причин неудачи
        if (result.message === 'insufficient_balance') {
          message = 'Недостаточно средств на балансе'
          statusCode = HttpStatus.PAYMENT_REQUIRED
        } else if (result.message === 'subscription_not_found') {
          message = 'Подписка не найдена или не принадлежит пользователю'
          statusCode = HttpStatus.NOT_FOUND
        } else if (result.message === 'user_not_found') {
          message = 'Пользователь не найден'
          statusCode = HttpStatus.NOT_FOUND
        } else if (result.message === 'invalid_period') {
          message = 'Некорректный период подписки'
          statusCode = HttpStatus.BAD_REQUEST
        }

        res.status(statusCode)
        return {
          data: {
            success: false,
            message,
            ...result,
          },
        }
      }

      const [subscriptions, userData] = await Promise.all([
        this.xrayService.getSubscriptions(user.sub),
        this.userService.getResUserByTgId(user.telegramId),
      ])

      this.logger.info(
        `Подписка успешно продлена пользователем: ${user.telegramId}`,
      )

      return {
        data: {
          success: true,
          message: 'Подписка успешно продлена',
          subscriptions,
          user: userData,
        },
      }
    } catch (error) {
      this.logger.error(
        `Ошибка при продлении подписки: ${error.message}`,
        error.stack,
      )
      throw new InternalServerErrorException(
        'Произошла ошибка при продлении подписки',
      )
    }
  }

  @Post('reset-token')
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
        `Ошибка при сбросе токена подписки: ${error.message}`,
        error.stack,
      )
      throw new InternalServerErrorException(
        'Произошла ошибка при сбросе токена подписки',
      )
    }
  }

  @Post('toggle-auto-renewal')
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
        `Ошибка при изменении статуса автопродления: ${error.message}`,
        error.stack,
      )
      throw new InternalServerErrorException(
        'Произошла ошибка при изменении статуса автопродления',
      )
    }
  }
}
