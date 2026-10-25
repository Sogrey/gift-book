/** id 生成：时间有序 + 随机后缀 */

export function uid(prefix = ''): string {
  const t = Date.now().toString(36)
  const r = Math.random().toString(36).slice(2, 10)
  return `${prefix}${t}${r}`
}
