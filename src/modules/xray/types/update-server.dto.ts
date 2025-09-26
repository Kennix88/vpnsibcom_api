import { IsArray } from 'class-validator'

export class UpdateServerDto {
  @IsArray()
  servers: string[] = []
}
