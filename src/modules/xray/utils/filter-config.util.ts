import * as yaml from 'js-yaml'

type ConfigFormat = 'json' | 'sing-box' | 'clash' | 'base64'

/**
 * Фильтрует конфигурацию по списку серверов.
 * @param format - тип формата ("json", "sing-box", "clash", "base64")
 * @param body - строка конфигурации в указанном формате
 * @param servers - список серверных имен или подстрок, которые нужно оставить
 * @returns - отфильтрованная конфигурация в виде строки
 */
export function filterConfig(
  format: ConfigFormat,
  body: string,
  servers: string[],
): string {
  // Если список серверов пуст, возвращаем исходную строку без изменений
  if (servers.length === 0) {
    if (format == 'base64') return body
    else return JSON.stringify(JSON.parse(JSON.stringify(body)), null, 2)
  }

  switch (format) {
    case 'sing-box': {
      // Парсим строку как JSON
      let cfg: any
      try {
        cfg = JSON.parse(JSON.stringify(body))
      } catch {
        throw new Error('Invalid JSON for sing-box format')
      }
      // Проверяем массив outbounds
      if (!Array.isArray(cfg.outbounds)) {
        return JSON.stringify(cfg, null, 2)
      }
      // Фильтруем основные outbounds по полю server или по типу selector/urltest
      const filteredOutbounds = cfg.outbounds.filter((out: any) => {
        if (typeof out.server === 'string') {
          return servers.some((s) => out.server.includes(s))
        }
        return out.type === 'selector' || out.type === 'urltest'
      })
      // Собираем теги оставленных outbounds
      const allowedTags = filteredOutbounds
        .map((out: any) => out.tag)
        .filter(Boolean)
      // Фильтруем списки в селекторах и urltest
      filteredOutbounds.forEach((out: any) => {
        if (
          (out.type === 'selector' || out.type === 'urltest') &&
          Array.isArray(out.outbounds)
        ) {
          out.outbounds = out.outbounds.filter((tag: string) =>
            allowedTags.includes(tag),
          )
          // Если default-tag больше не валиден, берём первый из оставшихся
          if (out.default && !out.outbounds.includes(out.default)) {
            out.default = out.outbounds[0] || null
          }
        }
      })
      cfg.outbounds = filteredOutbounds
      return JSON.stringify(cfg, null, 2)
    }

    case 'json': {
      // Парсим как JSON-массив
      let arr: any
      try {
        arr = JSON.parse(JSON.stringify(body))
      } catch {
        throw new Error('Invalid JSON')
      }
      if (!Array.isArray(arr)) {
        return JSON.stringify(arr, null, 2)
      }
      // Фильтруем каждый объект по адресу из outbounds[0].settings.vnext[0].address
      const filtered = arr.filter((obj) => {
        const addr = obj.outbounds?.[0]?.settings?.vnext?.[0]?.address
        return typeof addr === 'string' && servers.some((s) => addr.includes(s))
      })
      return JSON.stringify(filtered, null, 2)
    }

    case 'clash': {
      // Парсим YAML (Clash конфиг)
      let cfg: any
      try {
        cfg = yaml.load(body)
      } catch {
        throw new Error('Invalid YAML for clash format')
      }
      // Фильтруем раздел proxies
      if (Array.isArray(cfg.proxies)) {
        cfg.proxies = cfg.proxies.filter((proxy: any) => {
          return (
            typeof proxy.server === 'string' &&
            servers.some((s) => proxy.server.includes(s))
          )
        })
      }
      // Собираем имена оставленных прокси
      const proxyNames = new Set<string>()
      ;(cfg.proxies || []).forEach((proxy: any) => {
        if (typeof proxy.name === 'string') {
          proxyNames.add(proxy.name)
        }
      })
      // Фильтруем proxy-groups
      if (Array.isArray(cfg['proxy-groups'])) {
        cfg['proxy-groups'] = cfg['proxy-groups'].map((group: any) => {
          if (Array.isArray(group.proxies)) {
            group.proxies = group.proxies.filter((name: any) =>
              proxyNames.has(name),
            )
          }
          return group
        })
      }
      // Сериализуем YAML с отступом 2
      return yaml.dump(cfg, { indent: 2 })
    }

    case 'base64': {
      // Декодируем из base64
      let decoded: string
      try {
        decoded = Buffer.from(body, 'base64').toString()
      } catch {
        throw new Error('Invalid base64 string')
      }
      // Фильтруем строки протокола vless://...@<server>
      const lines = decoded.split(/\r?\n/).filter((line) => {
        const match = line.match(/^[^@]+@([^:]+)/)
        return match !== null && servers.some((s) => match[1].includes(s))
      })
      const outStr = lines.join('\n')
      return Buffer.from(outStr).toString('base64')
    }

    default:
      throw new Error(`Unknown format: ${format}`)
  }
}
