import { compareVersions } from '@shared/utils/compare-version.util'
import { XrayConfigFromatType } from '../types/xray-config-format.type'

const REGEX_PATTERNS = {
  CLASH_META:
    /^([Cc]lash-verge|[Cc]lash[-.]?[Mm]eta|[Ff][Ll][Cc]lash|[Mm]ihomo)/,
  CLASH: /^([Cc]lash|[Ss]tash)/,
  SING_BOX: /^(SFA|SFI|SFM|SFT|[Kk]aring|[Hh]iddify[Nn]ext|[Hh]iddify)/,
  OUTLINE: /^(SS|SSR|SSD|SSS|Outline|Shadowsocks|SSconf)/,
  V2RAY_N: /^v2rayN\/(\d+\.\d+)/,
  V2RAY_NG: /^v2rayNG\/(\d+\.\d+\.\d+)/,
  STREISAND: /^[Ss]treisand/,
  HAPP: /^Happ\/(\d+\.\d+\.\d+)(?:\/([A-Za-z]+))?/,
}

const VERSION_THRESHOLDS = {
  V2RAY_N: '6.40',
  V2RAY_NG_HIGH: '1.8.29',
  V2RAY_NG_MID: '1.8.18',
  HAPP: '1.63.1',
}

/**
 * Определяет формат конфигурации Xray на основе строки User-Agent
 *
 * @param {string} userAgent - Строка User-Agent клиента
 * @returns {XrayConfigFromatType} - Тип формата конфигурации Xray
 */
function getXrayConfigFormat(userAgent: string): XrayConfigFromatType {
  if (!userAgent) {
    return 'v2ray'
  }

  switch (true) {
    case REGEX_PATTERNS.CLASH_META.test(userAgent):
      return 'clash-meta'

    case REGEX_PATTERNS.CLASH.test(userAgent):
      return 'clash'

    case REGEX_PATTERNS.SING_BOX.test(userAgent):
      return 'sing-box' // 'sing-box'

    case REGEX_PATTERNS.OUTLINE.test(userAgent):
      return 'outline'

    case REGEX_PATTERNS.V2RAY_N.test(userAgent): {
      const versionMatch = userAgent.match(REGEX_PATTERNS.V2RAY_N)
      if (
        versionMatch?.[1] &&
        compareVersions(versionMatch[1], VERSION_THRESHOLDS.V2RAY_N) >= 0
      ) {
        return 'v2ray'
        // return 'v2ray-json'
      }
      return 'v2ray'
    }

    case REGEX_PATTERNS.V2RAY_NG.test(userAgent): {
      const versionMatch = userAgent.match(REGEX_PATTERNS.V2RAY_NG)
      if (!versionMatch?.[1]) {
        return 'v2ray'
      }

      const version = versionMatch[1]
      if (
        compareVersions(version, VERSION_THRESHOLDS.V2RAY_NG_HIGH) >= 0 ||
        compareVersions(version, VERSION_THRESHOLDS.V2RAY_NG_MID) >= 0
      ) {
        return 'v2ray'
        // return 'v2ray-json'
      }
      return 'v2ray'
    }

    case REGEX_PATTERNS.STREISAND.test(userAgent):
      return 'v2ray'
    // return 'v2ray-json'

    case REGEX_PATTERNS.HAPP.test(userAgent): {
      const match = userAgent.match(REGEX_PATTERNS.HAPP)
      const version = match?.[1]
      const platform = match?.[2]?.toLowerCase()

      const isDesktopPlatform =
        platform === 'windows' ||
        platform === 'linux' ||
        platform === 'mac' ||
        platform === 'macos'

      if (isDesktopPlatform) {
        return 'v2ray'
        // return 'v2ray-json'
      }

      if (version && compareVersions(version, VERSION_THRESHOLDS.HAPP) >= 0) {
        return 'v2ray'
        // return 'v2ray-json'
      }

      return 'v2ray'
    }

    default:
      return 'v2ray'
  }
}

export { getXrayConfigFormat }
