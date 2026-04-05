import { PlansEnum } from '@core/prisma/generated/enums'
import { PrismaService } from '@core/prisma/prisma.service'
import { RedisService } from '@core/redis/redis.service'
import { UsersService } from '@modules/users/services/users.service'
import { Injectable } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { BalanceTypeEnum } from '@shared/enums/balance-type.enum'
import { DefaultEnum } from '@shared/enums/default.enum'
import { PlatformEnum } from '@shared/enums/platform.enum'
import { TransactionReasonEnum } from '@shared/enums/transaction-reason.enum'
import { detectPlatformUtil } from '@shared/utils/detect-platform.util'
import { addMinutes, isAfter } from 'date-fns'
import { PinoLogger } from 'nestjs-pino'
import { RichAdsService } from './richads.service'
import { TaddyService } from './taddy.service'
import { AdsNetworkEnum } from './types/ads-network.enum'
import { AdsPlaceEnum } from './types/ads-place.enum'
import { AdsResInterface } from './types/ads-res.interface'
import { AdsTypeEnum } from './types/ads-type.enum'
import { RichAdsGetAdResponseInterface } from './types/richads.interface'
import {
  TaddyAdFormatEnum,
  TaddyGetAdResponseInterface,
  TaddyOriginEnum,
} from './types/taddy.interface'
import { TaskRewardResInterface } from './types/task-reward-res.interface'

