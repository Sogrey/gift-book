/** 台账 store：解锁、记录 CRUD、加密持久化、统计、跨页签同步、副屏广播 */
import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { Channel, EventData, EventMeta, GuestBroadcast, LedgerRecord } from '@/types'
import { deriveKey, verifyPassword, encryptWithKey, decryptWithKey, keyToHex, keyFromHex } from '@/lib/crypto'
import type { CrossTabBus } from '@/lib/bus'
import { bus } from '@/lib/bus'
import { uid } from '@/lib/id'
import { formatAmount, toChineseAmount } from '@/lib/amount'

const dataKeyOf = (id: string) => `gb:data:${id}`
const sessionKeyOf = (id: string) => `gb:session-key:${id}`

const DEFAULT_SETTINGS: EventData['settings'] = {
  voiceEnabled: true,
  guestPrivacy: false,
  showQr: false,
}

function maskName(name: string): string {
  if (name.length <= 1) return name
  if (name.length <= 3) return name[0] + '＊＊'
  return name.slice(0, 2) + '＊＊'
}

export const useLedgerStore = defineStore('ledger', () => {
  // ---------- 状态 ----------
  const meta = ref<EventMeta | null>(null)
  const records = ref<LedgerRecord[]>([])
  const settings = ref<EventData['settings']>({ ...DEFAULT_SETTINGS })
  const unlocked = ref(false)
  const keyHex = ref<string | null>(null)

  // ---------- 解锁 ----------
  function tryResume(meta_: EventMeta): boolean {
    const hex = sessionStorage.getItem(sessionKeyOf(meta_.id))
    if (!hex) return false
    try {
      loadWithKeyHex(meta_, hex)
      return true
    } catch {
      sessionStorage.removeItem(sessionKeyOf(meta_.id))
      return false
    }
  }

  function loadWithKeyHex(meta_: EventMeta, hex: string) {
    const key = keyFromHex(hex)
    const payload = localStorage.getItem(dataKeyOf(meta_.id))
    let data: EventData
    if (!payload) {
      data = { version: 1, records: [], settings: { ...DEFAULT_SETTINGS } }
    } else {
      const json = decryptWithKey(key, payload)
      data = JSON.parse(json) as EventData
      data.settings = { ...DEFAULT_SETTINGS, ...data.settings }
    }
    meta.value = meta_
    keyHex.value = hex
    records.value = data.records ?? []
    settings.value = data.settings
    unlocked.value = true
    sessionStorage.setItem(sessionKeyOf(meta_.id), hex)
  }

  function unlock(meta_: EventMeta, password: string): boolean {
    const dk = deriveKey(password, meta_.salt)
    if (!verifyPassword(dk, meta_.verifier)) return false
    loadWithKeyHex(meta_, keyToHex(dk.key))
    return true
  }

  function lock() {
    if (meta.value) sessionStorage.removeItem(sessionKeyOf(meta.value.id))
    meta.value = null
    records.value = []
    settings.value = { ...DEFAULT_SETTINGS }
    unlocked.value = false
    keyHex.value = null
  }

  // ---------- 持久化（AES） ----------
  let persistTimer: ReturnType<typeof setTimeout> | null = null
  function persist(immediate = false) {
    if (!meta.value || !keyHex.value) return
    const write = () => {
      if (!meta.value || !keyHex.value) return
      const data: EventData = { version: 1, records: records.value, settings: settings.value }
      try {
        const payload = encryptWithKey(JSON.stringify(data), keyFromHex(keyHex.value), meta.value.salt)
        localStorage.setItem(dataKeyOf(meta.value!.id), payload)
        broadcast()
      } catch (err) {
        console.error('[ledger] 持久化失败:', err)
      }
    }
    if (persistTimer) clearTimeout(persistTimer)
    if (immediate) write()
    else persistTimer = setTimeout(write, 150) // 节流：高频录入防抖
  }

  // ---------- 跨页签同步：他页签写入 → 本页签刷新 ----------
  function bindCrossTabSync(meta_: EventMeta) {
    const handler = (e: StorageEvent) => {
      if (e.key !== dataKeyOf(meta_.id) || !e.newValue) return
      if (!unlocked.value || !keyHex.value) return
      if (e.newValue === lastWrittenPayload) return // 自己的写入已由内存承载
      try {
        const json = decryptWithKey(keyFromHex(keyHex.value), e.newValue)
        const data = JSON.parse(json) as EventData
        records.value = data.records ?? []
        settings.value = { ...DEFAULT_SETTINGS, ...data.settings }
      } catch {
        /* 他页签可能尚未用相同密钥；忽略 */
      }
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }
  let lastWrittenPayload: string | null = null
  const _persistRaw = persist

  // ---------- 记录 CRUD ----------
  function findSameName(name: string): LedgerRecord | undefined {
    const n = name.trim()
    return records.value.find((r) => r.name === n && !r.voided)
  }

  function findSameAmount(amount: number): LedgerRecord | undefined {
    return records.value.find((r) => r.amount === amount && !r.voided)
  }

  function addRecord(input: { name: string; amount: number; channel: Channel; note?: string }): LedgerRecord {
    const now = Date.now()
    const rec: LedgerRecord = {
      id: uid('r'),
      name: input.name.trim(),
      amount: Math.round(input.amount * 100) / 100,
      channel: input.channel,
      note: input.note?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    }
    records.value.push(rec)
    persist()
    return rec
  }

  function updateRecord(id: string, patch: Partial<Pick<LedgerRecord, 'name' | 'amount' | 'channel' | 'note'>>) {
    const rec = records.value.find((r) => r.id === id)
    if (!rec) return
    Object.assign(rec, patch, { updatedAt: Date.now() })
    if (rec.note !== undefined && !rec.note.trim()) rec.note = undefined
    persist()
  }

  function toggleVoid(id: string) {
    const rec = records.value.find((r) => r.id === id)
    if (!rec) return
    rec.voided = !rec.voided
    rec.updatedAt = Date.now()
    persist()
  }

  function removeRecord(id: string) {
    records.value = records.value.filter((r) => r.id !== id)
    persist()
  }

  function updateSettings(patch: Partial<EventData['settings']>) {
    settings.value = { ...settings.value, ...patch }
    persist(true) // 设置类变更立即写 + 立即广播
  }

  // ---------- 统计 ----------
  const validRecords = computed(() => records.value.filter((r) => !r.voided))
  const totalCount = computed(() => validRecords.value.length)
  const totalAmount = computed(() => validRecords.value.reduce((s, r) => s + r.amount, 0))
  const todayCount = computed(() => {
    const today = new Date().toDateString()
    return validRecords.value.filter((r) => new Date(r.createdAt).toDateString() === today).length
  })
  const byChannel = computed(() => {
    const map = new Map<Channel, { count: number; amount: number }>([
      ['wechat', { count: 0, amount: 0 }],
      ['alipay', { count: 0, amount: 0 }],
      ['cash', { count: 0, amount: 0 }],
      ['other', { count: 0, amount: 0 }],
    ])
    for (const r of validRecords.value) {
      const cur = map.get(r.channel)!
      cur.count++
      cur.amount += r.amount
    }
    return [...map.entries()]
      .filter(([, v]) => v.count > 0)
      .map(([channel, v]) => ({ channel, ...v }))
  })
  const amountBuckets = computed(() => {
    const defs: { label: string; min: number; max: number }[] = [
      { label: '100 以下', min: 0, max: 100 },
      { label: '100-200', min: 100, max: 200 },
      { label: '200-500', min: 200, max: 500 },
      { label: '500-1000', min: 500, max: 1000 },
      { label: '1000-2000', min: 1000, max: 2000 },
      { label: '2000 以上', min: 2000, max: Infinity },
    ]
    return defs.map((d) => ({
      label: d.label,
      count: validRecords.value.filter((r) => r.amount >= d.min && r.amount < d.max).length,
    }))
  })
  const topGivers = computed(() =>
    [...validRecords.value].sort((a, b) => b.amount - a.amount).slice(0, 10),
  )
  const latestRecord = computed<LedgerRecord | null>(() => {
    const list = validRecords.value
    return list.length ? list[list.length - 1] : null
  })

  // ---------- 副屏广播 ----------
  function buildBroadcast(): GuestBroadcast {
    const privacy = settings.value.guestPrivacy
    const lite = (r: LedgerRecord, isLatest: boolean) => ({
      name: privacy && !isLatest ? maskName(r.name) : r.name,
      amountText: privacy && !isLatest ? '***' : formatAmount(r.amount),
      time: r.createdAt,
    })
    const latest = latestRecord.value
    const idx = latest ? records.value.findIndex((r) => r.id === latest.id) : -1
    return {
      type: 'ledger.update',
      eventId: meta.value!.id,
      event: { name: meta.value!.name, kind: meta.value!.kind },
      latest: latest ? { ...lite(latest, true), index: idx } : null,
      snapshot: {
        totalCount: totalCount.value,
        totalAmountText: privacy ? '***' : formatAmount(totalAmount.value),
        records: [...validRecords.value]
          .slice(-40)
          .reverse()
          .map((r) => lite(r, r.id === latest?.id)),
      },
      screen: {
        kind: meta.value!.kind,
        privacy,
        showQr: settings.value.showQr,
        qrWechat: settings.value.qrWechat,
        qrAlipay: settings.value.qrAlipay,
        notice: settings.value.guestNotice,
      },
    }
  }

  function broadcast() {
    if (!meta.value) return
    const msg = buildBroadcast()
    lastWrittenPayload = null
    bus.emit('ledger.update', msg)
  }

  /** 副屏上线问好 → 主屏立即推全量 */
  function bindGuestHello(): () => void {
    return bus.on('ledger.hello', (payload: { eventId?: string }) => {
      if (!meta.value) return
      if (payload?.eventId && payload.eventId !== meta.value.id) return
      bus.emit('ledger.update', buildBroadcast())
    })
  }

  /** 记录总变化 → 广播（含 latest 用于副屏大字动画） */
  watch(
    () => records.value.length + String(settings.value.guestPrivacy) + String(settings.value.showQr),
    () => { /* persist 已带广播 */ },
  )

  return {
    meta,
    records,
    settings,
    unlocked,
    keyHex,
    tryResume,
    unlock,
    lock,
    bindCrossTabSync,
    findSameName,
    findSameAmount,
    addRecord,
    updateRecord,
    toggleVoid,
    removeRecord,
    updateSettings,
    persist,
    validRecords,
    totalCount,
    totalAmount,
    todayCount,
    byChannel,
    amountBuckets,
    topGivers,
    latestRecord,
    broadcast,
    bindGuestHello,
    toChineseAmount,
  }
})

export type LedgerStore = ReturnType<typeof useLedgerStore>
export type { CrossTabBus }
