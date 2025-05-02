import axios, { AxiosInstance, AxiosResponse } from 'axios';
import {
  Admin,
  AdminCreate,
  AdminModify,
  ApiVersionResponse,
  CoreConfig,
  CoreStats,
  HostsResponse,
  HTTPValidationError,
  InboundsResponse,
  NodeCreate,
  NodeModify,
  NodeResponse,
  NodesUsageResponse,
  NodeSettings,
  ServerSettings,
  SetOwnerRequest,
  SubscriptionUserResponse,
  SystemStats,
  Token,
  UserBulkCreate,
  UserBulkResponse,
  UserCreate,
  UserFromTemplateCreate,
  UserModify,
  UserResponse,
  UsersResponse,
  UsersUsagesResponse,
  UserTemplateCreate,
  UserTemplateModify,
  UserTemplateResponse,
  UserUsageResponse,
  UserUsagesResponse,
} from '../types/marzban.types';

export class MarzbanService {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor(
    private readonly baseURL: string,
    private readonly username: string,
    private readonly password: string,
  ) {
    this.client = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Добавляем интерцептор для автоматического добавления токена
    this.client.interceptors.request.use(async (config) => {
      // Если токен отсутствует или истек, получаем новый
      if (!this.token) {
        await this.authenticate();
      }

      if (this.token) {
        config.headers.Authorization = `Bearer ${this.token}`;
      }

      return config;
    });
  }

