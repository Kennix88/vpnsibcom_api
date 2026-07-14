/**
 * Типы для интеграции с Remnawave Panel API (v2.7.4).
 * Сгенерировано и сверено вручную по OpenAPI-схеме панели.
 *
 * Все ответы панели оборачиваются в конверт { response: T }.
 * RemnaService распаковывает конверт самостоятельно, наружу отдаются уже "голые" типы.
 */

// ==================== Общие типы ====================

/** Конверт ответа Remnawave API: { response: T } */
export interface RemnaApiEnvelope<T> {
  response: T
}

/** Деталь ошибки валидации, которую возвращает панель */
export interface RemnaApiErrorDetail {
  validation?: string
  code?: string
  message?: string
  path?: string[]
}

/** Тело ошибки, которое отдаёт Remnawave при 400/401/403/404/... */
export interface RemnaApiErrorBody {
  message?: string
  statusCode?: number
  errors?: RemnaApiErrorDetail[]
}

export type RemnaUserStatus = 'ACTIVE' | 'DISABLED' | 'LIMITED' | 'EXPIRED'

export type RemnaTrafficLimitStrategy =
  | 'NO_RESET'
  | 'DAY'
  | 'WEEK'
  | 'MONTH'
  | 'MONTH_ROLLING'

export interface RemnaPaginationParams {
  /** Кол-во записей на странице */
  size?: number
  /** Смещение (offset) */
  start?: number
}

// ==================== User: базовая сущность ====================

export interface RemnaInternalSquadRef {
  uuid: string
  name: string
}

export interface RemnaUserTraffic {
  usedTrafficBytes: number
  lifetimeUsedTrafficBytes: number
  onlineAt: string | null
  firstConnectedAt: string | null
  lastConnectedNodeUuid: string | null
}

/** Полная сущность пользователя, как её отдаёт Remnawave */
export interface RemnaUser {
  uuid: string
  id: number
  shortUuid: string
  username: string
  status: RemnaUserStatus
  trafficLimitBytes: number
  trafficLimitStrategy: RemnaTrafficLimitStrategy
  expireAt: string
  telegramId: number | null
  email: string | null
  description: string | null
  tag: string | null
  hwidDeviceLimit: number | null
  externalSquadUuid: string | null
  trojanPassword: string
  vlessUuid: string
  ssPassword: string
  lastTriggeredThreshold: number
  subRevokedAt: string | null
  lastTrafficResetAt: string | null
  createdAt: string
  updatedAt: string
  subscriptionUrl: string
  activeInternalSquads: RemnaInternalSquadRef[]
  userTraffic: RemnaUserTraffic
}

// ==================== Users: create / update ====================

export interface CreateRemnaUserDto {
  /** 3-36 символов: буквы, цифры, "_" и "-" */
  username: string
  /** По умолчанию ACTIVE */
  status?: RemnaUserStatus
  shortUuid?: string
  /** 8-32 символа */
  trojanPassword?: string
  vlessUuid?: string
  /** 8-32 символа */
  ssPassword?: string
  /** 0 = безлимит */
  trafficLimitBytes?: number
  /** По умолчанию NO_RESET */
  trafficLimitStrategy?: RemnaTrafficLimitStrategy
  /** Обязательное поле, ISO date-time */
  expireAt: string
  createdAt?: string
  lastTrafficResetAt?: string
  description?: string
  /** Только заглавные буквы/цифры/"_", максимум 16 символов */
  tag?: string | null
  telegramId?: number | null
  email?: string | null
  hwidDeviceLimit?: number
  activeInternalSquads?: string[]
  uuid?: string
  externalSquadUuid?: string | null
}

