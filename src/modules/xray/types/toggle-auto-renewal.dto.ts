import { IsNotEmpty, IsString } from 'class-validator'

export class ToggleAutoRenewalDto {
  @IsNotEmpty()
  @IsString()
  subscriptionId: string
}