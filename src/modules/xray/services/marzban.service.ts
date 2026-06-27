import { Injectable } from '@nestjs/common'
import axios, { AxiosError, AxiosInstance, AxiosResponse } from 'axios'
import axiosRetry from 'axios-retry'
import { PinoLogger } from 'nestjs-pino'
import {
  Admin,
  AdminCreate,
  AdminModify,
  ApiVersionResponse,
  CoreConfig,
  CoreStats,
  HostsResponse,
  InboundsResponse,
  NodeCreate,
  NodeModify,
  NodeResponse,
  NodeSettings,
  NodesUsageResponse,
  ServerSettings,
  SubscriptionUserResponse,
  SystemStats,
  Token,
  UserBulkCreate,
  UserBulkResponse,
  UserCreate,
  UserModify,
  UserResponse,
  UsersResponse,
  UsersUsagesResponse,
  UserUsagesResponse,
} from '../types/marzban.types'
import { XrayConfigFromatType } from '../types/xray-config-format.type'

@Injectable()
export class MarzbanService {
  private client: AxiosInstance
  private token: string | null = null
  private readonly serviceName = 'MarzbanService'

  // ─── dev-mode guard ────────────────────────────────────────────────────────
  // Возвращает true и кастует к нужному типу, чтобы не ломать типы вызывающего кода.
  // Использование: if (this.devSkip()) return this.devSkip<T>()
  private get isDev(): boolean {
    return process.env.NODE_ENV === 'development'
  }

  private devReturn<T>(value: T = {} as T): T {
    return value
  }

  constructor(
    private readonly baseURL: string,
    private readonly username: string,
    private readonly password: string,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.serviceName)
    this.logger.info({
      msg: `Инициализация MarzbanService для ${baseURL}`,
      service: this.serviceName,
    })

    this.client = axios.create({
      baseURL,
      timeout: 15_000, // 15 сек — запросы не будут висеть вечно
      headers: { 'Content-Type': 'application/json' },
    })

    axiosRetry(this.client, {
      retries: 3,
      retryDelay: axiosRetry.exponentialDelay,
      // Не ретраить клиентские ошибки (4xx), только сетевые и 5xx
      retryCondition: (error) =>
        axiosRetry.isNetworkError(error) || axiosRetry.isRetryableError(error),
      onRetry: (retryCount, error, requestConfig) => {
        this.logger.warn({
          msg: `Retry #${retryCount}: ${requestConfig.method?.toUpperCase()} ${
            requestConfig.url
          } — ${error.message}`,
          service: this.serviceName,
        })
      },
    })

    // ── Request interceptor: добавляем токен ──────────────────────────────
    this.client.interceptors.request.use(
      async (config) => {
        this.logger.debug({
          msg: `→ ${config.method?.toUpperCase()} ${config.url}`,
          service: this.serviceName,
        })

        if (!this.token) {
          await this.authenticate()
        }

        if (this.token) {
          config.headers.Authorization = `Bearer ${this.token}`
        }

        return config
      },
      (error) => {
        this.logger.error({
          msg: `Ошибка при подготовке запроса: ${error.message}`,
          error,
          service: this.serviceName,
        })
        return Promise.reject(error)
      },
    )

