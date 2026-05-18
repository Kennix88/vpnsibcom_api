import { IsOptional, IsString } from 'class-validator'

export class TelegramAuthDto {
  @IsString()
  initData: string

  @IsOptional()
  @IsString()
  startParam?: string
}
