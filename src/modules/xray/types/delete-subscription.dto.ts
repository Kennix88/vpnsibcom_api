import { IsNotEmpty, IsString } from 'class-validator'

export class DeleteSubscriptionDto {
  @IsNotEmpty()
  @IsString()
  subscriptionId: string
}