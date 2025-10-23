import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { isValid } from '@telegram-apps/init-data-node'
import { LoggerTelegramService } from '../../logger/logger-telegram.service'

@Injectable()
export class TelegramAuthGuard implements CanActivate {
  constructor(
    private configService: ConfigService,
    private readonly telegramLogger: LoggerTelegramService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    this.telegramLogger.debug('TelegramAuthGuard: Starting canActivate process.')
    const request = context.switchToHttp().getRequest()

    // Checking for initData presence and type
    if (
      !request.body ||
      typeof request.body !== 'object' ||
      typeof request.body.initData !== 'string'
    ) {
      this.telegramLogger.warn('TelegramAuthGuard: Invalid or missing initData in request body.')
      return false
    }

    const initData = request.body.initData
    this.telegramLogger.debug(`TelegramAuthGuard: Received initData: ${initData.substring(0, 50)}...`)

    try {
      const telegramBotToken =
        this.configService.getOrThrow<string>('TELEGRAM_BOT_TOKEN')
      this.telegramLogger.debug('TelegramAuthGuard: Retrieved TELEGRAM_BOT_TOKEN.')

      const isValidResult = isValid(initData, telegramBotToken)
      this.telegramLogger.debug(`TelegramAuthGuard: isValid result: ${isValidResult}`)
      return isValidResult
    } catch (error) {
      this.telegramLogger.error(
        `TelegramAuthGuard: Telegram auth validation failed: ${(error as Error).message}`,
      )
      return false
    }
  }
}
