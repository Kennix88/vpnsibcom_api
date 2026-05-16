export interface ParseStartParamResult {
  none: string[]
  params: Record<string, string>
}

const TGR_PARAM_REGEXP = /^_tgr_([\w-]+)$/
const KEY_VALUE_REGEXP = /(?:^|_)([a-zA-Z][a-zA-Z0-9]*)-/g

export function parseStartParamUtil(value: string): ParseStartParamResult {
  const result: ParseStartParamResult = {
    none: [],
    params: {},
  }
  const noneValues = result.none

  if (!value || typeof value !== 'string') {
    return result
  }

  const normalizedValue = value.trim()
  const tgrMatch = normalizedValue.match(TGR_PARAM_REGEXP)

  if (tgrMatch) {
    result.params.tgr = tgrMatch[1]
    return result
  }

  const matches = Array.from(normalizedValue.matchAll(KEY_VALUE_REGEXP))
  if (matches.length === 0) {
    noneValues.push(normalizedValue)
    return result
  }

  const pushNoneChunk = (chunk: string) => {
    const trimmed = chunk.trim()
    if (!trimmed) return

    for (const part of trimmed.split('_')) {
      const normalizedPart = part.trim()
      if (normalizedPart) noneValues.push(normalizedPart)
    }
  }

  const firstMatchIndex = matches[0].index ?? 0
  if (firstMatchIndex > 0) {
    pushNoneChunk(normalizedValue.slice(0, firstMatchIndex))
  }

  for (let i = 0; i < matches.length; i++) {
    const current = matches[i]
    const next = matches[i + 1]
    const key = current[1]

    const rawStartIndex = current.index ?? 0
    const valueStartIndex = rawStartIndex + current[0].length
    const valueEndIndex = next?.index ?? normalizedValue.length
    const chunkValue = normalizedValue.slice(valueStartIndex, valueEndIndex)

    if (!key || !chunkValue) {
      noneValues.push(normalizedValue.slice(rawStartIndex, valueEndIndex))
      continue
    }

    result.params[key] = chunkValue

    if (next) {
      const nextStartIndex = next.index ?? valueEndIndex
      const betweenChunk = normalizedValue.slice(valueEndIndex, nextStartIndex)
      pushNoneChunk(betweenChunk)
    }
  }

  return result
}

export function extractReferralKey(value: string): string | null {
  const parsed = parseStartParamUtil(value)
  if (parsed.params.r?.trim()) return parsed.params.r.trim()

  return value.match(/(?:^|_)r-([a-zA-Z0-9_-]+)(?:_|$)/)?.[1] ?? null
}
