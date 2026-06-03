/**
 * Telegram Mini App платформа — используется для таргетинга рекламы.
 * Источник: user agent + Telegram-специфичные заголовки.
 */
export enum TelegramPlatformEnum {
  DESKTOP = 'DESKTOP', // Telegram Desktop (Windows / macOS / Linux)
  IOS = 'IOS', // Telegram на iPhone / iPad
  ANDROID = 'ANDROID', // Telegram на Android
  WEB = 'WEB', // Telegram Web (web.telegram.org / webk / webz)
  BOT = 'BOT', // Запрос от бота / отсутствие UA
}

/**
 * Операционная система устройства.
 */
export enum OSEnum {
  WINDOWS = 'WINDOWS',
  MACOS = 'MACOS',
  LINUX = 'LINUX',
  IOS = 'IOS',
  ANDROID = 'ANDROID',
  UNKNOWN = 'UNKNOWN',
}

export interface DetectedPlatform {
  platform: TelegramPlatformEnum
  os: OSEnum
}

/**
 * Определяет Telegram-платформу и ОС по User-Agent.
 *
 * Порядок проверок важен:
 * 1. Пустой / null UA → BOT
 * 2. Telegram Desktop UA (TelegramDesktop/x.y.z)
 * 3. Мобильные ОС (Android / iPhone / iPad)
 * 4. Telegram Web (webk, webz, web.telegram.org)
 * 5. Всё остальное с браузерным UA → WEB / UNKNOWN
 */
export function detectPlatformUtil(
  userAgent: string | null | undefined,
): DetectedPlatform {
  // Нет UA — скорее всего серверный бот или пустой запрос
  if (!userAgent?.trim()) {
    return { platform: TelegramPlatformEnum.BOT, os: OSEnum.UNKNOWN }
  }

  const ua = userAgent.toLowerCase()

  // ── Telegram Desktop ────────────────────────────────────────────────────
  // UA вида: "TelegramDesktop/5.3.1 ..."
  if (ua.includes('telegramdesktop')) {
    const os = ua.includes('windows')
      ? OSEnum.WINDOWS
      : ua.includes('mac')
      ? OSEnum.MACOS
      : ua.includes('linux')
      ? OSEnum.LINUX
      : OSEnum.UNKNOWN

    return { platform: TelegramPlatformEnum.DESKTOP, os }
  }

  // ── Android ─────────────────────────────────────────────────────────────
  if (ua.includes('android')) {
    return { platform: TelegramPlatformEnum.ANDROID, os: OSEnum.ANDROID }
  }

  // ── iOS / iPadOS ─────────────────────────────────────────────────────────
  // iPad под iPadOS 13+ может маскироваться под macOS — проверяем оба маркера
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) {
    return { platform: TelegramPlatformEnum.IOS, os: OSEnum.IOS }
  }

  // ── Telegram Web ─────────────────────────────────────────────────────────
  // web.telegram.org/k (WebK) и web.telegram.org/a (WebA/WebZ)
  if (
    ua.includes('telegram web') ||
    ua.includes('tgweb') ||
    ua.includes('webk') ||
    ua.includes('webz')
  ) {
    const os = ua.includes('windows')
      ? OSEnum.WINDOWS
      : ua.includes('mac')
      ? OSEnum.MACOS
      : ua.includes('linux')
      ? OSEnum.LINUX
      : OSEnum.UNKNOWN

    return { platform: TelegramPlatformEnum.WEB, os }
  }

  // ── Браузерный fallback (открыт в браузере, а не в приложении) ───────────
  const os = ua.includes('windows')
    ? OSEnum.WINDOWS
    : ua.includes('mac')
    ? OSEnum.MACOS
    : ua.includes('linux')
    ? OSEnum.LINUX
    : OSEnum.UNKNOWN

  return { platform: TelegramPlatformEnum.WEB, os }
}
