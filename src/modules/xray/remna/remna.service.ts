import { RedisService } from '@core/redis/redis.service'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  isAxiosError,
} from 'axios'
import axiosRetry from 'axios-retry'
import { PinoLogger } from 'nestjs-pino'

import {
  REMNA_CACHE_PREFIX,
  REMNA_CACHE_TTL_SECONDS,
  REMNA_DEFAULT_MAX_RETRIES,
  REMNA_DEFAULT_TIMEOUT_MS,
  REMNA_ENV,
} from './remna.constants'
import { RemnaApiException } from './remna.exceptions'
import type {
  BulkAllExtendExpirationDateDto,
  BulkAllUpdateUsersDto,
  BulkDeleteUsersByStatusDto,
  BulkExtendExpirationDateDto,
  BulkUpdateUsersDto,
  BulkUpdateUsersSquadsDto,
  BulkUuidsDto,
  CreateHwidDeviceDto,
  CreateRemnaUserDto,
  DeleteAllHwidDevicesDto,
  DeleteHwidDeviceDto,
  DropConnectionsDto,
  DropConnectionsResult,
  FetchIpsJobResult,
  FetchIpsResult,
  FetchUsersIpsResult,
  GetAllHwidDevicesResult,
  GetAllSubscriptionsResult,
  GetAllTagsResult,
  GetAllUsersResult,
  GetConnectionKeysResult,
  GetHwidDevicesStatsResult,
  GetLegacyUserUsageParams,
  GetSubpageConfigDto,
  GetSubpageConfigResult,
  GetTopUsersByHwidDevicesResult,
  GetUserAccessibleNodesResult,
  GetUserHwidDevicesResult,
  GetUserSubscriptionRequestHistoryResult,
  GetUserUsageParams,
  GetUserUsageResult,
  RemnaApiEnvelope,
  RemnaApiErrorBody,
  RemnaBulkAffectedResult,
  RemnaBulkEventResult,
  RemnaLegacyUserUsageEntry,
  RemnaNode,
  RemnaPaginationParams,
  RemnaRawSubscription,
  RemnaSubscriptionClientType,
  RemnaSubscriptionInfo,
  RemnaUser,
  ResolveUserDto,
  ResolveUserResult,
  RevokeUserSubscriptionDto,
  UpdateRemnaUserDto,
} from './remna.types'

