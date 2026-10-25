/**
 * 金额工具：中文大写（礼簿书面用）、口语读法（语音播报用）、千分位
 */

const DIGITS = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖']
const SECTIONS = ['', '拾', '佰', '仟']
const BIG_SECTIONS = ['', '万', '亿', '万亿']

/** 转大写金额：800 → 捌佰元整；8666.66 → 捌仟陆佰陆拾陆元陆角陆分 */
export function toChineseAmount(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) return ''
  if (amount === 0) return '零元整'

  let n = Math.round(amount * 100) // 分
  const fen = n % 10
  const jiao = Math.floor(n / 10) % 10
  const yuan = Math.floor(n / 100)

  if (yuan === 0) {
    if (jiao === 0 && fen === 0) return '零元整'
    let s = ''
    if (jiao > 0) s += DIGITS[jiao] + '角'
    else if (fen > 0) s += '零'
    if (fen > 0) s += DIGITS[fen] + '分'
    return s
  }

  let yuanStr = ''
  let rest = yuan
  let sectionIdx = 0
  while (rest > 0) {
    const section = rest % 10000
    rest = Math.floor(rest / 10000)
    if (section > 0) {
      let s = ''
      let zeroPending = false
      let sec = section
      for (let i = 0; i < 4; i++) {
        const d = sec % 10
        sec = Math.floor(sec / 10)
        if (d === 0) {
          if (s) zeroPending = true
        } else {
          if (zeroPending) s = '零' + s
          s = DIGITS[d] + SECTIONS[i] + s
          zeroPending = false
        }
      }
      yuanStr = s + BIG_SECTIONS[sectionIdx] + yuanStr
    } else if (yuanStr) {
      // 万段为 0 且已有低位段 → 补零（如 一亿零三万）
      if (rest > 0) yuanStr = '零' + yuanStr
    }
    sectionIdx++
  }

  let result = yuanStr + '元'
  if (jiao === 0 && fen === 0) {
    result += '整'
  } else {
    if (jiao > 0) result += DIGITS[jiao] + '角'
    else if (fen > 0) result += '零'
    if (fen > 0) result += DIGITS[fen] + '分'
  }
  return result
}

/** 口语读法（语音播报用）：800 → 八百；8666 → 八千六百六十六 */
export function toSpokenNumber(n: number): string {
  const spokenDigits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']
  const spokenSecs = ['', '十', '百', '千']
  const spokenBigs = ['', '万', '亿']
  if (!Number.isFinite(n) || n < 0) return ''
  const int = Math.floor(n)
  if (int === 0) return '零'
  let rest = int
  let out = ''
  let bigIdx = 0
  while (rest > 0) {
    const section = rest % 10000
    rest = Math.floor(rest / 10000)
    if (section > 0) {
      let s = ''
      let zeroPending = false
      let sec = section
      for (let i = 0; i < 4; i++) {
        const d = sec % 10
        sec = Math.floor(sec / 10)
        if (d === 0) {
          if (s) zeroPending = true
        } else {
          if (zeroPending) s = '零' + s
          s = spokenDigits[d] + (i > 0 ? spokenSecs[i] : '') + s
          zeroPending = false
        }
      }
      // 口语：10~19 读“十X”而非“一十X”
      if (section < 20 && section >= 10 && bigIdx === 0 && s.startsWith('一十')) s = s.slice(1)
      out = s + spokenBigs[bigIdx] + out
    } else if (out) {
      if (rest > 0) out = '零' + out
    }
    bigIdx++
  }
  return out
}

/** 语音播报金额：800 → 八百元；1234.5 → 一千二百三十四元五角 */
export function toSpokenAmount(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) return ''
  const fen = Math.round(amount * 100)
  const jiao = Math.floor(fen / 10) % 10
  const cent = fen % 10
  const yuan = Math.floor(fen / 100)
  let s = toSpokenNumber(yuan) + '元'
  if (jiao > 0) s += toSpokenNumber(jiao) + '角'
  if (cent > 0) s += toSpokenNumber(cent) + '分'
  if (jiao === 0 && cent === 0) s = toSpokenNumber(yuan) + '元整'
  return s
}

/** 千分位：12345.6 → 12,345.60 */
export function formatAmount(n: number): string {
  return (n ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** 人民币格式：￥12,345.60 */
export function formatRMB(n: number): string {
  return '￥' + formatAmount(n)
}

/** 时间戳 → 本地时间串 */
export function formatTime(ts: number): string {
  const d = new Date(ts)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 时间戳 → HH:mm */
export function formatClock(ts: number): string {
  const d = new Date(ts)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}