    // ── Response interceptor: логирование + авторетрай на 401 ────────────
    this.client.interceptors.response.use(
      (response) => {
        this.logger.debug({
          msg: `← ${response.status} ${response.config.method?.toUpperCase()} ${
            response.config.url
          }`,
          service: this.serviceName,
        })
        return response
      },
      async (error: AxiosError) => {
        if (!error.response) {
          // Сетевая ошибка — нет HTTP-ответа
          this.logger.error({
            msg: `Сетевая ошибка: ${error.message}`,
            url: error.config?.url,
            service: this.serviceName,
          })
          return Promise.reject(error)
        }

        const { status, config: reqConfig } = error.response

        // 401 — пробуем переаутентифицироваться (логируем warn, не error)
        if (status === 401 && reqConfig?.url !== '/api/admin/token') {
          this.logger.warn({
            msg: `401 на ${reqConfig?.method?.toUpperCase()} ${
              reqConfig?.url
            }, переаутентификация`,
            service: this.serviceName,
          })
          this.token = null

          try {
            await this.authenticate()
            const retryConfig = {
              ...reqConfig,
              headers: {
                ...reqConfig?.headers,
                Authorization: `Bearer ${this.token}`,
              },
            }
            this.logger.debug({
              msg: `Повторный запрос после реаутентификации: ${retryConfig.method?.toUpperCase()} ${
                retryConfig.url
              }`,
              service: this.serviceName,
            })
            return axios(retryConfig)
          } catch (authError) {
            this.logger.error({
              msg: 'Не удалось переаутентифицироваться',
              error: authError,
              service: this.serviceName,
            })
            return Promise.reject(authError)
          }
        }

        // Все остальные HTTP-ошибки логируем здесь один раз
        this.logger.error({
          msg: `← ${status} ${reqConfig?.method?.toUpperCase()} ${
            reqConfig?.url
          }`,
          responseData: error.response.data,
          service: this.serviceName,
        })

        return Promise.reject(error)
      },
    )
  }

  // ─── Аутентификация ────────────────────────────────────────────────────────

  private async authenticate(): Promise<void> {
    this.logger.info({
      msg: `Аутентификация в Marzban: ${this.baseURL}`,
      service: this.serviceName,
    })

    try {
      const response = await axios.post<Token>(
        `${this.baseURL}/api/admin/token`,
        new URLSearchParams({
          username: this.username,
          password: this.password,
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      )
      this.token = response.data.access_token
      this.logger.info({ msg: 'Токен получен', service: this.serviceName })
    } catch (error) {
      const axiosError = error as AxiosError
      this.logger.error({
        msg: `Ошибка аутентификации: ${axiosError.message}`,
        status: axiosError.response?.status,
        error: axiosError.response?.data ?? axiosError.message,
        service: this.serviceName,
      })
      throw new Error('Не удалось аутентифицироваться в Marzban API')
    }
  }

  // ─── Обёртка для вызовов API с таймингом ──────────────────────────────────
  // Логируем только время выполнения (debug). Ошибки — в response interceptor.

  private async call<T>(
    method: string,
    fn: () => Promise<AxiosResponse<T>>,
  ): Promise<AxiosResponse<T>> {
    this.logger.debug({ msg: `call: ${method}`, service: this.serviceName })
    const t = Date.now()
    const response = await fn()
    this.logger.debug({
      msg: `call: ${method} — ${Date.now() - t}ms`,
      service: this.serviceName,
    })
    return response
  }

  // ─── Admin ─────────────────────────────────────────────────────────────────

  async getCurrentAdmin(): Promise<Admin> {
    const res = await this.call('getCurrentAdmin', () =>
      this.client.get<Admin>('/api/admin'),
    )
    return res.data
  }

  async getAdmins(): Promise<Admin[]> {
    const res = await this.call('getAdmins', () =>
      this.client.get<Admin[]>('/api/admins'),
    )
    return res.data
  }

  async createAdmin(adminData: AdminCreate): Promise<Admin> {
    this.logger.info({
      msg: `Создание администратора: ${adminData.username}`,
      service: this.serviceName,
    })
    const res = await this.call('createAdmin', () =>
      this.client.post<Admin>('/api/admin', adminData),
    )
    return res.data
  }

  async modifyAdmin(username: string, adminData: AdminModify): Promise<Admin> {
    this.logger.info({
      msg: `Изменение администратора: ${username}`,
      service: this.serviceName,
    })
    const res = await this.call('modifyAdmin', () =>
      this.client.put<Admin>(`/api/admin/${username}`, adminData),
    )
    return res.data
  }

  /**
   * Удаляет администратора. 404 считается успехом (идемпотентно).
   */
  async removeAdmin(username: string): Promise<boolean> {
    if (this.isDev) return true

    this.logger.info({
      msg: `Удаление администратора: ${username}`,
      service: this.serviceName,
    })

    try {
      await this.client.delete(`/api/admin/${username}`)
      this.logger.info({
        msg: `Администратор ${username} удалён`,
        service: this.serviceName,
      })
      return true
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        this.logger.warn({
          msg: `Администратор ${username} не найден — считается удалённым`,
          service: this.serviceName,
        })
        return true
      }
      // Ошибка уже залогирована в response interceptor
      return false
    }
  }

  // ─── Users ─────────────────────────────────────────────────────────────────

  async getUsers(params?: {
    offset?: number
    limit?: number
    username?: string[]
    search?: string
    status?: string
    sort?: string
  }): Promise<UsersResponse> {
    const res = await this.call('getUsers', () =>
      this.client.get<UsersResponse>('/api/users', { params }),
    )
    return res.data
  }

  async addUser(userData: UserCreate): Promise<UserResponse> {
    this.logger.info({
      msg: `Добавление пользователя: ${userData.username}`,
      service: this.serviceName,
    })
    const res = await this.call('addUser', () =>
      this.client.post<UserResponse>('/api/user', userData),
    )
    return res.data
  }

  async getUser(username: string): Promise<UserResponse | null> {
    try {
      const res = await this.call('getUser', () =>
        this.client.get<UserResponse>(`/api/user/${username}`),
      )
      return res.data
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null
      }
      throw error
    }
  }

  async modifyUser(
    username: string,
    userData: UserModify,
  ): Promise<UserResponse> {
    if (this.isDev) return this.devReturn<UserResponse>()
    this.logger.info({
      msg: `Изменение пользователя: ${username}`,
      service: this.serviceName,
    })
    const res = await this.call('modifyUser', () =>
      this.client.put<UserResponse>(`/api/user/${username}`, userData),
    )
    return res.data
  }

  /**
   * Удаляет пользователя. 200 и 404 считаются успехом.
   */
  async removeUser(username: string): Promise<boolean> {
    if (this.isDev) return true

    this.logger.info({
      msg: `Удаление пользователя ${username} из Marzban`,
      service: this.serviceName,
    })

    try {
      await this.client.delete(`/api/user/${username}`)
      this.logger.info({
        msg: `Пользователь ${username} удалён из Marzban`,
        service: this.serviceName,
      })
      return true
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        this.logger.warn({
          msg: `Пользователь ${username} не найден в Marzban — считается удалённым`,
          service: this.serviceName,
        })
        return true
      }
      // Ошибка уже залогирована в response interceptor
      return false
    }
  }

  async resetUserUsage(username: string): Promise<void> {
    if (this.isDev) return
    this.logger.info({
      msg: `Сброс трафика пользователя: ${username}`,
      service: this.serviceName,
    })
    await this.call('resetUserUsage', () =>
      this.client.post(`/api/user/${username}/reset`),
    )
  }

  // FIX: правильный тип возврата — UserUsagesResponse, не UserUsageResponse
  async getUserUsage(
    username: string,
    start?: string,
    end?: string,
  ): Promise<UserUsagesResponse> {
    const res = await this.call('getUserUsage', () =>
      this.client.get<UserUsagesResponse>(`/api/user/${username}/usage`, {
        params: { start, end },
      }),
    )
    return res.data
  }

  async getUserSubscription(
    username: string,
  ): Promise<SubscriptionUserResponse> {
    const res = await this.call('getUserSubscription', () =>
      this.client.get<SubscriptionUserResponse>(
        `/api/user/${username}/subscription`,
      ),
    )
    return res.data
  }

  async bulkCreateUsers(usersData: UserBulkCreate): Promise<UserBulkResponse> {
    this.logger.info({
      msg: `Массовое создание: ${usersData.users.length} пользователей`,
      service: this.serviceName,
    })
    const res = await this.call('bulkCreateUsers', () =>
      this.client.post<UserBulkResponse>('/api/user/bulk', usersData),
    )
    return res.data
  }

  async getUsersUsages(
    start?: string,
    end?: string,
  ): Promise<UsersUsagesResponse> {
    const res = await this.call('getUsersUsages', () =>
      this.client.get<UsersUsagesResponse>('/api/users/usage', {
        params: { start, end },
      }),
    )
    return res.data
  }

  async getExpiredUsers(
    expiredAfter?: string,
    expiredBefore?: string,
  ): Promise<string[]> {
    const res = await this.call('getExpiredUsers', () =>
      this.client.get<string[]>('/api/users/expired', {
        params: { expired_after: expiredAfter, expired_before: expiredBefore },
      }),
    )
    return res.data
  }

  async deleteExpiredUsers(
    expiredAfter?: string,
    expiredBefore?: string,
  ): Promise<string[]> {
    if (this.isDev) return []
    const res = await this.call('deleteExpiredUsers', () =>
      this.client.delete<string[]>('/api/users/expired', {
        params: { expired_after: expiredAfter, expired_before: expiredBefore },
      }),
    )
    return res.data
  }

  async deactivateUser(username: string): Promise<UserResponse> {
    if (this.isDev) return this.devReturn<UserResponse>()
    this.logger.info({
      msg: `Деактивация пользователя: ${username}`,
      service: this.serviceName,
    })
    return this.modifyUser(username, { status: 'disabled' })
  }

  async revokeSubscription(username: string): Promise<UserResponse> {
    if (this.isDev) return this.devReturn<UserResponse>()
    this.logger.info({
      msg: `Отзыв подписки: ${username}`,
      service: this.serviceName,
    })
    const res = await this.call('revokeSubscription', () =>
      this.client.post<UserResponse>(`/api/user/${username}/revoke_sub`),
    )
    return res.data
  }

  // FIX: по OpenAPI это query param, не тело запроса
  async setOwner(
    username: string,
    adminUsername: string,
  ): Promise<UserResponse> {
    this.logger.info({
      msg: `Смена владельца ${username} → ${adminUsername}`,
      service: this.serviceName,
    })
    const res = await this.call('setOwner', () =>
      this.client.put<UserResponse>(`/api/user/${username}/set-owner`, null, {
        params: { admin_username: adminUsername },
      }),
    )
    return res.data
  }

  // ─── Subscription ──────────────────────────────────────────────────────────

  async getSubscriptionConfig(
    token: string,
    format: XrayConfigFromatType,
    userAgent: string,
  ): Promise<AxiosResponse> {
    const cleanToken = token.trim().replace(/[`"'\s]+/g, '')
    if (cleanToken !== token) {
      this.logger.warn({
        msg: `Token sanitized: '${token}' → '${cleanToken}'`,
        service: this.serviceName,
      })
    }
    return this.call('getSubscriptionConfig', () =>
      this.client.get(`/sub/${cleanToken}/${format}`, {
        headers: { 'User-Agent': userAgent },
      }),
    )
  }

  // ─── System ────────────────────────────────────────────────────────────────

  async getSystemStats(): Promise<SystemStats> {
    const res = await this.call('getSystemStats', () =>
      this.client.get<SystemStats>('/api/system'),
    )
    return res.data
  }

  async getCoreStats(): Promise<CoreStats> {
    const res = await this.call('getCoreStats', () =>
      this.client.get<CoreStats>('/api/core'),
    )
    return res.data
  }

  async getCoreConfig(): Promise<CoreConfig> {
    const res = await this.call('getCoreConfig', () =>
      this.client.get<CoreConfig>('/api/core/config'),
    )
    return res.data
  }

  async restartCore(): Promise<void> {
    await this.call('restartCore', () => this.client.post('/api/core/restart'))
  }

  async getApiVersion(): Promise<ApiVersionResponse> {
    const res = await this.call('getApiVersion', () =>
      this.client.get<ApiVersionResponse>('/api/version'),
    )
    return res.data
  }

  async getServerSettings(): Promise<ServerSettings> {
    const res = await this.call('getServerSettings', () =>
      this.client.get<ServerSettings>('/api/setting'),
    )
    return res.data
  }

  async updateServerSettings(
    settings: ServerSettings,
  ): Promise<ServerSettings> {
    if (this.isDev) return this.devReturn<ServerSettings>()
    this.logger.info({
      msg: 'Обновление настроек сервера',
      service: this.serviceName,
    })
    const res = await this.call('updateServerSettings', () =>
      this.client.put<ServerSettings>('/api/setting', settings),
    )
    return res.data
  }

  async getInbounds(): Promise<InboundsResponse> {
    const res = await this.call('getInbounds', () =>
      this.client.get<InboundsResponse>('/api/inbounds'),
    )
    return res.data
  }

  async getHosts(): Promise<HostsResponse> {
    const res = await this.call('getHosts', () =>
      this.client.get<HostsResponse>('/api/hosts'),
    )
    return res.data
  }

  // ─── Nodes ─────────────────────────────────────────────────────────────────

  async getNodes(): Promise<NodeResponse[]> {
    const res = await this.call('getNodes', () =>
      this.client.get<NodeResponse[]>('/api/nodes'),
    )
    return res.data
  }

  async addNode(nodeData: NodeCreate): Promise<NodeResponse> {
    this.logger.info({
      msg: `Добавление ноды: ${nodeData.name}`,
      service: this.serviceName,
    })
    const res = await this.call('addNode', () =>
      this.client.post<NodeResponse>('/api/node', nodeData),
    )
    return res.data
  }

  async modifyNode(id: number, nodeData: NodeModify): Promise<NodeResponse> {
    if (this.isDev) return this.devReturn<NodeResponse>()
    this.logger.info({
      msg: `Изменение ноды #${id}`,
      service: this.serviceName,
    })
    const res = await this.call('modifyNode', () =>
      this.client.put<NodeResponse>(`/api/node/${id}`, nodeData),
    )
    return res.data
  }

  /**
   * Удаляет ноду. 404 считается успехом (идемпотентно).
   */
  async removeNode(id: number): Promise<boolean> {
    if (this.isDev) return true

    this.logger.info({ msg: `Удаление ноды #${id}`, service: this.serviceName })

    try {
      await this.client.delete(`/api/node/${id}`)
      this.logger.info({
        msg: `Нода #${id} удалена`,
        service: this.serviceName,
      })
      return true
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        this.logger.warn({
          msg: `Нода #${id} не найдена — считается удалённой`,
          service: this.serviceName,
        })
        return true
      }
      return false
    }
  }

  async getNodesUsage(
    start?: string,
    end?: string,
  ): Promise<NodesUsageResponse> {
    const res = await this.call('getNodesUsage', () =>
      this.client.get<NodesUsageResponse>('/api/nodes/usage', {
        params: { start, end },
      }),
    )
    return res.data
  }

  // FIX: по OpenAPI это GET /api/node/settings без id
  async getNodeSettings(): Promise<NodeSettings> {
    const res = await this.call('getNodeSettings', () =>
      this.client.get<NodeSettings>('/api/node/settings'),
    )
    return res.data
  }
}
