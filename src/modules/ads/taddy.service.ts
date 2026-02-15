import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios from 'axios'
import {
  TaddyBaseRequestInterface,
  TaddyStartEventRequestInterface,
} from './types/taddy.interface'

@Injectable()
export class TaddyService {
  private readonly logger = new Logger(TaddyService.name)
  private pubId: string
  private baseUrl: string

  constructor(private readonly configService: ConfigService) {
    this.pubId = this.configService.getOrThrow<string>('TADDY_PUB_KEY')
    this.baseUrl = this.configService.getOrThrow<string>('TADDY_API_URL')
  }

  public startEvent(
    data: Omit<
      TaddyStartEventRequestInterface,
      keyof TaddyBaseRequestInterface
    >,
  ): void {
    const url = `${this.baseUrl}/events/start`
    axios
      .post(url, {
        pubId: this.pubId,
        ...data,
      })
      .catch((e) => {
        this.logger.error({
          msg: `Error start event`,
          e,
        })
      })
  }
}
