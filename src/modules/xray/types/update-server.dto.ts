import { ArrayMinSize, IsArray, IsString } from 'class-validator'

export class UpdateServerDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  servers: string[] = []
}
