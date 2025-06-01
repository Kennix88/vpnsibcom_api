export function compareVersions(v1: string, v2: string): number {
  const toNums = (v: string) => v.split('.').map(Number)
  const [a1, a2, a3] = toNums(v1)
  const [b1, b2, b3] = toNums(v2)
  if (a1 !== b1) return a1 - b1
  if (a2 !== b2) return (a2 || 0) - (b2 || 0)
  return (a3 || 0) - (b3 || 0)
}
