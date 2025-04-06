import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { isValid } from '@telegram-apps/init-data-node'

@Injectable()
export class TelegramAuthGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()

    // Проверяем наличие и тип initData
    if (
      !request.body ||
      typeof request.body !== 'object' ||
      typeof request.body.initData !== 'string'
    ) {
      return false
    }

    const initData = request.body.initData

    try {
      const telegramBotToken =
        this.configService.getOrThrow<string>('TELEGRAM_BOT_TOKEN')

      return isValid(initData, telegramBotToken)
    } catch (error) {
      console.error('Telegram auth validation failed:', error)
      return false
    }
  }
}
