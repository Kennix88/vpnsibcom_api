export interface ParseStartParamResult {
  none: string[]
  params: Record<string, string>
}

const TGR_PARAM_REGEXP = /^_tgr_([\w-]+)$/

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

  const chunks = normalizedValue.split('_').filter(Boolean)

  for (const chunk of chunks) {
    const dashIndex = chunk.indexOf('-')

    if (dashIndex <= 0 || dashIndex === chunk.length - 1) {
      noneValues.push(chunk)
      continue
    }

    const key = chunk.slice(0, dashIndex)
    const chunkValue = chunk.slice(dashIndex + 1)

    if (!key || !chunkValue) {
      noneValues.push(chunk)
      continue
    }

    result.params[key] = chunkValue
  }

  return result
}
