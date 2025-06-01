import { compareVersions } from '@shared/utils/compare-version.util'
import { XrayConfigFromatType } from '../types/xray-config-format.type'

function getXrayConfigFormat(userAgent: string): XrayConfigFromatType {
  switch (true) {
    case /^([Cc]lash-verge|[Cc]lash[-.]?[Mm]eta|[Ff][Ll][Cc]lash|[Mm]ihomo)/.test(
      userAgent,
    ):
      return 'clash-meta'

    case /^([Cc]lash|[Ss]tash)/.test(userAgent):
      return 'clash'

    case /^(SFA|SFI|SFM|SFT|[Kk]aring|[Hh]iddify[Nn]ext)/.test(userAgent):
      return 'sing-box'

    case /^(SS|SSR|SSD|SSS|Outline|Shadowsocks|SSconf)/.test(userAgent):
      return 'outline'

    case /^v2rayN\/(\d+\.\d+)/.test(userAgent): {
      const versionMatch = userAgent.match(/^v2rayN\/(\d+\.\d+)/)
      if (versionMatch && compareVersions(versionMatch[1], '6.40') >= 0) {
        return 'v2ray-json'
      } else {
        return 'v2ray'
      }
    }

    case /^v2rayNG\/(\d+\.\d+\.\d+)/.test(userAgent): {
      const versionMatch = userAgent.match(/^v2rayNG\/(\d+\.\d+\.\d+)/)
      if (versionMatch) {
        if (compareVersions(versionMatch[1], '1.8.29') >= 0) {
          return 'v2ray-json'
        } else if (compareVersions(versionMatch[1], '1.8.18') >= 0) {
          return 'v2ray-json' // в Python-версии reverse: true, но для configFormat это не влияет
        } else {
          return 'v2ray'
        }
      }
      return 'v2ray'
    }

    case /^[Ss]treisand/.test(userAgent):
      return 'v2ray-json' // Условие USE_CUSTOM_JSON_DEFAULT не включено, только формат

    case /^Happ\/(\d+\.\d+\.\d+)/.test(userAgent): {
      const versionMatch = userAgent.match(/^Happ\/(\d+\.\d+\.\d+)/)
      if (versionMatch && compareVersions(versionMatch[1], '1.63.1') >= 0) {
        return 'v2ray-json'
      } else {
        return 'v2ray'
      }
    }

    default:
      return 'v2ray'
  }
}
