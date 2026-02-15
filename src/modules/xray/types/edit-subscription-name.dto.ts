import { IsString } from 'class-validator'

export class EditSubscriptionNameDto {
  @IsString()
  name: string
}
