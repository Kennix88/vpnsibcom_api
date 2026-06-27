// types/marzban.types.ts

// ─── Auth ──────────────────────────────────────────────────────────────────

export interface Token {
  access_token: string
  token_type: string
}

// ─── Admin ─────────────────────────────────────────────────────────────────

export interface Admin {
  username: string
  is_sudo: boolean
  telegram_id?: number | null
  discord_webhook?: string | null
  users_usage?: number | null
}

export interface AdminCreate {
  username: string
  password: string
  is_sudo: boolean
  telegram_id?: number | null
  discord_webhook?: string | null
  users_usage?: number | null
}

export interface AdminModify {
  is_sudo: boolean
  password?: string | null
  telegram_id?: number | null
  discord_webhook?: string | null
}

// ─── System ────────────────────────────────────────────────────────────────

export interface CoreStats {
  version: string
  started: boolean
  logs_websocket: string
}

export interface SystemStats {
  version: string
  mem_total: number
  mem_used: number
  cpu_cores: number
  cpu_usage: number
  total_user: number
  online_users: number
  users_active: number
  users_on_hold: number
  users_disabled: number
  users_expired: number
  users_limited: number
  incoming_bandwidth: number
  outgoing_bandwidth: number
  incoming_bandwidth_speed: number
  outgoing_bandwidth_speed: number
}

export interface CoreConfig {
  log: {
    loglevel: string
    access: string
    error: string
  }
  api: {
    tag: string
    services: string[]
  }
  inbounds: any[]
  outbounds: any[]
  routing: {
    rules: any[]
    domainStrategy: string
  }
  dns: any
  policy: any
}

export interface ApiVersionResponse {
  version: string
}

export interface ServerSettings {
  message_of_the_day?: string
  subscription_page_template?: string
  clash_subscription_template?: string
  subscription_page_url_prefix?: string
  subscription_update_interval?: number
  webhook_url?: string
  webhook_secret?: string
}

// ─── Nodes ─────────────────────────────────────────────────────────────────

export type NodeStatus = 'connected' | 'connecting' | 'error' | 'disabled'

export interface NodeSettings {
  min_node_version?: string
  certificate: string
}

export interface NodeCreate {
  name: string
  address: string
  port?: number
  api_port?: number
  usage_coefficient?: number
  add_as_new_host?: boolean
}

export interface NodeModify {
  name?: string | null
  address?: string | null
  port?: number | null
  api_port?: number | null
  usage_coefficient?: number | null
  status?: NodeStatus | null
}

export interface NodeResponse {
  id: number
  name: string
  address: string
  port: number
  api_port: number
  usage_coefficient: number
  status: NodeStatus
  xray_version?: string | null
  message?: string | null
}

export interface NodeUsageResponse {
  node_id: number | null
  node_name: string
  uplink: number
  downlink: number
}

export interface NodesUsageResponse {
  usages: NodeUsageResponse[]
}

// ─── Hosts & Inbounds ──────────────────────────────────────────────────────

export type ProxyType = 'vmess' | 'vless' | 'trojan' | 'shadowsocks'

export type ProxyHostSecurity = 'inbound_default' | 'none' | 'tls'

export type ProxyHostALPN =
  | ''
  | 'h3'
  | 'h2'
  | 'http/1.1'
  | 'h3,h2,http/1.1'
  | 'h3,h2'
  | 'h2,http/1.1'

export type ProxyHostFingerprint =
  | ''
  | 'chrome'
  | 'firefox'
  | 'safari'
  | 'ios'
  | 'android'
  | 'edge'
  | '360'
  | 'qq'
  | 'random'
  | 'randomized'

export interface ProxyHost {
  remark: string
  address: string
  port?: number | null
  sni?: string | null
  host?: string | null
  path?: string | null
  security?: ProxyHostSecurity
  alpn?: ProxyHostALPN
  fingerprint?: ProxyHostFingerprint
  allowinsecure?: boolean | null
  is_disabled?: boolean | null
  mux_enable?: boolean | null
  fragment_setting?: string | null
  noise_setting?: string | null
  random_user_agent?: boolean | null
  use_sni_as_host?: boolean | null
}

export interface ProxyInbound {
  tag: string
  protocol: ProxyType
  network: string
  tls: string
  port: number | string
}

export type HostsResponse = Record<ProxyType, ProxyHost[]>

export type InboundsResponse = Record<ProxyType, ProxyInbound[]>

// ─── Users ─────────────────────────────────────────────────────────────────

export type UserStatus =
  | 'active'
  | 'disabled'
  | 'limited'
  | 'expired'
  | 'on_hold'

export type UserStatusCreate = 'active' | 'on_hold'

export type UserStatusModify = 'active' | 'disabled' | 'on_hold'