export interface UpdateRemnaUserDto {
  uuid: string
  username?: string
  status?: Extract<RemnaUserStatus, 'ACTIVE' | 'DISABLED'>
  trafficLimitBytes?: number
  trafficLimitStrategy?: RemnaTrafficLimitStrategy
  expireAt?: string
  tag?: string | null
  telegramId?: number | null
  email?: string | null
  hwidDeviceLimit?: number | null
  activeInternalSquads?: string[]
  externalSquadUuid?: string | null
}

export interface GetAllUsersResult {
  users: RemnaUser[]
  total: number
}

export interface ResolveUserDto {
  uuid?: string
  id?: number
  shortUuid?: string
  username?: string
}

export interface ResolveUserResult {
  uuid: string
  username: string
  id: number
  shortUuid: string
}

export interface RevokeUserSubscriptionDto {
  /** Если true — сбрасываются только пароли/ключи, shortUuid остаётся прежним */
  revokeOnlyPasswords?: boolean
  /** 6-48 символов, новый shortUuid (если revokeOnlyPasswords=false) */
  shortUuid?: string
}

export interface DeleteUserResult {
  isDeleted: boolean
}

// ==================== Users: accessible nodes / history / tags ====================

export interface RemnaAccessibleSquad {
  squadName: string
  activeInbounds: string[]
}

export interface RemnaAccessibleNode {
  uuid: string
  nodeName: string
  countryCode: string
  configProfileUuid: string
  configProfileName: string
  activeSquads: RemnaAccessibleSquad[]
}

export interface GetUserAccessibleNodesResult {
  userUuid: string
  activeNodes: RemnaAccessibleNode[]
}

export interface RemnaSubscriptionRequestRecord {
  id: number
  userUuid: string
  requestAt: string
  requestIp: string | null
  userAgent: string | null
}

export interface GetUserSubscriptionRequestHistoryResult {
  total: number
  records: RemnaSubscriptionRequestRecord[]
}

export interface GetAllTagsResult {
  tags: string[]
}

// ==================== Users: bulk-действия ====================

export interface RemnaBulkAffectedResult {
  affectedRows: number
}

export interface RemnaBulkEventResult {
  eventSent: boolean
}

export interface BulkUuidsDto {
  /** 1-500 uuid */
  uuids: string[]
}

export interface BulkDeleteUsersByStatusDto {
  status?: RemnaUserStatus
}

export interface BulkUpdateUsersFieldsDto {
  status?: RemnaUserStatus
  trafficLimitBytes?: number
  trafficLimitStrategy?: RemnaTrafficLimitStrategy
  expireAt?: string
  telegramId?: number | null
  email?: string | null
  tag?: string | null
  hwidDeviceLimit?: number | null
  externalSquadUuid?: string | null
}

export interface BulkUpdateUsersDto extends BulkUuidsDto {
  fields: BulkUpdateUsersFieldsDto
}

export interface BulkUpdateUsersSquadsDto extends BulkUuidsDto {
  activeInternalSquads: string[]
}

export interface BulkExtendExpirationDateDto extends BulkUuidsDto {
  /** 1-9999 дней */
  extendDays: number
}

export interface BulkAllUpdateUsersDto {
  status?: RemnaUserStatus
  trafficLimitBytes?: number
  trafficLimitStrategy?: RemnaTrafficLimitStrategy
  expireAt?: string
  telegramId?: number | null
  email?: string | null
  tag?: string | null
  hwidDeviceLimit?: number | null
}

export interface BulkAllExtendExpirationDateDto {
  extendDays: number
}

// ==================== Subscriptions (публичные, отдаваемые клиенту) ====================

export interface RemnaSubscriptionUserInfo {
  shortUuid: string
  daysLeft: number
  trafficUsed: string
  trafficLimit: string
  lifetimeTrafficUsed: string
  trafficUsedBytes: string
  trafficLimitBytes: string
  lifetimeTrafficUsedBytes: string
  username: string
  expiresAt: string
  isActive: boolean
  userStatus: RemnaUserStatus
  trafficLimitStrategy: RemnaTrafficLimitStrategy
}

