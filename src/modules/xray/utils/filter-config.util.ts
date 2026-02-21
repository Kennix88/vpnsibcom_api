import * as yaml from 'js-yaml'

type ConfigFormat = 'json' | 'sing-box' | 'clash' | 'base64'

function isLikelyIP(s: string): boolean {
  // простая проверка IPv4 и IPv6 (не идеальная, но достаточна для идентификации)
  const ipv4 =
    /^(25[0-5]|2[0-4]\d|1?\d{1,2})(\.(25[0-5]|2[0-4]\d|1?\d{1,2})){3}$/
  const ipv6 = /:/ // наличие двоеточия — быстрая эвристика для ipv6
  return ipv4.test(s) || ipv6.test(s)
}

function extractHostFromString(input: string): string | null {
  if (!input) return null
  input = input.trim()

  // 1) vmess://<base64> -> распарсим payload, если возможно
  if (/^vmess:\/\//i.test(input)) {
    try {
      const payload = input.replace(/^vmess:\/\//i, '')
      const json = JSON.parse(Buffer.from(payload, 'base64').toString())
      return (json.add || json.address || null) as string | null
    } catch {
      // fallthrough
    }
  }

  // 2) URI-like (vless://user@host:port, ss://, trojan://user@host:port)
  const uriMatch = input.match(
    /^[a-z0-9+\-.]+:\/\/(?:[^@]+@)?\[?([^\]\s:/?#]+)\]?(?::\d+)?/i,
  )
  if (uriMatch && uriMatch[1]) return uriMatch[1]

  // 3) plain user@host:port or user:pass@host:port
  const atMatch = input.match(/^[^@]+@([^:/\s]+)/)
  if (atMatch && atMatch[1]) return atMatch[1]

  // 4) host:port or host
  const hostPortMatch = input.match(/^(\[?[^\]\s:]+\]?)(?::\d+)?$/)
  if (hostPortMatch && hostPortMatch[1]) {
    return hostPortMatch[1].replace(/^\[|\]$/g, '') // убрать скобки для ipv6
  }

  return null
}

function matchHost(host: string | null, servers: string[]): boolean {
  if (!host) return false
  for (const s of servers) {
    if (isLikelyIP(s)) {
      // для IP — строгая проверка (равенство хоста и IP)
      if (host === s) return true
    } else {
      // для доменов/подстрок — substring матч
      if (host.includes(s)) return true
    }
  }
  return false
}

/**
 * Фильтрует конфигурацию по списку серверов (поддерживает IP).
 * @param format - 'json' | 'sing-box' | 'clash' | 'base64'
 * @param body - исходная конфигурация (string)
 * @param servers - список IP или подстрок/доменов
 */
export function filterConfig(
  format: ConfigFormat,
  body: string,
  servers: string[],
): string {
  if (!servers || servers.length === 0) {
    if (format === 'base64') return body
    // возвращаем красиво отформатированную строку (если это JSON/YAML)
    try {
      if (format === 'clash') {
        const cfg = yaml.load(body)
        return yaml.dump(cfg as any, { indent: 2 })
      } else {
        const parsed = JSON.parse(body)
        return JSON.stringify(parsed, null, 2)
      }
    } catch {
      return body
    }
  }

  switch (format) {
    case 'sing-box': {
      let cfg: any
      try {
        cfg = typeof body === 'string' ? JSON.parse(body) : body
      } catch {
        throw new Error('Invalid JSON for sing-box format')
      }
      if (!Array.isArray(cfg.outbounds)) {
        return JSON.stringify(cfg, null, 2)
      }
      const filteredOutbounds = cfg.outbounds.filter((out: any) => {
        // многие out.server — это строка или объект; пытаемся извлечь хост
        const candidate =
          typeof out.server === 'string'
            ? extractHostFromString(out.server) || out.server
            : typeof out.server === 'object' && out.server?.address
            ? out.server.address
            : null

        if (typeof candidate === 'string') {
          return matchHost(candidate, servers)
        }
        // сохраняем селекторы и urltest
        return out.type === 'selector' || out.type === 'urltest'
      })

      const allowedTags = filteredOutbounds
        .map((o: any) => o.tag)
        .filter(Boolean)

      filteredOutbounds.forEach((out: any) => {
        if (
          (out.type === 'selector' || out.type === 'urltest') &&
          Array.isArray(out.outbounds)
        ) {
          out.outbounds = out.outbounds.filter((tag: string) =>
            allowedTags.includes(tag),
          )
          if (out.default && !out.outbounds.includes(out.default)) {
            out.default = out.outbounds[0] || null
          }
        }
      })

      cfg.outbounds = filteredOutbounds
      return JSON.stringify(cfg, null, 2)
    }

    case 'json': {
      let arr: any
      try {
        arr = typeof body === 'string' ? JSON.parse(body) : body
      } catch {
        throw new Error('Invalid JSON')
      }
      if (!Array.isArray(arr)) {
        return JSON.stringify(arr, null, 2)
      }
      const filtered = arr.filter((obj) => {
        const addr =
          obj.outbounds?.[0]?.settings?.vnext?.[0]?.address ||
          obj.outbounds?.[0]?.settings?.vnext?.[0]?.add // варианты полей
        const host = extractHostFromString(addr) || addr
        return typeof host === 'string' && matchHost(host, servers)
      })
      return JSON.stringify(filtered, null, 2)
    }

    case 'clash': {
      let cfg: any
      try {
        cfg = yaml.load(body) as any
      } catch {
        throw new Error('Invalid YAML for clash format')
      }
      if (Array.isArray(cfg.proxies)) {
        cfg.proxies = cfg.proxies.filter((proxy: any) => {
          const host = extractHostFromString(proxy.server) || proxy.server
          return typeof host === 'string' && matchHost(host, servers)
        })
      }
      const proxyNames = new Set<string>()
      ;(cfg.proxies || []).forEach((p: any) => {
        if (typeof p.name === 'string') proxyNames.add(p.name)
      })
      if (Array.isArray(cfg['proxy-groups'])) {
        cfg['proxy-groups'] = cfg['proxy-groups'].map((group: any) => {
          if (Array.isArray(group.proxies)) {
            group.proxies = group.proxies.filter((name: any) =>
              proxyNames.has(name),
            )
          }
          // если default не валиден — установить null или первый доступный
          if (group.default && !group.proxies.includes(group.default)) {
            group.default = group.proxies[0] || null
          }
          return group
        })
      }
      return yaml.dump(cfg, { indent: 2 })
    }

    case 'base64': {
      let decoded: string
      try {
        decoded = Buffer.from(body, 'base64').toString()
      } catch {
        throw new Error('Invalid base64 string')
      }
      const lines = decoded.split(/\r?\n/).filter(Boolean)
      const filtered = lines.filter((line) => {
        const host = extractHostFromString(line)
        return matchHost(host, servers)
      })
      const outStr = filtered.join('\n')
      return Buffer.from(outStr).toString('base64')
    }

    default:
      throw new Error(`Unknown format: ${format}`)
  }
}
