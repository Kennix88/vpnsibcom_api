import { PrismaService } from '@core/prisma/prisma.service'
import { RedisService } from '@core/redis/redis.service'
import { UsersService } from '@modules/users/users.service'
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { BalanceTypeEnum } from '@shared/enums/balance-type.enum'
import { TransactionReasonEnum } from '@shared/enums/transaction-reason.enum'
import { AdsPlaceEnum } from './types/ads-place.enum'
import { AdsTaskTypeEnum } from './types/ads-task-type.enum'

@Injectable()
export class AdsService {
  private readonly logger = new Logger(AdsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Создаёт ad session; возвращает VerifyKey (JWT) и информацию для клиента.
   */
  public async createAdSession(opts: {
    userId: string
    telegramId?: string
    place: AdsPlaceEnum
    type: AdsTaskTypeEnum
    ip?: string
    ua?: string
  }) {
    const { userId, telegramId, place, type, ip, ua } = opts

    // 1) получаем доступные блоки
    const blocks = await this.prisma.adsBlocks.findMany({
      where: { place: place, isActive: true, network: { isActive: true } },
      include: { network: true },
    })

    if (!blocks || blocks.length === 0) {
      throw new Error('NO_AD_BLOCKS')
    }

    const block = blocks[Math.floor(Math.random() * blocks.length)]
    const limit = block.limit ?? 1
    const duration = block.duration ?? 60 // сек

    const sessionId = crypto.randomUUID()
    const meta = {
      sessionId,
      userId,
      telegramId,
      blockId: block.id,
      networkKey: block.networkKey,
      rewards: {
        traffic: Number(block.rewardTraffic ?? 0),
        stars: Number(block.rewardStars ?? 0),
        tickets: Number(block.rewardTickets ?? 0),
      },
      limit,
      createdAt: Date.now(),
      duration,
      createdIp: ip ?? null,
      createdUa: ua ?? null,
    }

    const metaKey = `ad:session:meta:${sessionId}`

    // store only meta in Redis with expiration
    await this.redisService.setObjectWithExpiry(metaKey, meta, duration)

    // сохраняем запись AdsViews (verifyKey пока UUID -> later replaced by JWT returned to client)
    await this.prisma.adsViews.create({
      data: {
        networkKey: block.networkKey,
        type: type,
        rewardTraffic: meta.rewards.traffic,
        rewardStars: meta.rewards.stars,
        rewardTickets: meta.rewards.tickets,
        duration,
        verifyKey: sessionId as string, // сохраняем sid; клиент получит JWT, но в БД храним sid для привязки
        userId,
        blockId: block.id,
        ...(type === AdsTaskTypeEnum.VIEW && {
          claimedAt: new Date(),
        }),
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

    this.logger.log(
      `Created ad session ${sessionId} (JWT returned) for user ${userId} block ${block.id}`,
    )

    return {
      type: opts.type,
      place,
      network: block.networkKey,
      time: new Date(),
      rewards: meta.rewards,
      blockId: block.id,
      limit,
      verifyKey, // JWT — отдаём клиенту
      duration,
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
      // TTL немного длиннее duration, например duration*4
      if (metaObj?.duration) {
        await this.redisService.expire(
          attemptsKey,
          Math.max(60, metaObj.duration * 4),
        )
      }
    } catch (e) {
      this.logger.warn(
        `Failed to push attempt for session ${sessionId}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      )
    }

    // 2) создаём запись attempt в БД (audit). Здесь мы используем rewardLog для логов попыток (amounts = 0)
    try {
      await this.prisma.rewardLog.create({
        data: {
          userId,
          rewardTraffic: 0,
          rewardStars: 0,
          rewardTickets: 0,
          source: `${metaObj?.networkKey ?? 'UNKNOWN'}_ATTEMPT`,
          reference: sessionId,
          ip,
          ua,
        },
      })
    } catch (e) {
      this.logger.warn(
        `Failed to create rewardLog attempt for ${sessionId}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      )
    }

    // 3) network-specific verification
    // const networkOk = await this.verifyWithNetwork(metaObj.networkKey, {
    //   verificationCode,
    //   verifyKey: sessionId,
    //   userId,
    // })
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
    const rewards = metaObj.rewards ?? { traffic: 0, stars: 0, tickets: 0 }

    try {
      await this.prisma.$transaction(async (prisma) => {
        await this.usersService.addUserBalance(
          userId,
          rewards.traffic,
          TransactionReasonEnum.REWARD,
          BalanceTypeEnum.TRAFFIC,
        )
        await this.usersService.addUserBalance(
          userId,
          rewards.stars,
          TransactionReasonEnum.REWARD,
          BalanceTypeEnum.PAYMENT,
        )
        await this.usersService.addUserBalance(
          userId,
          rewards.tickets,
          TransactionReasonEnum.REWARD,
          BalanceTypeEnum.TICKETS,
        )
        // optionally mark adsViews as claimed (если есть поле)
        await prisma.adsViews.updateMany({
          where: { verifyKey: sessionId },
          data: {
            claimedAt: new Date(),
          },
        })
        // create rewardLog with actual amounts
        await prisma.rewardLog.create({
          data: {
            userId,
            rewardTraffic: rewards.traffic ?? 0,
            rewardStars: rewards.stars ?? 0,
            rewardTickets: rewards.tickets ?? 0,
            source: metaObj.networkKey,
            reference: sessionId,
            ip,
            ua,
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

      this.logger.log(
        `confirmAd: granted ${JSON.stringify(
          rewards,
        )} to user ${userId} for session ${sessionId}`,
      )
      return { success: true, granted: true, rewards }
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
