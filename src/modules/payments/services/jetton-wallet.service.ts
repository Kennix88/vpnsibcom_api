// modules/payments/services/jetton-wallet.service.ts
import { RedisService } from '@core/redis/redis.service'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Address } from '@ton/core'
import { PinoLogger } from 'nestjs-pino'

const JETTON_WALLET_CACHE_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 дней

@Injectable()
export class JettonWalletService {
  constructor(
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(JettonWalletService.name)
  }

  private cacheKey(owner: string, master: string) {
    return `jetton:wallet:${master}:${owner}`
  }

  /**
   * Резолвит jetton wallet адрес владельца для указанного jetton master
   * контракта. Owner+master → wallet — маппинг детерминированный и не
   * меняется, поэтому кешируем на 30 дней.
   */
  public async getJettonWalletAddress(
    ownerAddress: string,
    jettonMasterAddress: string,
  ): Promise<string> {
    const key = this.cacheKey(ownerAddress, jettonMasterAddress)

    // const cached = await this.redis.get(key)
    // if (cached) return cached

    const apiKey = this.configService.getOrThrow<string>('TONAPI_KEY')
    const resp = await fetch(
      `https://tonapi.io/v2/accounts/${ownerAddress}/jettons/${jettonMasterAddress}`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    )

    if (!resp.ok) {
      this.logger.error({
        msg: 'Failed to resolve jetton wallet address',
        ownerAddress,
        jettonMasterAddress,
        status: resp.status,
      })
      throw new Error('Failed to resolve jetton wallet address')
    }

    const data = await resp.json()

    // TonAPI отдаёт raw-форму (0:hex) — конвертируем в user-friendly (EQ/UQ),
    // иначе TonConnect SDK ругается "Wrong 'address' format" при sendTransaction
    const walletAddress = Address.parse(data.wallet_address.address).toString({
      bounceable: true,
    })

    const cachedOk = await this.redis.setWithExpiry(
      key,
      walletAddress,
      JETTON_WALLET_CACHE_TTL_SECONDS,
    )
    if (!cachedOk) {
      this.logger.warn({
        msg: 'Failed to cache jetton wallet address, continuing without cache',
        ownerAddress,
        jettonMasterAddress,
      })
    }

    return walletAddress
  }
}
