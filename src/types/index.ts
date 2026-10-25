/** 礼金收取渠道 */
export type Channel = 'wechat' | 'alipay' | 'cash' | 'other'

export const CHANNELS: { key: Channel; label: string }[] = [
  { key: 'wechat', label: '微信' },
  { key: 'alipay', label: '支付宝' },
  { key: 'cash', label: '现金' },
  { key: 'other', label: '其他' },
]

/** 事项类型：红事 / 白事（决定主题氛围） */
export type EventKind = 'red' | 'white'

/** 礼簿单条记录 */
export interface LedgerRecord {
  id: string
  /** 姓名 */
  name: string
  /** 金额（元，两位小数） */
  amount: number
  /** 渠道 */
  channel: Channel
  /** 备注（如 “张三家”、“李四之子”） */
  note?: string
  /** 录入时间戳 ms */
  createdAt: number
  /** 最后修改时间戳 ms */
  updatedAt: number
  /** 作废标记（保留痕迹，不参与统计与 PDF） */
  voided?: boolean
}

/** 事项元信息（明文存 localStorage，用于首页列表；不含任何记录数据） */
export interface EventMeta {
  id: string
  /** 事项名称，如 “陈府迎宾宴” */
  name: string
  kind: EventKind
  /** 创建时间 ms */
  createdAt: number
  /** 事项日期（用于封面落款），格式 YYYY-MM-DD */
  date?: string
  /** PBKDF2 盐（hex） */
  salt: string
  /** 用派生密钥加密固定口令的密文（hex），密码正确则可解密 —— verifier */
  verifier: string
}

/** 事项内加密存储的数据体 */
export interface EventData {
  version: 1
  records: LedgerRecord[]
  settings: EventSettings
}

export interface EventSettings {
  /** 语音播报开关 */
  voiceEnabled: boolean
  /** 副屏隐私模式：隐藏非最新记录的姓名与金额 */
  guestPrivacy: boolean
  /** 副屏显示收款码 */
  showQr: boolean
  /** 微信收款码（dataURL） */
  qrWechat?: string
  /** 支付宝收款码（dataURL） */
  qrAlipay?: string
  /** 副屏自定义公告文字 */
  guestNotice?: string
  /** 记账人（PDF 落款） */
  recorder?: string
  /** PDF 封面图（dataURL） */
  coverImage?: string
}

/** 加密备份文件结构（.giftbook.json） */
export interface BackupFile {
  app: 'gift-book-vue'
  version: 1
  exportedAt: number
  meta: Pick<EventMeta, 'name' | 'kind' | 'createdAt' | 'date' | 'salt' | 'verifier'>
  /** AES-256-CBC 加密的 EventData，hex：salt|iv|cipher 由 crypto 模块拼接 */
  payload: string
}

/** 副屏广播消息 */
export interface GuestBroadcast {
  type: 'ledger.update' | 'ledger.hello' | 'ledger.close'
  eventId: string
  /** 事项展示信息 */
  event?: { name: string; kind: EventKind }
  /** 最新一笔（明文展示层，主屏已按隐私策略脱敏） */
  latest?: {
    name: string
    amountText: string
    time: number
    index: number
  } | null
  /** 礼簿列表快照（已脱敏） */
  snapshot?: {
    totalCount: number
    totalAmountText: string
    records: { name: string; amountText: string; upper: string; time: number }[]
  }
  /** 副屏展示设置 */
  screen?: {
    kind: EventKind
    privacy: boolean
    showQr: boolean
    qrWechat?: string
    qrAlipay?: string
    notice?: string
  }
}
