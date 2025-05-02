import { Injectable } from '@nestjs/common'
import axios, { AxiosError, AxiosInstance, AxiosResponse } from 'axios'
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
  SetOwnerRequest,
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
  UserUsageResponse,
  UserUsagesResponse,
} from '../types/marzban.types'

@Injectable()
export class MarzbanService {
  private client: AxiosInstance
  private token: string | null = null
  private readonly serviceName = 'MarzbanService'

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
      headers: {
        'Content-Type': 'application/json',
      },
    })

    // Добавляем интерцептор для автоматического добавления токена
    this.client.interceptors.request.use(
      async (config) => {
        this.logger.debug({
          msg: `Отправка запроса: ${config.method?.toUpperCase()} ${
            config.url
          }`,
          service: this.serviceName,
        })

        // Если токен отсутствует или истек, получаем новый
        if (!this.token) {
          this.logger.info({
            msg: 'Токен отсутствует, выполняем аутентификацию',
            service: this.serviceName,
          })
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
          stack: error instanceof Error ? error.stack : undefined,
          service: this.serviceName,
        })
        return Promise.reject(error)
      },
    )

    // Добавляем интерцептор для обработки ответов
    this.client.interceptors.response.use(
      (response) => {
        this.logger.debug({
          msg: `Получен ответ: ${
            response.status
          } ${response.config.method?.toUpperCase()} ${response.config.url}`,
          service: this.serviceName,
        })
        return response
      },
      async (error: AxiosError) => {
        if (error.response) {
          this.logger.error({
            msg: `Ошибка API: ${
              error.response.status
            } ${error.config?.method?.toUpperCase()} ${error.config?.url}`,
            error: error.response.data,
            service: this.serviceName,
          })

          // Если ошибка 401 (Unauthorized), пробуем переаутентифицироваться
          if (error.response.status === 401) {
            this.logger.warn({
              msg: 'Получена ошибка 401, пробуем переаутентифицироваться',
              service: this.serviceName,
            })
            this.token = null

            // Если это не запрос на аутентификацию, пробуем повторить запрос
            if (error.config?.url !== '/api/admin/token') {
              try {
                await this.authenticate()

                // Создаем новый запрос без интерцепторов, чтобы избежать бесконечного цикла
                const newConfig = { ...error.config }
                if (this.token) {
                  // @ts-ignore
                  newConfig.headers = {
                    ...newConfig.headers,
                    Authorization: `Bearer ${this.token}`,
                  }
                }

                this.logger.info({
                  msg: `Повторная отправка запроса после переаутентификации: ${newConfig.method?.toUpperCase()} ${
                    newConfig.url
                  }`,
                  service: this.serviceName,
                })
                return axios(newConfig)
              } catch (authError) {
                this.logger.error({
                  msg: 'Не удалось переаутентифицироваться',
                  error: authError,
                  stack:
                    authError instanceof Error ? authError.stack : undefined,
                  service: this.serviceName,
                })
                return Promise.reject(authError)
              }
            }
          }
        } else if (error.request) {
          this.logger.error({
            msg: `Ошибка сети: запрос отправлен, но ответ не получен`,
            error: error.message,
            stack: error instanceof Error ? error.stack : undefined,
            service: this.serviceName,
          })
        } else {
          this.logger.error({
            msg: `Ошибка при настройке запроса: ${error.message}`,
            error,
            stack: error instanceof Error ? error.stack : undefined,
            service: this.serviceName,
          })
        }

        return Promise.reject(error)
      },
    )
  }

  /**
   * Аутентификация в API Marzban
   */
  private async authenticate(): Promise<void> {
    try {
      this.logger.info({
        msg: `Выполняем аутентификацию в Marzban API: ${this.baseURL}`,
        service: this.serviceName,
      })

      const response = await axios.post<Token>(
        `${this.baseURL}/api/admin/token`,
        new URLSearchParams({
          username: this.username,
          password: this.password,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      )

      this.token = response.data.access_token
      this.logger.info({
        msg: 'Аутентификация успешна, токен получен',
        service: this.serviceName,
      })
    } catch (error) {
      const axiosError = error as AxiosError
      this.logger.error({
        msg: `Ошибка аутентификации в Marzban: ${axiosError.message}`,
        error,
        stack: error instanceof Error ? error.stack : undefined,
        service: this.serviceName,
      })

      if (axiosError.response) {
        this.logger.error({
          msg: `Статус ошибки: ${axiosError.response.status}`,
          error: axiosError.response.data,
          service: this.serviceName,
        })
      } else if (axiosError.request) {
        this.logger.error({
          msg: 'Ошибка сети: запрос отправлен, но ответ не получен',
          service: this.serviceName,
        })
      }

      throw new Error('Не удалось аутентифицироваться в Marzban API')
    }
  }

  /**
   * Обертка для логирования запросов API
   * @param method Название метода API
   * @param apiCall Функция вызова API
   * @returns Результат вызова API
   */
  private async logApiCall<T>(
    method: string,
    apiCall: () => Promise<AxiosResponse<T>>,
  ): Promise<AxiosResponse<T>> {
    try {
      this.logger.debug({
        msg: `Вызов метода API: ${method}`,
        service: this.serviceName,
      })
      const startTime = Date.now()
      const response = await apiCall()
      const duration = Date.now() - startTime

      this.logger.debug({
        msg: `Успешный ответ от ${method}: статус ${response.status}`,
        duration: `${duration}ms`,
        service: this.serviceName,
      })
      return response
    } catch (error) {
      const axiosError = error as AxiosError
      this.logger.error({
        msg: `Ошибка при вызове ${method}: ${axiosError.message}`,
        error,
        stack: error instanceof Error ? error.stack : undefined,
        service: this.serviceName,
      })
      throw error
    }
  }

  /**
   * Получение информации о текущем администраторе
   */
  async getCurrentAdmin(): Promise<Admin> {
    const response = await this.logApiCall('getCurrentAdmin', () =>
      this.client.get<Admin>('/api/admin'),
    )
    return response.data
  }

  /**
   * Получение списка администраторов
   */
  async getAdmins(): Promise<Admin[]> {
    const response = await this.logApiCall('getAdmins', () =>
      this.client.get<Admin[]>('/api/admin/list'),
    )
    return response.data
  }

  /**
   * Создание нового администратора
   */
  async createAdmin(adminData: AdminCreate): Promise<Admin> {
    this.logger.info({
      msg: `Создание нового администратора: ${adminData.username}`,
      service: this.serviceName,
    })
    const response = await this.logApiCall('createAdmin', () =>
      this.client.post<Admin>('/api/admin', adminData),
    )
    return response.data
  }

  /**
   * Изменение данных администратора
   */
  async modifyAdmin(username: string, adminData: AdminModify): Promise<Admin> {
    this.logger.info({
      msg: `Изменение данных администратора: ${username}`,
      service: this.serviceName,
    })
    const response = await this.logApiCall('modifyAdmin', () =>
      this.client.put<Admin>(`/api/admin/${username}`, adminData),
    )
    return response.data
  }

  /**
   * Удаление администратора
   */
  async removeAdmin(username: string): Promise<void> {
    this.logger.info({
      msg: `Удаление администратора: ${username}`,
      service: this.serviceName,
    })
    await this.logApiCall('removeAdmin', () =>
      this.client.delete(`/api/admin/${username}`),
    )
  }

  /**
   * Получение списка пользователей
   */
  async getUsers(): Promise<UsersResponse> {
    const response = await this.logApiCall('getUsers', () =>
      this.client.get<UsersResponse>('/api/user'),
    )
    return response.data
  }

  /**
   * Добавление нового пользователя
   */
  async addUser(userData: UserCreate): Promise<UserResponse> {
    this.logger.info({
      msg: `Добавление нового пользователя: ${userData.username}`,
      service: this.serviceName,
    })
    const response = await this.logApiCall('addUser', () =>
      this.client.post<UserResponse>('/api/user', userData),
    )
    return response.data
  }

  /**
   * Получение информации о пользователе
   */
  async getUser(username: string): Promise<UserResponse> {
    const response = await this.logApiCall('getUser', () =>
      this.client.get<UserResponse>(`/api/user/${username}`),
    )
    return response.data
  }

  /**
   * Изменение данных пользователя
   */
  async modifyUser(
    username: string,
    userData: UserModify,
  ): Promise<UserResponse> {
    this.logger.info({
      msg: `Изменение данных пользователя: ${username}`,
      service: this.serviceName,
    })
    const response = await this.logApiCall('modifyUser', () =>
      this.client.put<UserResponse>(`/api/user/${username}`, userData),
    )
    return response.data
  }

  /**
   * Удаление пользователя
   */
  async removeUser(username: string): Promise<void> {
    this.logger.info({
      msg: `Удаление пользователя: ${username}`,
      service: this.serviceName,
    })
    await this.logApiCall('removeUser', () =>
      this.client.delete(`/api/user/${username}`),
    )
  }

  /**
   * Получение статистики использования пользователя
   */
  async getUserUsage(username: string): Promise<UserUsageResponse> {
    const response = await this.logApiCall('getUserUsage', () =>
      this.client.get<UserUsageResponse>(`/api/user/${username}/usage`),
    )
    return response.data
  }

  /**
   * Получение истории использования пользователя
   */
  async getUserUsages(username: string): Promise<UserUsagesResponse> {
    const response = await this.logApiCall('getUserUsages', () =>
      this.client.get<UserUsagesResponse>(`/api/user/${username}/usages`),
    )
    return response.data
  }

  /**
   * Сброс статистики использования пользователя
   */
  async resetUserUsage(username: string): Promise<void> {
    this.logger.info({
      msg: `Сброс статистики использования пользователя: ${username}`,
      service: this.serviceName,
    })
    await this.logApiCall('resetUserUsage', () =>
      this.client.post(`/api/user/${username}/reset`),
    )
  }

  /**
   * Получение ссылки на подписку пользователя
   */
  async getUserSubscription(
    username: string,
  ): Promise<SubscriptionUserResponse> {
    const response = await this.logApiCall('getUserSubscription', () =>
      this.client.get<SubscriptionUserResponse>(
        `/api/user/${username}/subscription`,
      ),
    )
    return response.data
  }

  /**
   * Массовое создание пользователей
   */
  async bulkCreateUsers(usersData: UserBulkCreate): Promise<UserBulkResponse> {
    this.logger.info({
      msg: `Массовое создание пользователей: ${usersData.users.length} пользователей`,
      service: this.serviceName,
    })
    const response = await this.logApiCall('bulkCreateUsers', () =>
      this.client.post<UserBulkResponse>('/api/user/bulk', usersData),
    )
    return response.data
  }

  /**
   * Получение статистики использования всех пользователей
   */
  async getUsersUsages(): Promise<UsersUsagesResponse> {
    const response = await this.logApiCall('getUsersUsages', () =>
      this.client.get<UsersUsagesResponse>('/api/user/usages'),
    )
    return response.data
  }

  /**
   * Получение статистики системы
   */
  async getSystemStats(): Promise<SystemStats> {
    const response = await this.logApiCall('getSystemStats', () =>
      this.client.get<SystemStats>('/api/system'),
    )
    return response.data
  }

  /**
   * Получение статистики ядра
   */
  async getCoreStats(): Promise<CoreStats> {
    const response = await this.logApiCall('getCoreStats', () =>
      this.client.get<CoreStats>('/api/core/stats'),
    )
    return response.data
  }

  /**
   * Получение конфигурации ядра
   */
  async getCoreConfig(): Promise<CoreConfig> {
    const response = await this.logApiCall('getCoreConfig', () =>
      this.client.get<CoreConfig>('/api/core/config'),
    )
    return response.data
  }

  /**
   * Получение списка входящих соединений
   */
  async getInbounds(): Promise<InboundsResponse> {
    const response = await this.logApiCall('getInbounds', () =>
      this.client.get<InboundsResponse>('/api/inbound'),
    )
    return response.data
  }

  /**
   * Получение версии API
   */
  async getApiVersion(): Promise<ApiVersionResponse> {
    const response = await this.logApiCall('getApiVersion', () =>
      this.client.get<ApiVersionResponse>('/api/version'),
    )
    return response.data
  }

  /**
   * Получение настроек сервера
   */
  async getServerSettings(): Promise<ServerSettings> {
    const response = await this.logApiCall('getServerSettings', () =>
      this.client.get<ServerSettings>('/api/setting'),
    )
    return response.data
  }

  /**
   * Обновление настроек сервера
   */
  async updateServerSettings(
    settings: ServerSettings,
  ): Promise<ServerSettings> {
    this.logger.info({
      msg: `Обновление настроек сервера`,
      service: this.serviceName,
    })
    const response = await this.logApiCall('updateServerSettings', () =>
      this.client.put<ServerSettings>('/api/setting', settings),
    )
    return response.data
  }

  /**
   * Получение списка хостов
   */
  async getHosts(): Promise<HostsResponse> {
    const response = await this.logApiCall('getHosts', () =>
      this.client.get<HostsResponse>('/api/host'),
    )
    return response.data
  }

  /**
   * Получение списка нод
   */
  async getNodes(): Promise<NodeResponse[]> {
    const response = await this.logApiCall('getNodes', () =>
      this.client.get<NodeResponse[]>('/api/node'),
    )
    return response.data
  }

  /**
   * Добавление новой ноды
   */
  async addNode(nodeData: NodeCreate): Promise<NodeResponse> {
    this.logger.info({
      msg: `Добавление новой ноды: ${nodeData.name}`,
      service: this.serviceName,
    })
    const response = await this.logApiCall('addNode', () =>
      this.client.post<NodeResponse>('/api/node', nodeData),
    )
    return response.data
  }

  /**
   * Изменение данных ноды
   */
  async modifyNode(id: number, nodeData: NodeModify): Promise<NodeResponse> {
    this.logger.info({
      msg: `Изменение данных ноды с ID: ${id}`,
      service: this.serviceName,
    })
    const response = await this.logApiCall('modifyNode', () =>
      this.client.put<NodeResponse>(`/api/node/${id}`, nodeData),
    )
    return response.data
  }

  /**
   * Удаление ноды
   */
  async removeNode(id: number): Promise<void> {
    this.logger.info({
      msg: `Удаление ноды с ID: ${id}`,
      service: this.serviceName,
    })
    await this.logApiCall('removeNode', () =>
      this.client.delete(`/api/node/${id}`),
    )
  }

  /**
   * Получение статистики использования нод
   */
  async getNodesUsage(): Promise<NodesUsageResponse> {
    const response = await this.logApiCall('getNodesUsage', () =>
      this.client.get<NodesUsageResponse>('/api/node/usage'),
    )
    return response.data
  }

  /**
   * Получение настроек ноды
   */
  async getNodeSettings(id: number): Promise<NodeSettings> {
    const response = await this.logApiCall('getNodeSettings', () =>
      this.client.get<NodeSettings>(`/api/node/${id}/settings`),
    )
    return response.data
  }

  /**
   * Установка владельца для пользователя
   */
  async setOwner(username: string, ownerData: SetOwnerRequest): Promise<void> {
    this.logger.info({
      msg: `Установка владельца для пользователя: ${username}`,
      service: this.serviceName,
    })
    await this.logApiCall('setOwner', () =>
      this.client.put(`/api/user/${username}/owner`, ownerData),
    )
  }
}