  /**
   * Аутентификация в API Marzban
   */
  private async authenticate(): Promise<void> {
    try {
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
      );

      this.token = response.data.access_token;
    } catch (error) {
      console.error('Ошибка аутентификации в Marzban:', error);
      throw new Error('Не удалось аутентифицироваться в Marzban API');
    }
  }

  /**
   * Получение информации о текущем администраторе
   */
  async getCurrentAdmin(): Promise<AxiosResponse<Admin>> {
    return this.client.get<Admin>('/api/admin');
  }

  /**
   * Создание нового администратора
   */
  async createAdmin(adminData: AdminCreate): Promise<AxiosResponse<Admin>> {
    return this.client.post<Admin>('/api/admin', adminData);
  }

  /**
   * Изменение данных администратора
   */
  async modifyAdmin(username: string, adminData: AdminModify): Promise<AxiosResponse<Admin>> {
    return this.client.put<Admin>(`/api/admin/${username}`, adminData);
  }

  /**
   * Удаление администратора
   */
  async removeAdmin(username: string): Promise<AxiosResponse<void>> {
    return this.client.delete(`/api/admin/${username}`);
  }

  /**
   * Получение списка администраторов
   */
  async getAdmins(offset?: number, limit?: number, username?: string): Promise<AxiosResponse<Admin[]>> {
    const params = new URLSearchParams();
    if (offset !== undefined) params.append('offset', offset.toString());
    if (limit !== undefined) params.append('limit', limit.toString());
    if (username) params.append('username', username);

    return this.client.get<Admin[]>('/api/admins', { params });
  }

  /**
   * Получение статистики ядра
   */
  async getCoreStats(): Promise<AxiosResponse<CoreStats>> {
    return this.client.get<CoreStats>('/api/core');
  }

  /**
   * Перезапуск ядра
   */
  async restartCore(): Promise<AxiosResponse<void>> {
    return this.client.post('/api/core/restart');
  }

  /**
   * Получение конфигурации ядра
   */
  async getCoreConfig(): Promise<AxiosResponse<CoreConfig>> {
    return this.client.get<CoreConfig>('/api/core/config');
  }

  /**
   * Изменение конфигурации ядра
   */
  async modifyCoreConfig(config: CoreConfig): Promise<AxiosResponse<CoreConfig>> {
    return this.client.put<CoreConfig>('/api/core/config', config);
  }

  /**
   * Получение настроек узла
   */
  async getNodeSettings(): Promise<AxiosResponse<NodeSettings>> {
    return this.client.get<NodeSettings>('/api/node/settings');
  }

  /**
   * Добавление нового узла
   */
  async addNode(nodeData: NodeCreate): Promise<AxiosResponse<NodeResponse>> {
    return this.client.post<NodeResponse>('/api/node', nodeData);
  }

  /**
   * Получение информации об узле
   */
  async getNode(nodeId: number): Promise<AxiosResponse<NodeResponse>> {
    return this.client.get<NodeResponse>(`/api/node/${nodeId}`);
  }

  /**
   * Изменение узла
   */
  async modifyNode(nodeId: number, nodeData: NodeModify): Promise<AxiosResponse<NodeResponse>> {
    return this.client.put<NodeResponse>(`/api/node/${nodeId}`, nodeData);
  }

  /**
   * Удаление узла
   */
  async removeNode(nodeId: number): Promise<AxiosResponse<void>> {
    return this.client.delete(`/api/node/${nodeId}`);
  }

  /**
   * Получение списка узлов
   */
  async getNodes(): Promise<AxiosResponse<NodeResponse[]>> {
    return this.client.get<NodeResponse[]>('/api/nodes');
  }

  /**
   * Переподключение узла
   */
  async reconnectNode(nodeId: number): Promise<AxiosResponse<void>> {
    return this.client.post(`/api/node/${nodeId}/reconnect`);
  }

  /**
   * Получение статистики использования узлов
   */
  async getNodesUsage(start?: string, end?: string): Promise<AxiosResponse<NodesUsageResponse>> {
    const params = new URLSearchParams();
    if (start) params.append('start', start);
    if (end) params.append('end', end);

    return this.client.get<NodesUsageResponse>('/api/nodes/usage', { params });
  }

  /**
   * Получение информации о подписке пользователя
   */
  async getUserSubscriptionInfo(token: string): Promise<AxiosResponse<SubscriptionUserResponse>> {
    return this.client.get<SubscriptionUserResponse>(`/sub/${token}/info`);
  }

  /**
   * Получение статистики использования для пользователя по токену
   */
  async getUserUsageByToken(token: string, start?: string, end?: string): Promise<AxiosResponse<UserUsageResponse>> {
    const params = new URLSearchParams();
    if (start) params.append('start', start);
    if (end) params.append('end', end);

    return this.client.get<UserUsageResponse>(`/sub/${token}/usage`, { params });
  }

  /**
   * Получение системной статистики
   */
  async getSystemStats(): Promise<AxiosResponse<SystemStats>> {
    return this.client.get<SystemStats>('/api/system');
  }

  /**
   * Получение шаблонов пользователей
   */
  async getUserTemplates(offset?: number, limit?: number): Promise<AxiosResponse<UserTemplateResponse[]>> {
    const params = new URLSearchParams();
    if (offset !== undefined) params.append('offset', offset.toString());
    if (limit !== undefined) params.append('limit', limit.toString());

    return this.client.get<UserTemplateResponse[]>('/api/user_template', { params });
  }

  /**
   * Добавление шаблона пользователя
   */
  async addUserTemplate(templateData: UserTemplateCreate): Promise<AxiosResponse<UserTemplateResponse>> {
    return this.client.post<UserTemplateResponse>('/api/user_template', templateData);
  }

  /**
   * Получение шаблона пользователя по ID
   */
  async getUserTemplate(templateId: number): Promise<AxiosResponse<UserTemplateResponse>> {
    return this.client.get<UserTemplateResponse>(`/api/user_template/${templateId}`);
  }

  /**
   * Изменение шаблона пользователя
   */
  async modifyUserTemplate(templateId: number, templateData: UserTemplateModify): Promise<AxiosResponse<UserTemplateResponse>> {
    return this.client.put<UserTemplateResponse>(`/api/user_template/${templateId}`, templateData);
  }

  /**
   * Удаление шаблона пользователя
   */
  async removeUserTemplate(templateId: number): Promise<AxiosResponse<void>> {
    return this.client.delete(`/api/user_template/${templateId}`);
  }

  /**
   * Добавление пользователя
   */
  async addUser(userData: UserCreate): Promise<AxiosResponse<UserResponse>> {
    return this.client.post<UserResponse>('/api/user', userData);
  }

  /**
   * Получение информации о пользователе
   */
  async getUser(username: string): Promise<AxiosResponse<UserResponse>> {
    return this.client.get<UserResponse>(`/api/user/${username}`);
  }

  /**
   * Изменение пользователя
   */
  async modifyUser(username: string, userData: UserModify): Promise<AxiosResponse<UserResponse>> {
    return this.client.put<UserResponse>(`/api/user/${username}`, userData);
  }

  /**
   * Удаление пользователя
   */
  async removeUser(username: string): Promise<AxiosResponse<void>> {
    return this.client.delete(`/api/user/${username}`);
  }

  /**
   * Сброс использования данных пользователя
   */
  async resetUserDataUsage(username: string): Promise<AxiosResponse<void>> {
    return this.client.post(`/api/user/${username}/reset`);
  }

  /**
   * Отзыв подписки пользователя
   */
  async revokeUserSubscription(username: string): Promise<AxiosResponse<void>> {
    return this.client.post(`/api/user/${username}/revoke_sub`);
  }

  /**
   * Получение статистики использования пользователя
   */
  async getUserUsage(username: string, start?: string, end?: string): Promise<AxiosResponse<UserUsagesResponse>> {
    const params = new URLSearchParams();
    if (start) params.append('start', start);
    if (end) params.append('end', end);

    return this.client.get<UserUsagesResponse>(`/api/user/${username}/usage`, { params });
  }

  /**
   * Сброс использования данных для всех пользователей
   */
  async resetUsersDataUsage(): Promise<AxiosResponse<void>> {
    return this.client.post('/api/users/reset');
  }

  /**
   * Получение статистики использования для всех пользователей
   */
  async getUsersUsage(start?: string, end?: string, admin?: string[]): Promise<AxiosResponse<UsersUsagesResponse>> {
    const params = new URLSearchParams();
    if (start) params.append('start', start);
    if (end) params.append('end', end);
    if (admin && admin.length > 0) {
      admin.forEach(a => params.append('admin', a));
    }

    return this.client.get<UsersUsagesResponse>('/api/users/usage', { params });
  }

  /**
   * Установка владельца для пользователя
   */
  async setOwner(username: string, adminUsername: string): Promise<AxiosResponse<void>> {
    const params = new URLSearchParams();
    params.append('admin_username', adminUsername);

    return this.client.post(`/api/user/${username}/set_owner`, params);
  }

  /**
   * Получение пользователей
   */
  async getUsers(offset?: number, limit?: number, status?: string, sort?: string, username?: string, admin?: string): Promise<AxiosResponse<UsersResponse>> {
    const params = new URLSearchParams();
    if (offset !== undefined) params.append('offset', offset.toString());
    if (limit !== undefined) params.append('limit', limit.toString());
    if (status) params.append('status', status);
    if (sort) params.append('sort', sort);
    if (username) params.append('username', username);
    if (admin) params.append('admin', admin);

    return this.client.get<UsersResponse>('/api/users', { params });
  }

  /**
   * Получение пользовательской подписки
   */
  async getUserSubscription(token: string, userAgent?: string): Promise<AxiosResponse<string>> {
    const config: any = {};
    if (userAgent) {
      config.headers = {
        'User-Agent': userAgent,
      };
    }

    return this.client.get<string>(`/sub/${token}/`, config);
  }

  /**
   * Получение статистики использования для всех узлов
   */
  async getAllNodesUsage(start?: string, end?: string): Promise<AxiosResponse<NodesUsageResponse>> {
    const params = new URLSearchParams();
    if (start) params.append('start', start);
    if (end) params.append('end', end);

    return this.client.get<NodesUsageResponse>('/api/nodes/usage', { params });
  }

  /**
   * Получение списка inbounds
   */
  async getInbounds(): Promise<AxiosResponse<InboundsResponse>> {
    return this.client.get<InboundsResponse>('/api/inbounds');
  }

  /**
   * Получение списка хостов
   */
  async getHosts(): Promise<AxiosResponse<HostsResponse>> {
    return this.client.get<HostsResponse>('/api/hosts');
  }

  /**
   * Изменение хостов
   */
  async modifyHosts(hostsData: Record<string, string>): Promise<AxiosResponse<HostsResponse>> {
    return this.client.put<HostsResponse>('/api/hosts', hostsData);
  }

  /**
   * Создание нескольких пользователей
   */
  async addUsers(usersData: UserBulkCreate): Promise<AxiosResponse<UserBulkResponse>> {
    return this.client.post<UserBulkResponse>('/api/users', usersData);
  }

  /**
   * Создание пользователя из шаблона
   */
  async addUserFromTemplate(templateId: number, userData: UserFromTemplateCreate): Promise<AxiosResponse<UserResponse>> {
    return this.client.post<UserResponse>(`/api/user_template/${templateId}/create_user`, userData);
  }

  /**
   * Создание нескольких пользователей из шаблона
   */
  async addUsersFromTemplate(templateId: number, usersData: UserFromTemplateCreate): Promise<AxiosResponse<UserBulkResponse>> {
    return this.client.post<UserBulkResponse>(`/api/user_template/${templateId}/create_users`, usersData);
  }

  /**
   * Получение версии API
   */
  async getApiVersion(): Promise<AxiosResponse<ApiVersionResponse>> {
    return this.client.get<ApiVersionResponse>('/api/version');
  }

  /**
   * Получение настроек сервера
   */
  async getServerSettings(): Promise<AxiosResponse<ServerSettings>> {
    return this.client.get<ServerSettings>('/api/settings');
  }

  /**
   * Изменение настроек сервера
   */
  async modifyServerSettings(settingsData: ServerSettings): Promise<AxiosResponse<ServerSettings>> {
    return this.client.put<ServerSettings>('/api/settings', settingsData);
  }
}