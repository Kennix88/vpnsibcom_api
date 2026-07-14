export const REMNA_ENV = {
  API_URL: 'REMNAWAVE_API_URL',
  API_TOKEN: 'REMNAWAVE_API_TOKEN',
  TIMEOUT_MS: 'REMNAWAVE_TIMEOUT_MS',
  MAX_RETRIES: 'REMNAWAVE_MAX_RETRIES',
} as const

export const REMNA_DEFAULT_TIMEOUT_MS = 15_000
export const REMNA_DEFAULT_MAX_RETRIES = 3

/** TTL кэша в Redis для отдельных read-heavy эндпоинтов (сек) */
export const REMNA_CACHE_TTL_SECONDS = {
  USER_BY_UUID: 15,
  ACCESSIBLE_NODES: 60,
  HWID_STATS: 60,
} as const

export const REMNA_CACHE_PREFIX = 'remna'