@Injectable()
export class AdsService {
  private static readonly SESSION_TTL_SECONDS = 60 * 60 * 3

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly logger: PinoLogger,
    private readonly taddy: TaddyService,
    private readonly richAdsService: RichAdsService,
  ) {}

  public async getAdTaskReward(): Promise<TaskRewardResInterface> {
    try {
      const reward = await this.prisma.adsRewards.findUnique({
        where: {
          key: DefaultEnum.DEFAULT,
        },
      })
      this.logger.info(reward)
      return reward ? { amount: Number(reward.taskView) } : { amount: 0 }
    } catch (error) {
      this.logger.error(error)
    }
  }

  /**
   * Создаёт ad session; возвращает VerifyKey (JWT) и информацию для клиента.
   */
  public async createAdSession(opts: {
    userId: string
    telegramId?: string
    place: AdsPlaceEnum
    type: AdsTypeEnum
    ip?: string
    ua?: string
  }): Promise<AdsResInterface> {
    const { userId, telegramId, place, type, ip, ua } = opts

    const user = await this.prisma.users.findUnique({
      where: {
        id: userId,
      },
      include: {
        adsData: true,
        telegramData: true,
        subscriptions: {
          where: {
            isActive: true,
            NOT: {
              planKey: PlansEnum.TRIAL,
            },
          },
        },
      },
    })

    if (!user) {
      return {
        isNoAds: true,
      }
    }

    if (
      user.subscriptions.length > 0 &&
      (place == AdsPlaceEnum.MESSAGE ||
        place == AdsPlaceEnum.FULLSCREEN ||
        place == AdsPlaceEnum.BANNER)
    )
      return {
        isNoAds: true,
      }

    if (
      type == AdsTypeEnum.VIEW &&
      user?.adsData?.lastFullscreenViewedAt &&
      !isAfter(
        new Date(),
        addMinutes(new Date(user.adsData.lastFullscreenViewedAt), 3),
      )
    )
      return {
        isNoAds: true,
      }

    const platform = detectPlatformUtil(ua || null)

    // 1) получаем доступные блоки
    const blocks = await this.prisma.adsBlocks.findMany({
      where: {
        place: place,
        isActive: true,
        network: {
          ...(platform !== PlatformEnum.ANDROID &&
            platform !== PlatformEnum.IOS && {
              NOT: {
                key: AdsNetworkEnum.ADSGRAM,
              },
            }),
          isActive: true,
        },
      },
      include: { network: true },
    })

    if (!blocks || blocks.length === 0) {
      return {
        isNoAds: true,
      }
    }

    let meta = {}
    let block: (typeof blocks)[0] | undefined
    const limit = 1
    const duration = AdsService.SESSION_TTL_SECONDS
    let ad: RichAdsGetAdResponseInterface | TaddyGetAdResponseInterface

    const sessionId = crypto.randomUUID()

    if (place == AdsPlaceEnum.MESSAGE) {
      const availableMessageNetworks = new Set<AdsNetworkEnum>()
      if (blocks.some((b) => b.networkKey === AdsNetworkEnum.TADDY))
        availableMessageNetworks.add(AdsNetworkEnum.TADDY)
      if (blocks.some((b) => b.networkKey === AdsNetworkEnum.RICHADS))
        availableMessageNetworks.add(AdsNetworkEnum.RICHADS)

      if (availableMessageNetworks.size === 0) {
        return { isNoAds: true }
      }

      const selectedNetwork =
        Array.from(availableMessageNetworks)[
          Math.floor(Math.random() * availableMessageNetworks.size)
        ]

      if (selectedNetwork === AdsNetworkEnum.TADDY) {
        const blocksFiltered = blocks.filter(
          (b) => b.networkKey === AdsNetworkEnum.TADDY,
        )
        block =
          blocksFiltered[Math.floor(Math.random() * blocksFiltered.length)]

        ad = await this.taddy.getAd({
          user: {
            id: Number(userId),
          },
          origin: TaddyOriginEnum.SERVER,
          format: TaddyAdFormatEnum.BOT_AD,
        })
      } else if (selectedNetwork === AdsNetworkEnum.RICHADS) {
        if (!user?.telegramData || !user.telegramId) {
          return { isNoAds: true }
        }
        const blocksFiltered = blocks.filter(
          (b) => b.networkKey === AdsNetworkEnum.RICHADS,
        )
        block =
          blocksFiltered[Math.floor(Math.random() * blocksFiltered.length)]

        ad = await this.richAdsService.getAd({
          language_code: user.telegramData.languageCode,
          telegram_id: user.telegramId,
          widget_id: block.key,
        })
      }

      if (!ad || !block) {
        return { isNoAds: true }
      }

      meta = {
        sessionId,
        userId,
        telegramId,
        blockId: block.id,
        networkKey: block.networkKey,
        limit,
        createdAt: Date.now(),
        duration,
        createdIp: ip ?? null,
        createdUa: ua ?? null,
      }
    } else {
      block = blocks[Math.floor(Math.random() * blocks.length)]
      meta = {
        sessionId,
        userId,
        telegramId,
        blockId: block.id,
        networkKey: block.networkKey,
        limit,
        createdAt: Date.now(),
        duration,
        createdIp: ip ?? null,
        createdUa: ua ?? null,
      }
    }

    const metaKey = `ad:session:meta:${sessionId}`

    // store only meta in Redis with expiration
    await this.redisService.setObjectWithExpiry(metaKey, meta, duration)

    const adsRewards = await this.prisma.adsRewards.findUnique({
      where: {
        key: DefaultEnum.DEFAULT,
      },
    })

    // сохраняем запись AdsViews (verifyKey пока UUID -> later replaced by JWT returned to client)
    await this.prisma.adsViews.create({
      data: {
        networkKey: block.networkKey,
        type: type,
        rewardStars:
          place == AdsPlaceEnum.REWARD_TASK && type == AdsTypeEnum.REWARD
            ? Number(adsRewards?.taskView ?? 0)
            : 0,
        duration,
        verifyKey: sessionId as string, // сохраняем sid; клиент получит JWT, но в БД храним sid для привязки
        userId,
        ip: ip ?? null,
        ua: ua ?? null,
        blockId: block.id,
        // ...(type === AdsTypeEnum.VIEW && {
        //   claimedAt: new Date(),
        // }),
      },
    })

    // sign JWT verifyKey with ADS_SESSION_SECRET
    const secret = this.configService.get<string>('ADS_SESSION_SECRET')
    if (!secret) throw new Error('ADS_SESSION_SECRET not configured')

    const verifyKey = await this.jwtService.signAsync(
      { sid: sessionId },
      { secret, expiresIn: `${duration}s` },
    )

    // короткая статистика в Redis: увеличение counter sessions_created
    const statsKey = `ad:stats:user:${userId}`
    try {
      await this.redisService.hincrby(statsKey, 'sessions_created', 1)
      await this.redisService.expire(statsKey, duration * 2)
    } catch (e) {
      this.logger.warn(
        `Failed to update stats for user ${userId}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      )
    }

    this.logger.info(
      `Created ad session ${sessionId} (JWT returned) for user ${userId} block ${block.id}`,
    )

    return {
      isNoAds: false,
      ad: {
        type: opts.type,
        place,
        network: block.networkKey as AdsNetworkEnum,
        time: new Date(),
        blockId: block.key,
        verifyKey,
      },
      ...(ad &&
        (block.networkKey === AdsNetworkEnum.RICHADS
          ? { richAds: { ...(ad as RichAdsGetAdResponseInterface) } }
          : block.networkKey === AdsNetworkEnum.TADDY
          ? { taddy: { ...(ad as TaddyGetAdResponseInterface) } }
          : {})),
    }
  }

  /**
   * Confirm ad: логируем попытку, проверяем network, атомарно уменьшаем remaining и при успехе начисляем.
   */
  public async confirmAd(opts: {
    userId: string
    verifyKey: string // JWT (Guard уже верифицирует и кладёт meta, но мы повторно логируем)
    verificationCode?: string
    ip?: string
    ua?: string
    meta?: any // если Guard передал
  }) {
    const { userId, verifyKey, verificationCode, ip, ua, meta } = opts

    // если meta не передан — попробуем получить через JWT -> sid
    let metaObj = meta
    let sessionId: string | undefined
    if (!metaObj) {
      // verify jwt
      const secret = this.configService.get<string>('ADS_SESSION_SECRET')
      if (!secret) return { success: false, reason: 'SERVER_MISCONFIG' }
      try {
        const payload: any = await this.jwtService.verifyAsync(verifyKey, {
          secret,
        })
        sessionId = payload?.sid
      } catch (e) {
        return { success: false, reason: 'INVALID_VERIFYKEY' }
      }
      const metaKey = `ad:session:meta:${sessionId}`
      metaObj = await this.redisService.getObject(metaKey)
      if (!metaObj) return { success: false, reason: 'NO_SESSION' }
    } else {
      sessionId = metaObj.sessionId
    }

    // 1) логируем попытку в Redis list (быстрая история для антифрода)
    const attempt = {
      at: Date.now(),
      ip: ip ?? null,
      ua: ua ?? null,
      userId,
      verificationCode: verificationCode ?? null,
    }
    try {
      const attemptsKey = `ad:attempts:${sessionId}`
      await this.redisService.lpush(attemptsKey, JSON.stringify(attempt))
      // держим только последние N записей — напр. 100
      await this.redisService.ltrim(attemptsKey, 0, 99)
      // TTL равен времени жизни сессии (чтобы не висели хвосты)
      if (metaObj?.duration) {
        await this.redisService.expire(
          attemptsKey,
          Math.max(60, metaObj.duration),
        )
      }
    } catch (e) {
      this.logger.warn(
        `Failed to push attempt for session ${sessionId}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      )
    }

    const networkOk = true
    if (!networkOk) {
      // log reject in stats
      try {
        const statsKey = `ad:stats:user:${userId}`
        await this.redisService.hincrby(statsKey, 'verif_failed', 1)
        await this.redisService.expire(statsKey, metaObj.duration * 2)
      } catch (e) {
        this.logger.warn(
          `Failed to update stats for user ${userId}: ${
            e instanceof Error ? e.message : String(e)
          }`,
        )
      }
      return { success: false, reason: 'NETWORK_VERIFICATION_FAILED' }
    }

    // 4) Проверяем, что сессия еще не была использована
    const usedKey = `ad:session:used:${sessionId}`
    const isUsed = await this.redisService.get(usedKey)
    if (isUsed !== null) {
      return { success: false, reason: 'SESSION_ALREADY_USED' }
    }

    // 5) grant reward in DB transaction (adapt fields to your schema)
    // const rewards = metaObj.rewards ?? {
    //   traffic: 0,
    //   stars: 0,
    //   tickets: 0,
    //   ad: 0,
    // }

    try {
      await this.prisma.$transaction(async (prisma) => {
        const getAd = await prisma.adsViews.findUnique({
          where: { verifyKey: sessionId },
        })

        if (!getAd) return

        const addBalanceResult = await this.usersService.addUserBalance(
          userId,
          getAd.rewardStars,
          TransactionReasonEnum.REWARD,
          BalanceTypeEnum.PAYMENT,
        )
        if (!addBalanceResult.success) return
        const ad = await prisma.adsViews.update({
          where: { verifyKey: sessionId },
          data: {
            claimedAt: new Date(),
          },
          select: {
            type: true,
            networkKey: true,
            userId: true,
            user: {
              select: {
                adsDataId: true,
              },
            },
          },
        })

        const settings = await prisma.settings.findUnique({
          where: {
            key: DefaultEnum.DEFAULT,
          },
        })

        if (ad.type == AdsTypeEnum.REWARD || ad.type == AdsTypeEnum.TASK) {
          await prisma.users.update({
            where: {
              id: ad.userId,
            },
            data: {
              ...(ad.type == AdsTypeEnum.REWARD && {
                nextAdsRewardAt: new Date(
                  addMinutes(
                    new Date(),
                    settings.adsRewardNextCompletionInMinute,
                  ),
                ),
              }),
              ...(ad.type == AdsTypeEnum.TASK && {
                nextAdsgramTaskAt: new Date(
                  addMinutes(
                    new Date(),
                    settings.adsgramTaskNextCompletionInMinute,
                  ),
                ),
              }),
            },
          })
        }

        await prisma.userAdsData.update({
          where: {
            id: ad.user.adsDataId,
          },
          data: {
            ...((ad.type == AdsTypeEnum.VIEW ||
              ad.type == AdsTypeEnum.REWARD) && {
              lastViewedNetwork: ad.networkKey,
            }),
            ...(ad.type == AdsTypeEnum.VIEW && {
              lastFullscreenViewedAt: new Date(),
            }),
            ...(ad.type == AdsTypeEnum.MESSAGE && {
              lastMessageAt: new Date(),
              lastMessageNetwork: ad.networkKey,
            }),
          },
        })
      })
      // Помечаем сессию как использованную
      await this.redisService.setWithExpiry(usedKey, '1', metaObj.duration)

      // increment stats success
      try {
        const statsKey = `ad:stats:user:${userId}`
        await this.redisService.hincrby(statsKey, 'granted', 1)
        await this.redisService.expire(statsKey, metaObj.duration * 2)
      } catch (e) {
        this.logger.warn(
          `Failed to update stats for user ${userId}: ${
            e instanceof Error ? e.message : String(e)
          }`,
        )
      }

      return { success: true, granted: true }
    } catch (err) {
      this.logger.error(
        `confirmAd: DB transaction failed for ${sessionId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
      // best-effort rollback: удаляем пометку об использовании
      try {
        await this.redisService.del(usedKey)
      } catch (e) {
        this.logger.error(
          `confirmAd: rollback del usedKey failed for ${sessionId}: ${
            e instanceof Error ? e.message : String(e)
          }`,
        )
      }
      return { success: false, reason: 'DB_ERROR' }
    }
  }

  @Cron('0 */10 * * * *')
  public async cleanupExpiredAdSessions(): Promise<void> {
    const cutoff = new Date(
      Date.now() - AdsService.SESSION_TTL_SECONDS * 1000,
    )
    const batchSize = 500

    while (true) {
      const expired = await this.prisma.adsViews.findMany({
        where: {
          claimedAt: null,
          createdAt: {
            lt: cutoff,
          },
        },
        select: {
          verifyKey: true,
        },
        take: batchSize,
      })

      if (expired.length === 0) break

      const verifyKeys = expired.map((item) => item.verifyKey)

      await this.prisma.adsViews.deleteMany({
        where: {
          verifyKey: {
            in: verifyKeys,
          },
        },
      })

      try {
        const redisKeys: string[] = []
        for (const sid of verifyKeys) {
          redisKeys.push(`ad:session:meta:${sid}`)
          redisKeys.push(`ad:attempts:${sid}`)
          redisKeys.push(`ad:session:used:${sid}`)
        }
        if (redisKeys.length > 0) {
          await this.redisService.del(...redisKeys)
        }
      } catch (e) {
        this.logger.warn(
          `cleanupExpiredAdSessions: failed to purge redis keys: ${
            e instanceof Error ? e.message : String(e)
          }`,
        )
      }
    }
  }

  // stub: разные сети могут требовать server-side проверок; для AdsGram мы полагаемся на локальную сессию
  // private async verifyWithNetwork(
  //   networkKey: string,
  //   ctx: { verificationCode?: string; verifyKey: string; userId: string },
  // ) {
  //   switch (String(networkKey)) {
  //     case 'ADSGRAM':
  //       // AdsGram в твоём случае не даёт подписи — возвращаем true
  //       return true
  //     default:
  //       // для неизвестных сетей — требуем verificationCode (здесь всегда false)
  //       return false
  //   }
  // }
}
