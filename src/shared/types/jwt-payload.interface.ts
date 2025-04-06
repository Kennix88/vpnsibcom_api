export interface JwtPayload {
  sub: string // user ID
  telegramId: number
  username?: string
  iat?: number
  exp?: number
}
