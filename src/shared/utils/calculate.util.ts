export function percentDifference(oldValue: number, newValue: number): number {
  if (oldValue === 0) {
    return newValue === 0 ? 0 : Infinity // чтобы избежать деления на 0
  }
  return ((newValue - oldValue) / oldValue) * 100
}

export function roundUp(value: number, decimals: number = 5) {
  const factor = Math.pow(10, decimals)
  return Math.ceil(value * factor) / factor
}

export function roundingUpPrice(n: number): number {
  const rounding = Math.ceil(n)
  return rounding < 1 ? 1 : rounding
}
