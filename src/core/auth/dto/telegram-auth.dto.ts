import { IsString } from 'class-validator'

export class TelegramAuthDto {
  // telegramId: string
  @IsString()
  initData: string
}
