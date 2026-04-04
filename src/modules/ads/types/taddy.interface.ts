export interface TaddyUserInterface {
  id: number
  firstName?: string
  lastName?: string
  username?: string
  premium?: boolean
  language?: string
  country?: string
  gender?: TaddyGenderEnum
  ip?: string
  userAgent?: string
  /**
   * Format: YYYY-MM-DD;
   * Example: 1990-05-23
   */
  birthDate?: `${number}-${number}-${number}`
}

export enum TaddyGenderEnum {
  MALE = 'male',
  FEMALE = 'female',
  UNKNOWN = 'unknown',
}

export interface TaddyPubId {
  pubId: string
}

export interface TaddyBaseRequestInterface extends TaddyPubId {
  user: TaddyUserInterface
  origin?: TaddyOriginEnum
}

export interface TaddyStartEventRequestInterface
  extends TaddyBaseRequestInterface {
  start?: string
}

export enum TaddyOriginEnum {
  SERVER = 'server',
  WEB = 'web',
}

export enum TaddyAdFormatEnum {
  BOT_AD = 'bot-ad',
  APP_INTERSTITIAL = 'app-interstitial',
  APP_TASK = 'app-task',
}

export interface TaddyGetAdRequestInterface extends TaddyBaseRequestInterface {
  format: TaddyAdFormatEnum
}

export interface TaddySendAdImpressionEventRequestInterface {
  id: string | string[]
}

export interface TaddyGetAdResponseInterface {
  result?: {
    id: string
    title: string
    description: string | null
    image: string | null
    icon: string | null
    text: string | null
    button: string | null
    link: string
  } | null
}

export enum TaddyImageFromatEnum {
  JPG = 'jpg',
  PNG = 'png',
  WEBP = 'webp',
}

export interface TaddyGetFeedRequestInterface
  extends TaddyBaseRequestInterface {
  /**
   * Формат изображения?
   * Default: webp
   */
  imageFormat?: TaddyImageFromatEnum
  /**
   * Только целочисленные!
   * Min: 1;
   * Default: 4
   */
  limit?: number
  /**
   * Отмечать автоматически показанными?
   * Default: false
   */
  autoImpressions?: boolean
}

export enum TaddyFeedTypeEnum {
  APP = 'app',
  BOT = 'bot',
}

export enum TaddyFeedStatusEnum {
  NEW = 'new',
  PENDING = 'pending',
  COMPLETED = 'completed',
}

export interface TaddyGetFeedResponseInterface {
  result: {
    id: string
    uid: string
    title: string
    description: string
    image: string
    type: TaddyFeedTypeEnum
    price?: number | null
    link: string
    status: TaddyFeedStatusEnum
    createdAt: string
    expiresAt: string
  }[]
}

export interface TaddySendFeedImpressionEventRequestInterface {
  ids: string[]
}

export interface TaddyCheckFeedRequestInterface {
  id: string
}

export interface TaddyCheckFeedResponseInterface {
  result: boolean
}
