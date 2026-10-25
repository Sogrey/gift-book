/** Excel 导出（SheetJS） */
import * as XLSX from 'xlsx'
import type { LedgerRecord } from '@/types'
import { CHANNELS } from '@/types'
import { formatTime, toChineseAmount } from './amount'

export function exportExcel(eventName: string, records: LedgerRecord[], dateStr?: string) {
  const head = ['序号', '姓名', '礼金(元)', '大写', '渠道', '备注', '录入时间', '状态']
  const rows = records.map((r, i) => [
    i + 1,
    r.name,
    r.amount,
    toChineseAmount(r.amount),
    CHANNELS.find((c) => c.key === r.channel)?.label ?? '其他',
    r.note ?? '',
    formatTime(r.createdAt),
    r.voided ? '已作废' : '有效',
  ])

  const aoa = [head, ...rows]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [
    { wch: 6 },
    { wch: 12 },
    { wch: 12 },
    { wch: 22 },
    { wch: 10 },
    { wch: 20 },
    { wch: 19 },
    { wch: 8 },
  ]

  // 合计行
  const valid = records.filter((r) => !r.voided)
  const total = valid.reduce((s, r) => s + r.amount, 0)
  XLSX.utils.sheet_add_aoa(ws, [['', '合计（有效）', total, toChineseAmount(total), '', '', '', `${valid.length} 笔`]], {
    origin: -1 as unknown as XLSX.CellAddress,
  })

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '礼簿')
  const stamp = (dateStr || new Date().toISOString().slice(0, 10)).replace(/[^\d]/g, '')
  XLSX.writeFile(wb, `礼簿_${eventName}_${stamp}.xlsx`)
}
