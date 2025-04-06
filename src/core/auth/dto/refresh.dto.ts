import { IsOptional, IsString } from 'class-validator'

export class RefreshDto {
  @IsOptional()
  @IsString()
  refreshToken?: string
}
