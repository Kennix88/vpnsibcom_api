import { PlatformEnum } from '@shared/enums/platform.enum'

export function detectPlatformUtil(
  userAgent: string | null,
): PlatformEnum | null {
  if (userAgent === null) return null
  if (userAgent.includes('android')) {
    if (userAgent.includes('tv')) {
      return PlatformEnum.ANDROID_TV
    }
    return PlatformEnum.ANDROID
  }

  if (userAgent.includes('iphone')) return PlatformEnum.IOS

  if (userAgent.includes('ipad')) {
    // iPadOS иногда маскируется под Mac
    return PlatformEnum.IPADOS
  }

  if (userAgent.includes('mac')) {
    return PlatformEnum.MACOS
  }

  if (userAgent.includes('apple tv')) return PlatformEnum.APPLE_TV

  if (userAgent.includes('win')) return PlatformEnum.WINDOWS

  if (userAgent.includes('linux')) return PlatformEnum.LINUX

  return PlatformEnum.ANDROID
}
