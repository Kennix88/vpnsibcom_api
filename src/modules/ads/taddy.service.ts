import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios from 'axios'
import { PinoLogger } from 'nestjs-pino'
import {
  TaddyGetAdRequestInterface,
  TaddyGetAdResponseInterface,
  TaddyPubId,
  TaddySendAdImpressionEventRequestInterface,
  TaddyStartEventRequestInterface,
} from './types/taddy.interface'

@Injectable()
export class TaddyService {
  private pubId: string
  private baseUrl: string

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.pubId = this.configService.getOrThrow<string>('TADDY_PUB_KEY')
    this.baseUrl = this.configService.getOrThrow<string>('TADDY_API_URL')
  }

  public startEvent(
    data: Omit<TaddyStartEventRequestInterface, keyof TaddyPubId>,
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

  public async getAd(
    data: Omit<TaddyGetAdRequestInterface, keyof TaddyPubId>,
  ): Promise<TaddyGetAdResponseInterface> {
    const url = `${this.baseUrl}/ads/get`
    const result = await axios
      .post(url, {
        pubId: this.pubId,
        ...data,
      })
      .then((res) => res.data)
      .catch((e) => {
        this.logger.error({
          msg: `Error get ad`,
          e,
        })
        return null
      })
    this.logger.info({
      msg: `Get ad`,
      result,
    })
    return result
  }

  public async adsImpressions(
    data: TaddySendAdImpressionEventRequestInterface,
  ): Promise<void> {
    const url = `${this.baseUrl}/ads/impressions
`
    await axios
      .post(url, {
        pubId: this.pubId,
        ...data,
      })
      .catch((e) => {
        this.logger.error({
          msg: `Error ads impressions`,
          e,
        })
      })
  }
}
