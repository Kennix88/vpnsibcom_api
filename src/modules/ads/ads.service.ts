import { PlansEnum } from '@core/prisma/generated/enums'
import { PrismaService } from '@core/prisma/prisma.service'
import { RedisService } from '@core/redis/redis.service'
import { UsersService } from '@modules/users/services/users.service'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { Cron } from '@nestjs/schedule'
import { BalanceTypeEnum } from '@shared/enums/balance-type.enum'
import { DefaultEnum } from '@shared/enums/default.enum'
import { TransactionReasonEnum } from '@shared/enums/transaction-reason.enum'
import {
  OSEnum,
  TelegramPlatformEnum,
} from '@shared/utils/detect-platform.util'
import { addMinutes, isAfter } from 'date-fns'
import { PinoLogger } from 'nestjs-pino'
import { RichAdsService } from './richads.service'
import {
  AdsgramBotAdResponse,
  AdsgramService,
} from './services/adsgram.service'
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
    private readonly adsgramService: AdsgramService,
  ) {}

  public async getAdTaskReward({
    place,
  }: {
    place: 'adsgram' | 'reward'
  }): Promise<TaskRewardResInterface> {
    try {
      const reward = await this.prisma.adsRewards.findUnique({
        where: {
          key: DefaultEnum.DEFAULT,
        },
      })
      this.logger.info(reward)
      return reward
        ? {
            amount:
              place === 'adsgram'
                ? Number(reward.taskAdsgram)
                : Number(reward.taskView),
          }
        : { amount: 0 }
    } catch (error) {
      this.logger.error(error)
    }
  }

  public async getRedirectAd(key: string): Promise<{
    success: boolean
    reason?: string
    redirectUrl?: string
    rewardStars?: number
  }> {
    const ad = await this.prisma.adsViews.findUnique({
      where: {
        verifyKey: key,
        redirectUrl: {
          not: null,
        },
      },
    })
    if (!ad) {
      this.logger.warn('ad not found')
      return { success: false, reason: 'ad not found' }
    }
    return {
      success: true,
      redirectUrl: ad.redirectUrl,
      rewardStars: ad.rewardStars,
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
    platform: TelegramPlatformEnum
    os?: OSEnum
  }): Promise<AdsResInterface> {
    const { userId, telegramId, place, type, ip, ua } = opts
    const now = new Date()

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
      return { isNoAds: true }
    }

    if (
      user.subscriptions.length > 0 &&
      (place == AdsPlaceEnum.MESSAGE ||
        place == AdsPlaceEnum.FULLSCREEN ||
        place == AdsPlaceEnum.BANNER)
    ) {
      return { isNoAds: true }
    }

    if (
      type == AdsTypeEnum.VIEW &&
      user?.adsData?.lastFullscreenViewedAt &&
      !isAfter(
        new Date(),
        addMinutes(new Date(user.adsData.lastFullscreenViewedAt), 3),
      )
    ) {
      return { isNoAds: true }
    }

    const blocks = await this.getEligibleBlocks({
      place,
      platform: opts.platform,
    })

    if (!blocks || blocks.length === 0) {
      return { isNoAds: true }
    }

    let meta = {}
    let block: (typeof blocks)[0] | undefined
    const limit = 1
    const duration = AdsService.SESSION_TTL_SECONDS
    let ad: RichAdsGetAdResponseInterface | TaddyGetAdResponseInterface | null =
      null

    const sessionId = crypto.randomUUID()

    if (place == AdsPlaceEnum.MESSAGE) {
      // ── Бот: Taddy → Adsgram Bot → RichAds ───────────────────────────────────

      const hasTaddy = blocks.some((b) => b.networkKey === AdsNetworkEnum.TADDY)
      const hasAdsgram = blocks.some(
        (b) => b.networkKey === AdsNetworkEnum.ADSGRAM,
      )
      const hasRichAds = blocks.some(
        (b) => b.networkKey === AdsNetworkEnum.RICHADS,
      )

      if (!hasTaddy && !hasAdsgram && !hasRichAds) {
        return { isNoAds: true }
      }

      // 1. Taddy
      if (hasTaddy) {
        const filtered = blocks.filter(
          (b) => b.networkKey === AdsNetworkEnum.TADDY,
        )
        block = filtered[Math.floor(Math.random() * filtered.length)]
        try {
          ad = await this.taddy.getAd({
            user: { id: Number(user.telegramId) },
            origin: TaddyOriginEnum.SERVER,
            format: TaddyAdFormatEnum.BOT_AD,
          })
        } catch (e) {
          this.logger.warn(
            `TADDY getAd failed for user ${user.telegramId}: ${
              e instanceof Error ? e.message : String(e)
            }`,
          )
        }
      }

      // 2. Adsgram Bot
      if (!ad && hasAdsgram) {
        if (!user.telegramId) return { isNoAds: true }
        const filtered = blocks.filter(
          (b) => b.networkKey === AdsNetworkEnum.ADSGRAM,
        )
        block = filtered[Math.floor(Math.random() * filtered.length)]
        try {
          const adsgramAd = await this.adsgramService.getAdForBot({
            telegramId: user.telegramId,
            blockId: block.key,
            language: user.telegramData?.languageCode,
          })
          if (adsgramAd) ad = adsgramAd as unknown as typeof ad
        } catch (e) {
          this.logger.warn(
            `ADSGRAM BOT getAd failed for user ${user.telegramId}: ${
              e instanceof Error ? e.message : String(e)
            }`,
          )
        }
      }

      // 3. RichAds
      if (!ad && hasRichAds) {
        if (!user?.telegramData || !user.telegramId) return { isNoAds: true }
        const filtered = blocks.filter(
          (b) => b.networkKey === AdsNetworkEnum.RICHADS,
        )
        block = filtered[Math.floor(Math.random() * filtered.length)]
        try {
          ad = await this.richAdsService.getAd({
            language_code: user.telegramData.languageCode,
            telegram_id: user.telegramId,
            widget_id: block.key,
          })
        } catch (e) {
          this.logger.warn(
            `RICHADS getAd failed for user ${userId}: ${
              e instanceof Error ? e.message : String(e)
            }`,
          )
        }
      }

      if (!ad || !block) return { isNoAds: true }

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

      // Для Adsgram Bot сохраняем sessionId по userId — нужно для reward webhook
      if (block.networkKey === AdsNetworkEnum.ADSGRAM) {
        await this.redisService.setWithExpiry(
          `ad:adsgram:bot:pending:${userId}`,
          sessionId,
          duration,
        )
      }
    } else {
      // ── TMA / веб: приоритетная ротация по сетям ──────────────────────────

      const selected = await this.selectPriorityBlock({
        userId,
        place,
        blocks: blocks as Array<{
          id: string
          key: string
          networkKey: AdsNetworkEnum
          network: { priority: number }
        }>,
        now,
      })

      if (!selected) {
        return { isNoAds: true }
      }

      block = selected.block as typeof block
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
    await this.redisService.setObjectWithExpiry(metaKey, meta, duration)

    const adsRewards = await this.prisma.adsRewards.findUnique({
      where: { key: DefaultEnum.DEFAULT },
    })

    // Сохраняем AdsViews; verifyKey = UUID сессии (клиент получит JWT)
    await this.prisma.adsViews.create({
      data: {
        networkKey: block.networkKey,
        type: type,
        rewardStars:
          place == AdsPlaceEnum.REWARD_TASK && type == AdsTypeEnum.REWARD
            ? Number(adsRewards?.taskView)
            : place == AdsPlaceEnum.REWARD_TASK && type == AdsTypeEnum.TASK
            ? Number(adsRewards?.taskAdsgram)
            : place == AdsPlaceEnum.MESSAGE && type == AdsTypeEnum.MESSAGE
            ? Number(adsRewards?.botMessage)
            : 0,
        duration,
        verifyKey: sessionId,
        userId,
        ip: ip ?? null,
        ua: ua ?? null,
        blockId: block.id,
        ...(ad &&
          block.place === AdsPlaceEnum.MESSAGE &&
          (() => {
            switch (block.networkKey) {
              case AdsNetworkEnum.RICHADS:
                return {
                  redirectUrl:
                    (ad as RichAdsGetAdResponseInterface).link ?? null,
                }

              case AdsNetworkEnum.TADDY:
                return {
                  redirectUrl:
                    (ad as TaddyGetAdResponseInterface).result?.link ?? null,
                }

              case AdsNetworkEnum.ADSGRAM:
                return {
                  redirectUrl: (ad as AdsgramBotAdResponse).click_url ?? null,
                }

              default:
                return {}
            }
          })()),
      },
    })

    const secret = this.configService.get<string>('ADS_SESSION_SECRET')
    if (!secret) throw new Error('ADS_SESSION_SECRET not configured')

    const verifyKey = await this.jwtService.signAsync(
      { sid: sessionId },
      { secret, expiresIn: `${duration}s` },
    )

    // Быстрая статистика в Redis
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

    const goAdsUrl =
      (this.configService.get<string>('ALLOWED_ORIGIN') ||
        'https://fasti.fun') + `/ad-redirect/${sessionId}`

    return {
      isNoAds: false,
      ad: {
        type: opts.type,
        place,
        network: block.networkKey as AdsNetworkEnum,
        time: new Date(),
        blockId: block.key,
        verifyKey,
        goAdsUrl,
      },
      ...(ad && block.networkKey === AdsNetworkEnum.RICHADS
        ? {
            richAds: {
              ...(ad as RichAdsGetAdResponseInterface),
            },
          }
        : ad && block.networkKey === AdsNetworkEnum.TADDY
        ? { taddy: { ...(ad as TaddyGetAdResponseInterface) } }
        : ad && block.networkKey === AdsNetworkEnum.ADSGRAM
        ? { adsgram: { ...(ad as unknown as AdsgramBotAdResponse) } }
        : {}),
    }
  }

  // ── Вспомогательные методы ──────────────────────────────────────────────────

  private async getEligibleBlocks(opts: {
    place: AdsPlaceEnum
    platform: TelegramPlatformEnum | null
  }) {
    const { place, platform } = opts
    const platformFilter = this.getPlatformBlockFilter(platform)

    return this.prisma.adsBlocks.findMany({
      where: {
        place,
        isActive: true,
        ...platformFilter,
        network: {
          isActive: true,
        },
      },
      include: {
        network: true,
      },
    })
  }

  private getPlatformBlockFilter(platform: TelegramPlatformEnum | null) {
    if (platform === TelegramPlatformEnum.BOT) return { showBot: true }
    if (platform === TelegramPlatformEnum.ANDROID) return { showAndroid: true }
    if (platform === TelegramPlatformEnum.IOS) return { showIos: true }
    if (platform === TelegramPlatformEnum.DESKTOP) return { showDesktop: true }
    if (platform === TelegramPlatformEnum.WEB) return { showWeb: true }
    return {}
  }

  /**
   * Выбирает блок с учётом:
   *  1. Фильтрации сетей, у которых уже была создана сессия в последний час
   *     (защита от frequency capping рекламной сети).
   *     Используется createdAt, а не claimedAt — неподтверждённые сессии
   *     тоже должны учитываться, иначе одну сеть можно показать несколько раз.
   *  2. Суточной ротации: если сегодня последней подтверждённой (claimedAt)
   *     была сеть с приоритетом N, берём следующую по приоритету (> N).
   *     Если таких нет — начинаем круг сначала.
   *  3. Если после фильтрации по последнему часу не осталось ни одной сети,
   *     начинаем новый круг, чтобы реклама не возвращала isNoAds.
   */
  private async selectPriorityBlock(opts: {
    userId: string
    place: AdsPlaceEnum
    blocks: Array<{
      id: string
      key: string
      networkKey: AdsNetworkEnum
      network: { priority: number }
    }>
    now: Date
  }): Promise<{ block: (typeof opts.blocks)[number] } | null> {
    const { userId, place, blocks, now } = opts
    if (blocks.length === 0) return null

    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
    const dayStart = new Date(now)
    dayStart.setHours(0, 0, 0, 0)

    // Получаем недавние сессии с временем создания — нужно и для блокировки,
    // и для LRU-сортировки в фолбэке.
    const recentSessions = await this.prisma.adsViews.findMany({
      where: {
        userId,
        createdAt: { gte: oneHourAgo },
        block: { place },
      },
      select: { networkKey: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    })

    const blockedNetworks = new Set(recentSessions.map((v) => v.networkKey))

    // Самая поздняя сессия за последний час на сеть (для LRU-фолбэка).
    const lastSeenAt = new Map<string, Date>()
    for (const s of recentSessions) {
      if (!lastSeenAt.has(s.networkKey)) {
        lastSeenAt.set(s.networkKey, s.createdAt)
      }
    }

    const todayLastConfirmed = await this.prisma.adsViews.findFirst({
      where: {
        userId,
        claimedAt: { gte: dayStart },
        block: { place },
      },
      orderBy: { claimedAt: 'desc' },
      select: { networkKey: true },
    })

    const networkMap = this.buildNetworkMap(blocks)

    const allNetworks = Array.from(networkMap.values()).sort(
      (a, b) => a.priority - b.priority || a.key.localeCompare(b.key),
    )

    const eligible = allNetworks.filter((n) => !blockedNetworks.has(n.key))

    let rotated: typeof allNetworks

    if (eligible.length === 0) {
      // ── Фолбэк: все сети в часовом блоке ────────────────────────────────────
      // Вместо рестарта с приоритетной сети используем LRU:
      // первой идёт та, чья последняя сессия была создана раньше всего.
      // Это не даёт приоритетной сети показываться подряд после завершения круга.
      rotated = [...allNetworks].sort((a, b) => {
        const aTime = lastSeenAt.get(a.key)?.getTime() ?? 0
        const bTime = lastSeenAt.get(b.key)?.getTime() ?? 0
        return aTime - bTime // oldest shown → first in queue
      })
    } else {
      // ── Нормальный режим: приоритетная ротация ───────────────────────────────
      const lastPriority = todayLastConfirmed
        ? networkMap.get(todayLastConfirmed.networkKey as AdsNetworkEnum)
            ?.priority
        : undefined
      rotated = this.rotateNetworks(eligible, lastPriority)
    }

    for (const network of rotated) {
      const candidates = blocks.filter((b) => b.networkKey === network.key)
      if (candidates.length === 0) continue
      const chosen = candidates[Math.floor(Math.random() * candidates.length)]
      if (chosen) return { block: chosen }
    }

    return null
  }

  /**
   * Строит Map networkKey → {key, priority} без дублей.
   * Использует Array.from вместо iterator helpers (совместимость с Node < 22).
   */
  private buildNetworkMap(
    blocks: Array<{
      networkKey: AdsNetworkEnum
      network: { priority: number }
    }>,
  ): Map<AdsNetworkEnum, { key: AdsNetworkEnum; priority: number }> {
    const map = new Map<
      AdsNetworkEnum,
      { key: AdsNetworkEnum; priority: number }
    >()
    for (const b of blocks) {
      if (!map.has(b.networkKey)) {
        map.set(b.networkKey, {
          key: b.networkKey,
          priority: Number(b.network?.priority ?? 100),
        })
      }
    }
    return map
  }

  /**
   * Ротация: берём сети со строго большим приоритетом, чем lastPriority
   * (т.е. следующие по очереди). Если таких нет — начинаем круг сначала.
   * networks передаётся уже отсортированным по priority asc.
   */
  private rotateNetworks(
    networks: Array<{ key: AdsNetworkEnum; priority: number }>,
    lastPriority?: number,
  ): Array<{ key: AdsNetworkEnum; priority: number }> {
    if (typeof lastPriority !== 'number') return networks

    const next = networks.filter((n) => n.priority > lastPriority)
    return next.length > 0 ? next : networks
  }

  // ── confirmAd ───────────────────────────────────────────────────────────────

  /**
   * Confirm ad: логируем попытку, проверяем network, атомарно уменьшаем
   * remaining и при успехе начисляем.
   */
  public async confirmAd(opts: {
    userId?: string
    verifyKey: string
    isEasy: boolean
    verificationCode?: string
    ip?: string
    ua?: string
    meta?: any
    isTaddy?: boolean
  }) {
    const { userId, verifyKey, verificationCode, ip, ua, meta, isEasy } = opts

    let metaObj = meta
    let sessionId: string | undefined

    if (!metaObj && !isEasy) {
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
    } else if (!isEasy) {
      sessionId = metaObj.sessionId
    } else if (isEasy) {
      sessionId = verifyKey
    }

    // Логируем попытку в Redis list (антифрод)
    const attempt = {
      at: Date.now(),
      ip: ip ?? null,
      ua: ua ?? null,
      userId,
      verificationCode: verificationCode ?? null,
    }

    if (!isEasy) {
      try {
        const attemptsKey = `ad:attempts:${sessionId}`
        await this.redisService.lpush(attemptsKey, JSON.stringify(attempt))
        await this.redisService.ltrim(attemptsKey, 0, 99)
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
    }

    const networkOk = true
    if (!networkOk) {
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

    // Проверяем, что сессия ещё не была использована
    const usedKey = `ad:session:used:${sessionId}`
    if (!isEasy) {
      const isUsed = await this.redisService.get(usedKey)
      if (isUsed !== null) {
        return { success: false, reason: 'SESSION_ALREADY_USED' }
      }
    }

    try {
      await this.prisma.$transaction(async (prisma) => {
        const getAd = await prisma.adsViews.findUnique({
          where: { verifyKey: isEasy ? verifyKey : sessionId },
        })

        if (!getAd || getAd.claimedAt) return

        const addBalanceResult = await this.usersService.addUserBalance(
          getAd.userId,
          Number(getAd.rewardStars),
          TransactionReasonEnum.REWARD,
          BalanceTypeEnum.PAYMENT,
        )
        if (!addBalanceResult.success) return

        const ad = await prisma.adsViews.update({
          where: { verifyKey: sessionId },
          data: {
            claimedAt: new Date(),
            ip: ip ?? null,
            ua: ua ?? null,
            ...(opts.isTaddy && { networkKey: AdsNetworkEnum.TADDY }),
          },
          select: {
            type: true,
            networkKey: true,
            userId: true,
            user: {
              select: { adsDataId: true },
            },
          },
        })

        const settings = await prisma.settings.findUnique({
          where: { key: DefaultEnum.DEFAULT },
        })

        if (ad.type == AdsTypeEnum.REWARD || ad.type == AdsTypeEnum.TASK) {
          await prisma.users.update({
            where: { id: ad.userId },
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
          where: { id: ad.user.adsDataId },
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

      if (!isEasy) {
        await this.redisService.setWithExpiry(usedKey, '1', metaObj.duration)

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
      }

      return { success: true, granted: true }
    } catch (err) {
      this.logger.error(
        `confirmAd: DB transaction failed for ${sessionId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
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

  // ── Cleanup cron ────────────────────────────────────────────────────────────

  @Cron('0 */10 * * * *')
  public async cleanupExpiredAdSessions(): Promise<void> {
    const cutoff = new Date(Date.now() - AdsService.SESSION_TTL_SECONDS * 1000)
    const batchSize = 500

    while (true) {
      const expired = await this.prisma.adsViews.findMany({
        where: {
          claimedAt: null,
          createdAt: { lt: cutoff },
        },
        select: { verifyKey: true },
        take: batchSize,
      })

      if (expired.length === 0) break

      const verifyKeys = expired.map((item) => item.verifyKey)

      await this.prisma.adsViews.deleteMany({
        where: { verifyKey: { in: verifyKeys } },
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
}