export interface RemnaSubscriptionInfo {
  isFound: boolean
  user: RemnaSubscriptionUserInfo
  links: string[]
  ssConfLinks: Record<string, string>
  subscriptionUrl: string
}

export type RemnaSubscriptionClientType =
  | 'stash'
  | 'singbox'
  | 'mihomo'
  | 'json'
  | 'v2ray-json'
  | 'clash'

export interface GetAllSubscriptionsResult {
  subscriptions: RemnaSubscriptionInfo[]
  total: number
}

export interface GetConnectionKeysResult {
  enabledKeys: string[]
  hiddenKeys: string[]
  disabledKeys: string[]
}

export interface GetSubpageConfigDto {
  requestHeaders: Record<string, string>
}

export interface GetSubpageConfigResult {
  subpageConfigUuid: string | null
  webpageAllowed: boolean
}

/**
 * "Сырая" подписка (resolved proxy configs) — очень вариативная структура
 * (protocolOptions/transportOptions/securityOptions различаются по протоколу).
 * Типизирована частично; при необходимости точечно расширяйте по месту использования.
 */
export interface RemnaRawSubscription {
  user: RemnaSubscriptionUserInfo
  convertedUserInfo: Record<string, unknown>
  headers: Record<string, string>
  resolvedProxyConfigs: Array<Record<string, unknown>>
}

// ==================== Nodes ====================

export interface RemnaNodeConfigProfileInbound {
  uuid: string
  profileUuid: string
  tag: string
  type: string
  network: string | null
  security: string | null
  port: number | null
  rawInbound: unknown | null
}

export interface RemnaNodeConfigProfile {
  activeConfigProfileUuid: string | null
  activeInbounds: RemnaNodeConfigProfileInbound[]
}

export interface RemnaNodeProvider {
  uuid: string
  name: string
  faviconLink: string | null
  loginUrl: string | null
  createdAt: string
  updatedAt: string
}

export interface RemnaNodeSystemInfo {
  arch: string
  cpus: number
  cpuModel: string
  memoryTotal: number
  hostname: string
  platform: string
  release: string
  type: string
  version: string
  networkInterfaces: string[]
}

export interface RemnaNodeSystemInterfaceStats {
  interface: string
  rxBytesPerSec: number
  txBytesPerSec: number
  rxTotal: number
  txTotal: number
}

export interface RemnaNodeSystemStats {
  memoryFree: number
  memoryUsed: number
  uptime: number
  loadAvg: number[]
  interface: RemnaNodeSystemInterfaceStats | null
}

export interface RemnaNodeSystem {
  info: RemnaNodeSystemInfo
  stats: RemnaNodeSystemStats
}

export interface RemnaNodeVersions {
  xray: string
  node: string
}

export interface RemnaNode {
  uuid: string
  name: string
  address: string
  port: number | null
  isConnected: boolean
  isDisabled: boolean
  isConnecting: boolean
  lastStatusChange: string | null
  lastStatusMessage: string | null
  isTrafficTrackingActive: boolean
  trafficResetDay: number | null
  trafficLimitBytes: number | null
  trafficUsedBytes: number | null
  notifyPercent: number | null
  viewPosition: number
  countryCode: string
  consumptionMultiplier: number
  tags: string[]
  createdAt: string
  updatedAt: string
  configProfile: RemnaNodeConfigProfile
  providerUuid: string | null
  provider: RemnaNodeProvider | null
  activePluginUuid: string | null
  system: RemnaNodeSystem | null
  versions: RemnaNodeVersions | null
  xrayUptime: number
  usersOnline: number
}

// ==================== HWID устройства ====================

