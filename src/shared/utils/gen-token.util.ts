export const genToken = () => {
  const timeStamp = new Date().getTime()
  const rand = () => Math.random().toString(36).substring(2)
  return rand() + timeStamp
}