@Injectable()
export class RemnaService {
  private client: AxiosInstance
  private readonly serviceName = 'RemnaService'

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
    private readonly redis: RedisService,
  ) {
    this.logger.setContext(this.serviceName)
    this.client = this.createHttpClient()
  }

  // ==================== Инициализация HTTP-клиента ====================

  private createHttpClient(): AxiosInstance {
    const baseURL = this.configService.getOrThrow<string>(REMNA_ENV.API_URL)
    const token = this.configService.getOrThrow<string>(REMNA_ENV.API_TOKEN)
    const timeout = this.configService.get<number>(
      REMNA_ENV.TIMEOUT_MS,
      REMNA_DEFAULT_TIMEOUT_MS,
    )
    const maxRetries = this.configService.get<number>(
      REMNA_ENV.MAX_RETRIES,
      REMNA_DEFAULT_MAX_RETRIES,
    )

    const client = axios.create({
      baseURL,
      timeout,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })

    axiosRetry(client, {
      retries: maxRetries,
      retryDelay: axiosRetry.exponentialDelay,
      retryCondition: (error: AxiosError) => {
        // Ретраим только сетевые сбои/таймауты и 5xx/429 — идемпотентность bulk-эндпоинтов панели не гарантирована,
        // но GET-запросы и большинство POST-действий панели безопасны к повтору при отсутствии ответа.
        if (axiosRetry.isNetworkOrIdempotentRequestError(error)) return true
        const status = error.response?.status
        return status === 429 || (status !== undefined && status >= 500)
      },
    })

    return client
  }

  // ==================== Внутренние HTTP-хелперы ====================

  /** Убирает undefined-поля из query-параметров, чтобы не засорять URL */
  private buildQuery(params?: object): Record<string, unknown> | undefined {
    if (!params) return undefined
    const entries = Object.entries(params).filter(
      ([, value]) => value !== undefined,
    )
    return entries.length ? Object.fromEntries(entries) : undefined
  }

  /** Базовый запрос с распаковкой конверта { response: T } и унифицированной обработкой ошибок */
  private async request<T>(
    config: AxiosRequestConfig,
    operation: string,
    meta?: unknown,
  ): Promise<T> {
    const startedAt = Date.now()

    this.logger.debug(
      { operation, meta, method: config.method, url: config.url },
      `[Remna] -> ${operation}`,
    )

    try {
      const response = await this.client.request<RemnaApiEnvelope<T>>(config)

      this.logger.debug(
        {
          operation,
          status: response.status,
          durationMs: Date.now() - startedAt,
        },
        `[Remna] <- ${operation}`,
      )

      return response.data.response
    } catch (error) {
      throw this.handleError(error, operation, meta)
    }
  }

  /** Запрос без конверта — используется для подписок, отдаваемых как raw text (yaml/base64/plain) */
  private async requestRaw(
    config: AxiosRequestConfig,
    operation: string,
    meta?: unknown,
  ): Promise<string> {
    const startedAt = Date.now()

    this.logger.debug(
      { operation, meta, method: config.method, url: config.url },
      `[Remna] -> ${operation}`,
    )

    try {
      const response = await this.client.request<string>({
        ...config,
        responseType: 'text',
        transformResponse: (data: string) => data,
      })

      this.logger.debug(
        {
          operation,
          status: response.status,
          durationMs: Date.now() - startedAt,
        },
        `[Remna] <- ${operation}`,
      )

      return response.data
    } catch (error) {
      throw this.handleError(error, operation, meta)
    }
  }

  private handleError(
    error: unknown,
    operation: string,
    meta?: unknown,
  ): RemnaApiException {
    if (isAxiosError(error)) {
      const statusCode = error.response?.status
      const body = error.response?.data as RemnaApiErrorBody | undefined
      const isTimeout = error.code === 'ECONNABORTED'
      const isNetworkError = !error.response

      this.logger.error(
        {
          operation,
          meta,
          statusCode,
          remnaMessage: body?.message,
          errors: body?.errors,
          isNetworkError,
          isTimeout,
          url: error.config?.url,
          method: error.config?.method,
        },
        `[Remna] Request failed: ${operation}`,
      )

      return new RemnaApiException({
        operation,
        statusCode,
        remnaMessage: body?.message,
        errors: body?.errors,
        isNetworkError,
        isTimeout,
        cause: error,
      })
    }

    this.logger.error(
      { operation, meta, err: error },
      `[Remna] Unexpected error: ${operation}`,
    )

    return new RemnaApiException({
      operation,
      isNetworkError: true,
      cause: error,
    })
  }

  // ==================== Redis-кэш (опционально, для read-heavy эндпоинтов) ====================
  // RedisService в проекте наследует ioredis напрямую и добавляет getObject/setObjectWithExpiry
  // (JSON-сериализация "под капотом") + нативные команды ioredis (del и т.д.).

  private cacheKey(...parts: string[]): string {
    return [REMNA_CACHE_PREFIX, ...parts].join(':')
  }

  private async cacheGet<T>(key: string): Promise<T | null> {
    try {
      return await this.redis.getObject<T>(key)
    } catch (error) {
      this.logger.warn(
        { key, err: error },
        '[Remna] Cache read failed, falling back to API',
      )
      return null
    }
  }

  private async cacheSet<T>(
    key: string,
    value: T,
    ttlSeconds: number,
  ): Promise<void> {
    try {
      const ok = await this.redis.setObjectWithExpiry(key, value, ttlSeconds)
      if (!ok) {
        this.logger.warn({ key }, '[Remna] Cache write returned falsy result')
      }
    } catch (error) {
      this.logger.warn(
        { key, err: error },
        '[Remna] Cache write failed, ignoring',
      )
    }
  }

  private async cacheInvalidate(key: string): Promise<void> {
    try {
      await this.redis.del(key)
    } catch (error) {
      this.logger.warn(
        { key, err: error },
        '[Remna] Cache invalidation failed, ignoring',
      )
    }
  }

  // =========================================================================
  // ============================== USERS ===================================
  // =========================================================================

  async createUser(dto: CreateRemnaUserDto): Promise<RemnaUser> {
    return this.request<RemnaUser>(
      { method: 'POST', url: '/api/users', data: dto },
      'createUser',
      { username: dto.username },
    )
  }

  async updateUser(dto: UpdateRemnaUserDto): Promise<RemnaUser> {
    const user = await this.request<RemnaUser>(
      { method: 'PATCH', url: '/api/users', data: dto },
      'updateUser',
      { uuid: dto.uuid },
    )
    await this.cacheInvalidate(this.cacheKey('user', dto.uuid))
    return user
  }

  async getAllUsers(
    params?: RemnaPaginationParams,
  ): Promise<GetAllUsersResult> {
    return this.request<GetAllUsersResult>(
      { method: 'GET', url: '/api/users', params: this.buildQuery(params) },
      'getAllUsers',
      params,
    )
  }

  async deleteUser(uuid: string): Promise<boolean> {
    const result = await this.request<{ isDeleted: boolean }>(
      { method: 'DELETE', url: `/api/users/${uuid}` },
      'deleteUser',
      { uuid },
    )
    await this.cacheInvalidate(this.cacheKey('user', uuid))
    return result.isDeleted
  }

  async getUserByUuid(uuid: string, useCache = true): Promise<RemnaUser> {
    const cacheKey = this.cacheKey('user', uuid)

    if (useCache) {
      const cached = await this.cacheGet<RemnaUser>(cacheKey)
      if (cached) return cached
    }

    const user = await this.request<RemnaUser>(
      { method: 'GET', url: `/api/users/${uuid}` },
      'getUserByUuid',
      { uuid },
    )

    if (useCache) {
      await this.cacheSet(cacheKey, user, REMNA_CACHE_TTL_SECONDS.USER_BY_UUID)
    }

    return user
  }

  async getAllTags(): Promise<string[]> {
    const result = await this.request<GetAllTagsResult>(
      { method: 'GET', url: '/api/users/tags' },
      'getAllTags',
    )
    return result.tags
  }

  async getUserAccessibleNodes(
    uuid: string,
  ): Promise<GetUserAccessibleNodesResult> {
    return this.request<GetUserAccessibleNodesResult>(
      { method: 'GET', url: `/api/users/${uuid}/accessible-nodes` },
      'getUserAccessibleNodes',
      { uuid },
    )
  }

  async getUserSubscriptionRequestHistory(
    uuid: string,
  ): Promise<GetUserSubscriptionRequestHistoryResult> {
    return this.request<GetUserSubscriptionRequestHistoryResult>(
      { method: 'GET', url: `/api/users/${uuid}/subscription-request-history` },
      'getUserSubscriptionRequestHistory',
      { uuid },
    )
  }

  async getUserByShortUuid(shortUuid: string): Promise<RemnaUser> {
    return this.request<RemnaUser>(
      { method: 'GET', url: `/api/users/by-short-uuid/${shortUuid}` },
      'getUserByShortUuid',
      { shortUuid },
    )
  }

  async getUserByUsername(username: string): Promise<RemnaUser> {
    return this.request<RemnaUser>(
      { method: 'GET', url: `/api/users/by-username/${username}` },
      'getUserByUsername',
      { username },
    )
  }

  async getUserById(id: string | number): Promise<RemnaUser> {
    return this.request<RemnaUser>(
      { method: 'GET', url: `/api/users/by-id/${id}` },
      'getUserById',
      { id },
    )
  }

  async getUsersByTelegramId(
    telegramId: string | number,
  ): Promise<RemnaUser[]> {
    return this.request<RemnaUser[]>(
      { method: 'GET', url: `/api/users/by-telegram-id/${telegramId}` },
      'getUsersByTelegramId',
      { telegramId },
    )
  }

  async getUsersByEmail(email: string): Promise<RemnaUser[]> {
    return this.request<RemnaUser[]>(
      {
        method: 'GET',
        url: `/api/users/by-email/${encodeURIComponent(email)}`,
      },
      'getUsersByEmail',
      { email },
    )
  }

  async getUsersByTag(tag: string): Promise<RemnaUser[]> {
    return this.request<RemnaUser[]>(
      { method: 'GET', url: `/api/users/by-tag/${tag}` },
      'getUsersByTag',
      { tag },
    )
  }

  /**
   * Отзыв текущей подписки пользователя (смена shortUuid и/или паролей протоколов).
   * По умолчанию (без dto) панель генерирует новый shortUuid и новые пароли/ключи.
   */
  async revokeUserSubscription(
    uuid: string,
    dto?: RevokeUserSubscriptionDto,
  ): Promise<RemnaUser> {
    const user = await this.request<RemnaUser>(
      {
        method: 'POST',
        url: `/api/users/${uuid}/actions/revoke`,
        data: dto ?? {},
      },
      'revokeUserSubscription',
      { uuid },
    )
    await this.cacheInvalidate(this.cacheKey('user', uuid))
    return user
  }

  async disableUser(uuid: string): Promise<RemnaUser> {
    const user = await this.request<RemnaUser>(
      { method: 'POST', url: `/api/users/${uuid}/actions/disable` },
      'disableUser',
      { uuid },
    )
    await this.cacheInvalidate(this.cacheKey('user', uuid))
    return user
  }

  async enableUser(uuid: string): Promise<RemnaUser> {
    const user = await this.request<RemnaUser>(
      { method: 'POST', url: `/api/users/${uuid}/actions/enable` },
      'enableUser',
      { uuid },
    )
    await this.cacheInvalidate(this.cacheKey('user', uuid))
    return user
  }

  async resetUserTraffic(uuid: string): Promise<RemnaUser> {
    const user = await this.request<RemnaUser>(
      { method: 'POST', url: `/api/users/${uuid}/actions/reset-traffic` },
      'resetUserTraffic',
      { uuid },
    )
    await this.cacheInvalidate(this.cacheKey('user', uuid))
    return user
  }

  /** Быстрый резолв пользователя по любому идентификатору (uuid/id/shortUuid/username) без полной сущности */
  async resolveUser(dto: ResolveUserDto): Promise<ResolveUserResult> {
    return this.request<ResolveUserResult>(
      { method: 'POST', url: '/api/users/resolve', data: dto },
      'resolveUser',
      dto,
    )
  }

  // =========================================================================
  // ========================= USERS: BULK ACTIONS ==========================
  // =========================================================================

  async bulkDeleteUsersByStatus(
    dto?: BulkDeleteUsersByStatusDto,
  ): Promise<number> {
    const result = await this.request<RemnaBulkAffectedResult>(
      {
        method: 'POST',
        url: '/api/users/bulk/delete-by-status',
        data: dto ?? {},
      },
      'bulkDeleteUsersByStatus',
      dto,
    )
    return result.affectedRows
  }

  async bulkDeleteUsers(dto: BulkUuidsDto): Promise<number> {
    const result = await this.request<RemnaBulkAffectedResult>(
      { method: 'POST', url: '/api/users/bulk/delete', data: dto },
      'bulkDeleteUsers',
      { count: dto.uuids.length },
    )
    return result.affectedRows
  }

  async bulkRevokeUsersSubscription(dto: BulkUuidsDto): Promise<number> {
    const result = await this.request<RemnaBulkAffectedResult>(
      { method: 'POST', url: '/api/users/bulk/revoke-subscription', data: dto },
      'bulkRevokeUsersSubscription',
      { count: dto.uuids.length },
    )
    return result.affectedRows
  }

  async bulkResetUserTraffic(dto: BulkUuidsDto): Promise<number> {
    const result = await this.request<RemnaBulkAffectedResult>(
      { method: 'POST', url: '/api/users/bulk/reset-traffic', data: dto },
      'bulkResetUserTraffic',
      { count: dto.uuids.length },
    )
    return result.affectedRows
  }

  async bulkUpdateUsers(dto: BulkUpdateUsersDto): Promise<number> {
    const result = await this.request<RemnaBulkAffectedResult>(
      { method: 'POST', url: '/api/users/bulk/update', data: dto },
      'bulkUpdateUsers',
      { count: dto.uuids.length },
    )
    return result.affectedRows
  }

  async bulkUpdateUsersSquads(dto: BulkUpdateUsersSquadsDto): Promise<number> {
    const result = await this.request<RemnaBulkAffectedResult>(
      { method: 'POST', url: '/api/users/bulk/update-squads', data: dto },
      'bulkUpdateUsersSquads',
      { count: dto.uuids.length },
    )
    return result.affectedRows
  }

  async bulkExtendExpirationDate(
    dto: BulkExtendExpirationDateDto,
  ): Promise<number> {
    const result = await this.request<RemnaBulkAffectedResult>(
      {
        method: 'POST',
        url: '/api/users/bulk/extend-expiration-date',
        data: dto,
      },
      'bulkExtendExpirationDate',
      { count: dto.uuids.length, extendDays: dto.extendDays },
    )
    return result.affectedRows
  }

  /** Массовое обновление ВСЕХ пользователей панели — операция асинхронная (событие ставится в очередь) */
  async bulkUpdateAllUsers(dto: BulkAllUpdateUsersDto): Promise<boolean> {
    const result = await this.request<RemnaBulkEventResult>(
      { method: 'POST', url: '/api/users/bulk/all/update', data: dto },
      'bulkUpdateAllUsers',
      dto,
    )
    return result.eventSent
  }

  /** Сброс трафика у ВСЕХ пользователей панели — операция асинхронная */
  async bulkAllResetUserTraffic(): Promise<boolean> {
    const result = await this.request<RemnaBulkEventResult>(
      { method: 'POST', url: '/api/users/bulk/all/reset-traffic' },
      'bulkAllResetUserTraffic',
    )
    return result.eventSent
  }

  /** Продление даты истечения у ВСЕХ пользователей панели — операция асинхронная */
  async bulkAllExtendExpirationDate(
    dto: BulkAllExtendExpirationDateDto,
  ): Promise<boolean> {
    const result = await this.request<RemnaBulkEventResult>(
      {
        method: 'POST',
        url: '/api/users/bulk/all/extend-expiration-date',
        data: dto,
      },
      'bulkAllExtendExpirationDate',
      dto,
    )
    return result.eventSent
  }

  // =========================================================================
  // ========================= SUBSCRIPTIONS (public) =======================
  // =========================================================================
  // Публичные эндпоинты /api/sub/* — то, что реально дергает клиент (Happ/v2ray/etc) по shortUuid.

  async getSubscriptionInfo(shortUuid: string): Promise<RemnaSubscriptionInfo> {
    return this.request<RemnaSubscriptionInfo>(
      { method: 'GET', url: `/api/sub/${shortUuid}/info` },
      'getSubscriptionInfo',
      { shortUuid },
    )
  }

  /** Сырая подписка в дефолтном формате панели (base64/yaml, в зависимости от User-Agent клиента) */
  async getSubscriptionRaw(
    shortUuid: string,
    headers?: Record<string, string>,
  ): Promise<string> {
    return this.requestRaw(
      { method: 'GET', url: `/api/sub/${shortUuid}`, headers },
      'getSubscriptionRaw',
      { shortUuid },
    )
  }

  /** Подписка в формате конкретного клиента (stash/singbox/mihomo/json/v2ray-json/clash) */
  async getSubscriptionByClientType(
    shortUuid: string,
    clientType: RemnaSubscriptionClientType,
    headers?: Record<string, string>,
  ): Promise<string> {
    return this.requestRaw(
      { method: 'GET', url: `/api/sub/${shortUuid}/${clientType}`, headers },
      'getSubscriptionByClientType',
      { shortUuid, clientType },
    )
  }

  // =========================================================================
  // ======================= SUBSCRIPTIONS (admin) ==========================
  // =========================================================================

  async getAllSubscriptions(
    params?: RemnaPaginationParams,
  ): Promise<GetAllSubscriptionsResult> {
    return this.request<GetAllSubscriptionsResult>(
      {
        method: 'GET',
        url: '/api/subscriptions',
        params: this.buildQuery(params),
      },
      'getAllSubscriptions',
      params,
    )
  }

  async getSubscriptionByUsername(
    username: string,
  ): Promise<RemnaSubscriptionInfo> {
    return this.request<RemnaSubscriptionInfo>(
      { method: 'GET', url: `/api/subscriptions/by-username/${username}` },
      'getSubscriptionByUsername',
      { username },
    )
  }

  async getSubscriptionByShortUuid(
    shortUuid: string,
  ): Promise<RemnaSubscriptionInfo> {
    return this.request<RemnaSubscriptionInfo>(
      { method: 'GET', url: `/api/subscriptions/by-short-uuid/${shortUuid}` },
      'getSubscriptionByShortUuid',
      { shortUuid },
    )
  }

  async getSubscriptionByUuid(uuid: string): Promise<RemnaSubscriptionInfo> {
    return this.request<RemnaSubscriptionInfo>(
      { method: 'GET', url: `/api/subscriptions/by-uuid/${uuid}` },
      'getSubscriptionByUuid',
      { uuid },
    )
  }

  async getRawSubscriptionByShortUuid(
    shortUuid: string,
    withDisabledHosts?: boolean,
  ): Promise<RemnaRawSubscription> {
    return this.request<RemnaRawSubscription>(
      {
        method: 'GET',
        url: `/api/subscriptions/by-short-uuid/${shortUuid}/raw`,
        params: this.buildQuery({ withDisabledHosts }),
      },
      'getRawSubscriptionByShortUuid',
      { shortUuid, withDisabledHosts },
    )
  }

  async getSubpageConfigByShortUuid(
    shortUuid: string,
    dto: GetSubpageConfigDto,
  ): Promise<GetSubpageConfigResult> {
    return this.request<GetSubpageConfigResult>(
      {
        method: 'GET',
        url: `/api/subscriptions/subpage-config/${shortUuid}`,
        data: dto,
      },
      'getSubpageConfigByShortUuid',
      { shortUuid },
    )
  }

  async getConnectionKeysByUuid(
    uuid: string,
  ): Promise<GetConnectionKeysResult> {
    return this.request<GetConnectionKeysResult>(
      { method: 'GET', url: `/api/subscriptions/connection-keys/${uuid}` },
      'getConnectionKeysByUuid',
      { uuid },
    )
  }

  // =========================================================================
  // ================================ NODES ==================================
  // =========================================================================

  /** Список всех нод панели (без пагинации — эндпоинт панели её не поддерживает) */
  async getAllNodes(): Promise<RemnaNode[]> {
    return this.request<RemnaNode[]>(
      { method: 'GET', url: '/api/nodes' },
      'getAllNodes',
    )
  }

  // =========================================================================
  // ============================ HWID DEVICES ===============================
  // =========================================================================

  async getAllHwidDevices(
    params?: RemnaPaginationParams,
  ): Promise<GetAllHwidDevicesResult> {
    return this.request<GetAllHwidDevicesResult>(
      {
        method: 'GET',
        url: '/api/hwid/devices',
        params: this.buildQuery(params),
      },
      'getAllHwidDevices',
      params,
    )
  }

  async createUserHwidDevice(
    dto: CreateHwidDeviceDto,
  ): Promise<GetUserHwidDevicesResult> {
    return this.request<GetUserHwidDevicesResult>(
      { method: 'POST', url: '/api/hwid/devices', data: dto },
      'createUserHwidDevice',
      { userUuid: dto.userUuid, hwid: dto.hwid },
    )
  }

  async deleteUserHwidDevice(
    dto: DeleteHwidDeviceDto,
  ): Promise<GetUserHwidDevicesResult> {
    return this.request<GetUserHwidDevicesResult>(
      { method: 'POST', url: '/api/hwid/devices/delete', data: dto },
      'deleteUserHwidDevice',
      dto,
    )
  }

  async deleteAllUserHwidDevices(
    dto: DeleteAllHwidDevicesDto,
  ): Promise<GetUserHwidDevicesResult> {
    return this.request<GetUserHwidDevicesResult>(
      { method: 'POST', url: '/api/hwid/devices/delete-all', data: dto },
      'deleteAllUserHwidDevices',
      dto,
    )
  }

  async getHwidDevicesStats(): Promise<GetHwidDevicesStatsResult> {
    const cacheKey = this.cacheKey('hwid-stats')
    const cached = await this.cacheGet<GetHwidDevicesStatsResult>(cacheKey)
    if (cached) return cached

    const stats = await this.request<GetHwidDevicesStatsResult>(
      { method: 'GET', url: '/api/hwid/devices/stats' },
      'getHwidDevicesStats',
    )

    await this.cacheSet(cacheKey, stats, REMNA_CACHE_TTL_SECONDS.HWID_STATS)
    return stats
  }

  async getTopUsersByHwidDevices(
    params?: RemnaPaginationParams,
  ): Promise<GetTopUsersByHwidDevicesResult> {
    return this.request<GetTopUsersByHwidDevicesResult>(
      {
        method: 'GET',
        url: '/api/hwid/devices/top-users',
        params: this.buildQuery(params),
      },
      'getTopUsersByHwidDevices',
      params,
    )
  }

  async getUserHwidDevices(
    userUuid: string,
  ): Promise<GetUserHwidDevicesResult> {
    return this.request<GetUserHwidDevicesResult>(
      { method: 'GET', url: `/api/hwid/devices/${userUuid}` },
      'getUserHwidDevices',
      { userUuid },
    )
  }

  // =========================================================================
  // ============================= IP CONTROL ================================
  // =========================================================================

  /** Ставит в очередь задачу сбора IP-адресов конкретного пользователя со всех нод. Возвращает jobId для поллинга. */
  async fetchUserIps(uuid: string): Promise<string> {
    const result = await this.request<FetchIpsJobResult>(
      { method: 'POST', url: `/api/ip-control/fetch-ips/${uuid}` },
      'fetchUserIps',
      { uuid },
    )
    return result.jobId
  }

  async getFetchIpsResult(jobId: string): Promise<FetchIpsResult> {
    return this.request<FetchIpsResult>(
      { method: 'GET', url: `/api/ip-control/fetch-ips/result/${jobId}` },
      'getFetchIpsResult',
      { jobId },
    )
  }

  /** Принудительный разрыв соединений по списку пользователей/IP на всех или конкретных нодах */
  async dropConnections(
    dto: DropConnectionsDto,
  ): Promise<DropConnectionsResult> {
    return this.request<DropConnectionsResult>(
      { method: 'POST', url: '/api/ip-control/drop-connections', data: dto },
      'dropConnections',
      dto,
    )
  }

  /** Ставит в очередь задачу сбора IP-адресов всех пользователей конкретной ноды. Возвращает jobId для поллинга. */
  async fetchUsersIps(nodeUuid: string): Promise<string> {
    const result = await this.request<FetchIpsJobResult>(
      { method: 'POST', url: `/api/ip-control/fetch-users-ips/${nodeUuid}` },
      'fetchUsersIps',
      { nodeUuid },
    )
    return result.jobId
  }

  async getFetchUsersIpsResult(jobId: string): Promise<FetchUsersIpsResult> {
    return this.request<FetchUsersIpsResult>(
      { method: 'GET', url: `/api/ip-control/fetch-users-ips/result/${jobId}` },
      'getFetchUsersIpsResult',
      { jobId },
    )
  }

  // =========================================================================
  // ========================= BANDWIDTH STATS (users) =======================
  // =========================================================================

  async getUserUsageLegacy(
    uuid: string,
    params: GetLegacyUserUsageParams,
  ): Promise<RemnaLegacyUserUsageEntry[]> {
    return this.request<RemnaLegacyUserUsageEntry[]>(
      {
        method: 'GET',
        url: `/api/bandwidth-stats/users/${uuid}/legacy`,
        params: this.buildQuery(params),
      },
      'getUserUsageLegacy',
      { uuid, ...params },
    )
  }

  async getUserUsage(
    uuid: string,
    params: GetUserUsageParams,
  ): Promise<GetUserUsageResult> {
    return this.request<GetUserUsageResult>(
      {
        method: 'GET',
        url: `/api/bandwidth-stats/users/${uuid}`,
        params: this.buildQuery(params),
      },
      'getUserUsage',
      { uuid, ...params },
    )
  }
}
