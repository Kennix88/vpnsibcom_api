import { IsNotEmpty, IsString } from 'class-validator'

export class RenewSubscriptionDto {
  @IsNotEmpty()
  @IsString()
  subscriptionId: string
}