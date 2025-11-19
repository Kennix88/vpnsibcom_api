import { IsOptional, IsString } from 'class-validator'

export class CreateConfirmDto {
  @IsString()
  verifyKey!: string // JWT

  @IsOptional()
  @IsString()
  verificationCode?: string
}
