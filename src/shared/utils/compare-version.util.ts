/**
 * Сравнивает две версии строк в понятном и надёжном формате.
 *
 * Поддерживаемые возможности:
 * - Произвольное число числовых сегментов в основной части: `1.2`, `1.2.3.4` и т.д.
 * - Игнорирование build-метаданных (`+build`) — они не влияют на сравнение.
 * - Поддержка pre-release части после `-` (например `1.2.3-alpha.1`) с поведением,
 *   совместимым с SemVer по приоритету:
 *     - версия без pre-release > той же версии с pre-release
 *     - pre-release идентификаторы сравниваются последовательно:
 *         • числовые — как числа,
 *         • нечисловые — лексикографически (ASCII),
 *         • числовой идентификатор имеет меньший приоритет, чем нечисловой.
 * - Отсечение лишних завершающих нулей: `1.2` == `1.2.0`
 *
 * Возвращаемое значение:
 *  - отрицательное число — v1 < v2
 *  - 0 — v1 == v2
 *  - положительное число — v1 > v2
 *
 * Бросает TypeError, если основная часть версии содержит некорректные (нечисловые) сегменты.
 *
 * Примеры:
 * compareVersions("1.2.3", "1.2.4")        // <0
 * compareVersions("2.0.0", "1.9.9")        // >0
 * compareVersions("1.2", "1.2.0")          // 0
 * compareVersions("1.2.3-alpha", "1.2.3")  // <0
 * compareVersions("1.2.3-alpha.2", "1.2.3-alpha.10") // <0 (числовое сравнение)
 *
 * ⚠️ Замечание: функция поддерживает SemVer-подобное сравнение pre-release, но
 * не претендует на полную валидаторную проверку всех возможных нестандартных форм.
 */
export function compareVersions(v1: string, v2: string): number {
  const strip = (v: string) => v.trim()

  const splitIntoMainAndPre = (v: string) => {
    // убрать build metadata (+...)
    const [withoutBuild] = strip(v).split('+', 1)
    // разделяем на main и pre-release — только по первой дефисной границе
    const dashIndex = withoutBuild.indexOf('-')
    if (dashIndex === -1) {
      return { main: withoutBuild, pre: null }
    } else {
      return {
        main: withoutBuild.slice(0, dashIndex),
        pre: withoutBuild.slice(dashIndex + 1) || null,
      }
    }
  }

  const parseMain = (main: string) => {
    if (main === '') return [] as number[]
    const parts = main.split('.').map((s) => s.trim())
    const nums: number[] = parts.map((p) => {
      // основная часть должна быть числовой (SemVer-подобно)
      if (!/^\d+$/.test(p)) {
        throw new TypeError(
          `Invalid numeric segment in version main part: "${p}"`,
        )
      }
      // безопасный parseInt
      return Number.parseInt(p, 10)
    })
    // отрезаем правые нули, чтобы 1.2 и 1.2.0 считались равными
    let end = nums.length
    while (end > 0 && nums[end - 1] === 0) end--
    return nums.slice(0, end)
  }

  const parsePre = (pre: string | null) => {
    if (pre === null || pre === '') return null
    // pre-release может содержать точки: alpha.1.beta
    return pre.split('.').map((s) => s.trim())
  }

  const isNumericId = (id: string) => /^\d+$/.test(id)

  // main + pre для v1
  const { main: main1Raw, pre: pre1Raw } = splitIntoMainAndPre(v1)
  const { main: main2Raw, pre: pre2Raw } = splitIntoMainAndPre(v2)

  const mainA = parseMain(main1Raw)
  const mainB = parseMain(main2Raw)

  // Сравнение основной части (по числовым сегментам)
  const maxMainLen = Math.max(mainA.length, mainB.length)
  for (let i = 0; i < maxMainLen; i++) {
    const ai = i < mainA.length ? mainA[i] : 0
    const bi = i < mainB.length ? mainB[i] : 0
    if (ai !== bi) return ai - bi
  }

  // Основные части равны — сравниваем pre-release
  const preA = parsePre(pre1Raw)
  const preB = parsePre(pre2Raw)

  // Если обе pre отсутствуют — версии равны
  if (preA === null && preB === null) return 0
  // Версия без pre > версии с pre
  if (preA === null && preB !== null) return 1
  if (preA !== null && preB === null) return -1

  // Оба имеют pre-release — сравниваем идентификаторы по правилам SemVer-подобным
  const len = Math.max(preA!.length, preB!.length)
  for (let i = 0; i < len; i++) {
    const ida = i < preA!.length ? preA![i] : undefined
    const idb = i < preB!.length ? preB![i] : undefined

    if (ida === undefined && idb === undefined) return 0
    if (ida === undefined) return -1 // короче -> меньший приоритет
    if (idb === undefined) return 1

    const aIsNum = isNumericId(ida)
    const bIsNum = isNumericId(idb)

    if (aIsNum && bIsNum) {
      const na = Number.parseInt(ida, 10)
      const nb = Number.parseInt(idb, 10)
      if (na !== nb) return na - nb
      // если равны, продолжаем
    } else if (aIsNum && !bIsNum) {
      // числовой идентификатор имеет меньший приоритет, чем нечисловой
      return -1
    } else if (!aIsNum && bIsNum) {
      return 1
    } else {
      // оба нечисловые: лексикографическое сравнение по ASCII (детерминированно)
      const cmp = ida.localeCompare(idb, 'en', {
        numeric: false,
        sensitivity: 'variant',
      })
      if (cmp !== 0) return cmp
    }
  }

  // все идентификаторы равны
  return 0
}
