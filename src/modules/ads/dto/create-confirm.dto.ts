import { IsBoolean, IsOptional, IsString } from 'class-validator'

export class CreateConfirmDto {
  @IsString()
  verifyKey!: string // JWT

  @IsOptional()
  @IsBoolean()
  isTaddy?: boolean

  @IsOptional()
  @IsString()
  verificationCode?: string
}
