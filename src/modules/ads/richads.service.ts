import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios from 'axios'
import { PinoLogger } from 'nestjs-pino'
import {
  RichAdsGetAdRequestInterface,
  RichAdsGetAdResponseInterface,
} from './types/richads.interface'

@Injectable()
export class RichAdsService {
  private pubId: string
  private baseUrl: string

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.pubId = this.configService.getOrThrow<string>('RICHADS_PUB_KEY')
    this.baseUrl = this.configService.getOrThrow<string>('RICHADS_API_URL')
  }

  public async getAd(
    data: Omit<RichAdsGetAdRequestInterface, 'publisher_id'>,
  ): Promise<RichAdsGetAdResponseInterface> {
    if (data.production === undefined) {
      data.production = process.env.NODE_ENV === 'production'
    }
    const url = `${this.baseUrl}/telegram-mb`
    const result = await axios
      .post<RichAdsGetAdResponseInterface[]>(url, {
        publisher_id: this.pubId,
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
    return result[0]
  }
}
