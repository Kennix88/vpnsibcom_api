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
  // Format: YYYY-MM-DD
  birthDate?: `${number}-${number}-${number}`
}

export enum TaddyGenderEnum {
  MALE = 'male',
  FEMALE = 'female',
  UNKNOWN = 'unknown',
}

export interface TaddyBaseRequestInterface {
  pubId: string
}

export interface TaddyStartEventRequestInterface
  extends TaddyBaseRequestInterface {
  user: TaddyUserInterface
  origin?: TaddyOriginEnum
  start?: string
}

export enum TaddyOriginEnum {
  SERVER = 'server',
  WEB = 'web',
}