export type UserDataLimitResetStrategy =
  | 'no_reset'
  | 'day'
  | 'week'
  | 'month'
  | 'year'

export interface NextPlanModel {
  data_limit?: number | null
  expire?: number | null
  add_remaining_traffic?: boolean
  fire_on_either?: boolean
}

export interface ProxySettings {
  id?: string
  [key: string]: any
}

export interface UserCreate {
  username: string
  status?: UserStatusCreate
  proxies?: Partial<Record<ProxyType, ProxySettings>>
  inbounds?: Partial<Record<ProxyType, string[]>>
  expire?: number | null
  data_limit?: number | null
  data_limit_reset_strategy?: UserDataLimitResetStrategy
  note?: string | null
  on_hold_expire_duration?: number | null
  on_hold_timeout?: string | null
  auto_delete_in_days?: number | null
  next_plan?: NextPlanModel | null
  sub_updated_at?: string | null
  sub_last_user_agent?: string | null
  online_at?: string | null
}

export interface UserModify {
  status?: UserStatusModify
  proxies?: Partial<Record<ProxyType, ProxySettings>>
  inbounds?: Partial<Record<ProxyType, string[]>>
  expire?: number | null
  data_limit?: number | null
  data_limit_reset_strategy?: UserDataLimitResetStrategy
  note?: string | null
  on_hold_expire_duration?: number | null
  on_hold_timeout?: string | null
  auto_delete_in_days?: number | null
  next_plan?: NextPlanModel | null
  sub_updated_at?: string | null
  sub_last_user_agent?: string | null
  online_at?: string | null
}

export interface UserResponse {
  username: string
  status: UserStatus
  proxies: Partial<Record<ProxyType, ProxySettings>>
  inbounds: Partial<Record<ProxyType, string[]>>
  excluded_inbounds: Partial<Record<ProxyType, string[]>>
  expire?: number | null
  data_limit?: number | null
  data_limit_reset_strategy: UserDataLimitResetStrategy
  note?: string | null
  on_hold_expire_duration?: number | null
  on_hold_timeout?: string | null
  auto_delete_in_days?: number | null
  next_plan?: NextPlanModel | null
  sub_updated_at?: string | null
  sub_last_user_agent?: string | null
  online_at?: string | null
  used_traffic: number
  lifetime_used_traffic: number
  created_at: string
  links: string[]
  subscription_url: string
  admin?: Admin | null
}

export interface UsersResponse {
  users: UserResponse[]
  total: number
}

export interface UserBulkCreate {
  users: UserCreate[]
}

export interface UserBulkResponse {
  users: UserResponse[]
}

// ─── User Usage ────────────────────────────────────────────────────────────

export interface UserUsageResponse {
  node_id: number | null
  node_name: string
  used_traffic: number
}

export interface UserUsagesResponse {
  username: string
  usages: UserUsageResponse[]
}

export interface UsersUsagesResponse {
  usages: UserUsagesResponse[]
}

// ─── Subscription ──────────────────────────────────────────────────────────

export interface SubscriptionUserResponse {
  username: string
  status: UserStatus
  proxies: Record<string, any>
  used_traffic: number
  lifetime_used_traffic: number
  data_limit?: number | null
  data_limit_reset_strategy: UserDataLimitResetStrategy
  expire?: number | null
  on_hold_expire_duration?: number | null
  on_hold_timeout?: string | null
  next_plan?: NextPlanModel | null
  sub_updated_at?: string | null
  sub_last_user_agent?: string | null
  online_at?: string | null
  created_at: string
  links: string[]
  subscription_url: string
}

// ─── User Templates ────────────────────────────────────────────────────────

export interface UserTemplateCreate {
  name?: string | null
  data_limit?: number | null
  expire_duration?: number | null
  username_prefix?: string | null
  username_suffix?: string | null
  inbounds?: Partial<Record<ProxyType, string[]>>
}

export interface UserTemplateModify {
  name?: string | null
  data_limit?: number | null
  expire_duration?: number | null
  username_prefix?: string | null
  username_suffix?: string | null
  inbounds?: Partial<Record<ProxyType, string[]>>
}

export interface UserTemplateResponse {
  id: number
  name?: string | null
  data_limit?: number | null
  expire_duration?: number | null
  username_prefix?: string | null
  username_suffix?: string | null
  inbounds: Partial<Record<ProxyType, string[]>>
}

// ─── Errors ────────────────────────────────────────────────────────────────

export interface MarzbanValidationError {
  loc: (string | number)[]
  msg: string
  type: string
}

export interface MarzbanHTTPValidationError {
  detail: MarzbanValidationError[]
}

export interface MarzbanHTTPException {
  detail: string
}
