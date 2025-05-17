// Интерфейсы для работы с API Marzban

export interface Token {
  access_token: string
  token_type: string
}

export interface Admin {
  username: string
  is_sudo: boolean
}

export interface AdminCreate {
  username: string
  password: string
  is_sudo: boolean
}

export interface AdminModify {
  password?: string
  is_sudo?: boolean
}

export interface NodeSettings {
  certificate: string
}

export interface NodeCreate {
  name: string
  address: string
  port: number
  api_port: number
  usage_coefficient: number
  add_as_host?: boolean
}

export interface NodeModify {
  name?: string
  address?: string
  port?: number
  api_port?: number
  usage_coefficient?: number
}

export interface NodeResponse {
  id: number
  name: string
  address: string
  port: number
  api_port: number
  usage_coefficient: number
  status: string
  message?: string
  xray_version?: string
}

export interface NodesUsageResponse {
  usages: NodeUsageResponse[]
}

export interface NodeUsageResponse {
  node_id: number
  node_name: string
  uplink: number
  downlink: number
}

export interface CoreStats {
  version: string
  uptime: number
}

export interface SystemStats {
  mem_total: number
  mem_used: number
  cpu_cores: number
  cpu_usage: number
  total_user_count: number
  users_active_count: number
}

export interface UserTemplateCreate {
  name: string
  data_limit?: number
  expire_duration?: number
  username_prefix?: string
  username_suffix?: string
  inbounds?: Record<string, string[]>
}

export interface UserTemplateModify {
  name?: string
  data_limit?: number
  expire_duration?: number
  username_prefix?: string
  username_suffix?: string
  inbounds?: Record<string, string[]>
}

export interface UserTemplateResponse {
  id: number
  name: string
  data_limit: number
  expire_duration: number
  username_prefix: string
  username_suffix: string
  inbounds: Record<string, string[]>
}

export interface UserCreate {
  username: string
  proxies?: Record<string, any>
  data_limit?: number
  data_limit_reset_strategy?: string
  expire?: number
  inbounds?: Record<string, string[]>
  note?: string
  on_hold?: boolean
  status?: string
}

export interface UserModify {
  proxies?: Record<string, any>
  data_limit?: number
  data_limit_reset_strategy?: string
  expire?: number
  inbounds?: Record<string, string[]>
  note?: string
  on_hold?: boolean
  status?: string
}

export interface UserResponse {
  username: string
  proxies: Record<string, any>
  data_limit: number
  data_limit_reset_strategy: string
  expire: number
  used_traffic: number
  created_at: string
  inbounds: Record<string, string[]>
  note: string
  sub_updated_at: string
  sub_last_user_agent: string
  lifetime_used_traffic: number
  online_at: string
  on_hold: boolean
  status: string
  links: string[]
  subscription_url: string
}

export interface UserUsageResponse {
  username: string
  node_id: number
  node_name: string
  uplink: number
  downlink: number
}

export interface UserUsagesResponse {
  username: string
  usages: UserUsageResponse[]
}

export interface UsersUsagesResponse {
  usages: UserUsagesResponse[]
}

export interface SubscriptionUserResponse {
  username: string
  status: string
  used_traffic: number
  data_limit: number
  expire: number
  links: string[]
}

export interface HTTPValidationError {
  detail: ValidationError[]
}

export interface ValidationError {
  loc: (string | number)[]
  msg: string
  type: string
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

export interface UserFromTemplateCreate {
  count?: number
  username?: string
  inbounds?: Record<string, string[]>
}

export interface HostsResponse {
  hosts: Record<string, string>
}

export interface InboundsResponse {
  inbounds: Record<string, string[]>
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

export interface ApiVersionResponse {
  version: string
}

export interface SetOwnerRequest {
  admin_username: string
}
