export function isRtl(arr: (string | undefined)[]) {
  const rtlRegex =
    /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/
  return arr.some((str) => str.trim() !== '' && rtlRegex.test(str))
}
