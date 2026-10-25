/** 跨页签事件总线：BroadcastChannel 主通道 + localStorage storage 事件兜底。
 *  覆盖三种场景：dev/部署同源页签（BroadcastChannel 可用）、
 *  file:// 双击打开（部分浏览器 BroadcastChannel 受限 → storage 兜底）、
 *  旧浏览器降级。
 */

type Handler<T = unknown> = (payload: T) => void

const CHANNEL_NAME = 'gift-book-vue-bus'
const STORAGE_PREFIX = 'gb-bus:'

export class CrossTabBus {
  private bc: BroadcastChannel | null = null
  private handlers = new Map<string, Set<Handler>>()

  constructor() {
    if ('BroadcastChannel' in window) {
      try {
        this.bc = new BroadcastChannel(CHANNEL_NAME)
        this.bc.onmessage = (e) => this.dispatch(e.data?.type, e.data?.payload)
      } catch {
        this.bc = null
      }
    }
    window.addEventListener('storage', (e) => {
      if (!e.key || !e.key.startsWith(STORAGE_PREFIX) || !e.newValue) return
      try {
        const msg = JSON.parse(e.newValue)
        this.dispatch(msg.type, msg.payload)
      } catch {
        /* ignore */
      }
    })
    window.addEventListener('beforeunload', () => {
      // 清理本页签遗留的兜底消息标记
      this.cleanupEcho()
    })
  }

  private dispatch(type: string | undefined, payload: unknown) {
    if (!type) return
    this.handlers.get(type)?.forEach((h) => {
      try {
        h(payload)
      } catch (err) {
        console.error('[bus] handler error:', err)
      }
    })
  }

  on<T>(type: string, handler: Handler<T>): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set())
    this.handlers.get(type)!.add(handler as Handler)
    return () => {
      this.handlers.get(type)?.delete(handler as Handler)
    }
  }

  /** 发布：双通道同时发。BroadcastChannel 不触发本页，storage 也不回发本页，天然无回声。 */
  emit(type: string, payload?: unknown) {
    if (this.bc) {
      try {
        this.bc.postMessage({ type, payload })
      } catch {
        /* fallthrough */
      }
    }
    // storage 兜底（同源跨页签触发 storage 事件）
    try {
      const key = STORAGE_PREFIX + type
      localStorage.setItem(key, JSON.stringify({ type, payload, t: Date.now() }))
    } catch {
      /* quota 满时忽略 */
    }
  }

  /** 清掉兜底残留（避免长时间堆积） */
  private cleanupEcho() {
    try {
      const keys: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && k.startsWith(STORAGE_PREFIX)) keys.push(k)
      }
      keys.forEach((k) => localStorage.removeItem(k))
    } catch {
      /* ignore */
    }
  }
}

export const bus = new CrossTabBus()
