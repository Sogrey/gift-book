/** 语音播报（Web Speech API，零依赖；对齐原项目“语音核对”能力） */

let cachedVoice: SpeechSynthesisVoice | null = null

function pickVoice(): SpeechSynthesisVoice | null {
  if (!('speechSynthesis' in window)) return null
  if (cachedVoice) return cachedVoice
  const voices = window.speechSynthesis.getVoices()
  cachedVoice =
    voices.find((v) => v.lang === 'zh-CN' && /female|女|Xiaoxiao|Huihui/i.test(v.name)) ||
    voices.find((v) => v.lang?.startsWith('zh')) ||
    null
  return cachedVoice
}

// voices 异步加载
if ('speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoice = null
    pickVoice()
  }
}

/** 播报文本；返回是否可用 */
export function speak(text: string, options?: { rate?: number }): boolean {
  if (!('speechSynthesis' in window)) return false
  try {
    window.speechSynthesis.cancel()
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = 'zh-CN'
    utter.rate = options?.rate ?? 1.05
    utter.pitch = 1
    const voice = pickVoice()
    if (voice) utter.voice = voice
    window.speechSynthesis.speak(utter)
    return true
  } catch {
    return false
  }
}

export function stopSpeaking(): void {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
}