export interface RemnaHwidDevice {
  hwid: string
  userUuid: string
  platform: string | null
  osVersion: string | null
  deviceModel: string | null
  userAgent: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateHwidDeviceDto {
  hwid: string
  userUuid: string
  platform?: string
  osVersion?: string
  deviceModel?: string
  userAgent?: string
}

export interface DeleteHwidDeviceDto {
  userUuid: string
  hwid: string
}

export interface DeleteAllHwidDevicesDto {
  userUuid: string
}

export interface GetUserHwidDevicesResult {
  total: number
  devices: RemnaHwidDevice[]
}

export interface GetAllHwidDevicesResult {
  devices: RemnaHwidDevice[]
  total: number
}

export interface HwidDevicesStatsByPlatform {
  platform: string
  count: number
}

export interface HwidDevicesStatsByApp {
  app: string
  count: number
}

export interface HwidDevicesStatsSummary {
  totalUniqueDevices: number
  totalHwidDevices: number
  averageHwidDevicesPerUser: number
}

export interface GetHwidDevicesStatsResult {
  byPlatform: HwidDevicesStatsByPlatform[]
  byApp: HwidDevicesStatsByApp[]
  stats: HwidDevicesStatsSummary
}

export interface TopUserByHwidDevices {
  userUuid: string
  id: number
  username: string
  devicesCount: number
}

export interface GetTopUsersByHwidDevicesResult {
  users: TopUserByHwidDevices[]
  total: number
}

// ==================== IP-control ====================

export type RemnaDropConnectionsBy =
  | { by: 'userUuids'; userUuids: string[] }
  | { by: 'ipAddresses'; ipAddresses: string[] }

export type RemnaDropConnectionsTarget =
  | { target: 'allNodes' }
  | { target: 'specificNodes'; nodeUuids: string[] }

export interface DropConnectionsDto {
  dropBy: RemnaDropConnectionsBy
  targetNodes: RemnaDropConnectionsTarget
}

export interface DropConnectionsResult {
  eventSent: boolean
}

export interface FetchIpsJobResult {
  jobId: string
}

export interface RemnaIpEntry {
  ip: string
  lastSeen: string
}

export interface FetchIpsNodeResult {
  nodeUuid: string
  nodeName: string
  countryCode: string
  ips: RemnaIpEntry[]
}

export interface FetchIpsUserResult {
  success: boolean
  userUuid: string
  userId: string
  nodes: FetchIpsNodeResult[]
}

export interface FetchIpsJobProgress {
  total: number
  completed: number
  percent: number
}

export interface FetchIpsResult {
  isCompleted: boolean
  isFailed: boolean
  progress: FetchIpsJobProgress
  result: FetchIpsUserResult | null
}

export interface FetchUsersIpsUserResult {
  userId: string
  ips: RemnaIpEntry[]
}

export interface FetchUsersIpsNodeResult {
  success: boolean
  nodeUuid: string
  users: FetchUsersIpsUserResult[]
}

export interface FetchUsersIpsResult {
  isCompleted: boolean
  isFailed: boolean
  result: FetchUsersIpsNodeResult | null
}

// ==================== Bandwidth stats (по пользователю) ====================

export interface RemnaLegacyUserUsageEntry {
  userUuid: string
  nodeUuid: string
  nodeName: string
  countryCode: string
  total: number
  date: string
}

export interface GetLegacyUserUsageParams {
  /** ISO date-time */
  start: string
  /** ISO date-time */
  end: string
}

export interface RemnaUserUsageTopNode {
  uuid: string
  color: string
  name: string
  countryCode: string
  total: number
}

export interface RemnaUserUsageSeries {
  uuid: string
  name: string
  color: string
  countryCode: string
  total: number
  data: number[]
}

export interface GetUserUsageParams {
  topNodesLimit: number
  /** ISO date, например 2026-01-01 */
  start: string
  /** ISO date, например 2026-01-31 */
  end: string
}

export interface GetUserUsageResult {
  categories: string[]
  sparklineData: number[]
  topNodes: RemnaUserUsageTopNode[]
  series: RemnaUserUsageSeries[]
}
