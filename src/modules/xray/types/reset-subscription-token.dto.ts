import { IsNotEmpty, IsString } from 'class-validator'

export class ResetSubscriptionTokenDto {
  @IsNotEmpty()
  @IsString()
  subscriptionId: string
}