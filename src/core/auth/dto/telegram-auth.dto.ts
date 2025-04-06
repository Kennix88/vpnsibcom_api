import { TelegramInitDataInterface } from '@shared/types/telegram-init-data.interface'

export class TelegramAuthDto {
  telegramId: string
  initData: TelegramInitDataInterface
}
