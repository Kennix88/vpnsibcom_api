import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class RatesService {
  constructor(private configService: ConfigService) {}
}
