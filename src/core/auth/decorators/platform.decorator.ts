import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import {
  detectPlatformUtil,
  OSEnum,
  TelegramPlatformEnum,
} from '@shared/utils/detect-platform.util'
import type { FastifyRequest } from 'fastify'

export interface DetectedPlatform {
  platform: TelegramPlatformEnum
  os: OSEnum
}

/**
 * Достаёт платформу из заголовка X-Platform (приоритет),
 * либо детектирует по User-Agent как fallback.
 *
 * Клиент должен слать: headers['X-Platform'] = Telegram.WebApp.platform
 * Возможные значения от Telegram: android | ios | macos | tdesktop | web | weba | webk
 */
export const Platform = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): DetectedPlatform => {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>()
    const ua = req.headers['user-agent'] as string | undefined

    const rawHeader = req.headers['x-platform'] as string | undefined
    if (rawHeader) {
      return mapTelegramPlatform(rawHeader.toLowerCase(), ua)
    }

    // Fallback: детект по UA
    return detectPlatformUtil(ua ?? null)
  },
)

function mapTelegramPlatform(
  tgPlatform: string,
  ua?: string,
): DetectedPlatform {
  // Маппинг значений Telegram.WebApp.platform → наши enum'ы
  const map: Record<string, TelegramPlatformEnum> = {
    android: TelegramPlatformEnum.ANDROID,
    ios: TelegramPlatformEnum.IOS,
    macos: TelegramPlatformEnum.DESKTOP,
    tdesktop: TelegramPlatformEnum.DESKTOP,
    web: TelegramPlatformEnum.WEB,
    weba: TelegramPlatformEnum.WEB,
    webk: TelegramPlatformEnum.WEB,
  }

  const platform = map[tgPlatform] ?? TelegramPlatformEnum.WEB

  // ОС всё равно берём из UA — Telegram не передаёт её напрямую
  const { os } = detectPlatformUtil(ua ?? null)

  return { platform, os }
}
