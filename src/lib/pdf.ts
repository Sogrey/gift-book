/**
 * PDF 礼簿引擎（pdf-lib + fontkit）
 * 版式复刻传统纸质礼簿：A4 横向、每页 12 个竖排格 ——
 * 上：毛笔竖排姓名；中：「贺礼」题字；下：中文大写礼金 + 阿拉伯数字。
 * 附：封面（可上传）、总计页（渠道汇总 + 记账人落款）、备注附录、封底。
 */
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import type { EventKind, LedgerRecord } from '@/types'
import { CHANNELS } from '@/types'
import { formatRMB } from './amount'

const A4_LANDSCAPE: [number, number] = [841.89, 595.28]
const ITEMS_PER_PAGE = 12

export interface PdfOptions {
  title: string
  subtitle: string
  kind: EventKind
  recorder?: string
  /** dataURL 封面图 */
  coverImage?: string
  /** dataURL 封底图 */
  backCoverImage?: string
  showCover?: boolean
}

/* ---------- 字体加载（public/fonts，按需拉取） ---------- */
async function fetchBinary(path: string): Promise<Uint8Array> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`字体资源加载失败: ${path} (${res.status})`)
  return new Uint8Array(await res.arrayBuffer())
}

async function dataUrlToBytes(dataUrl: string): Promise<Uint8Array> {
  const base64 = dataUrl.split(',')[1]
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

/* ---------- 颜色 ---------- */
function themeColors(kind: EventKind) {
  return kind === 'white'
    ? { primary: rgb(0.28, 0.32, 0.41), ink: rgb(0.13, 0.16, 0.22), frame: rgb(0.42, 0.47, 0.56) }
    : { primary: rgb(0.80, 0.07, 0.07), ink: rgb(0.25, 0.15, 0.12), frame: rgb(0.93, 0.26, 0.22) }
}

/* ---------- 竖排文本绘制（自适应字号，最多 3 列） ---------- */
interface VerticalTextOptions {
  x: number
  y: number
  cellWidth: number
  cellHeight: number
  initialFontSize: number
  minFontSize: number
  color: ReturnType<typeof rgb>
  letterSpacing: number
}

function drawVerticalText(page: PDFPage, text: string, font: PDFFont, opt: VerticalTextOptions) {
  const { x, y, cellWidth, cellHeight, initialFontSize, minFontSize, color, letterSpacing } = opt
  const chars = [...text]
  if (!chars.length) return

  const calcHeight = (n: number, fs: number) => n * (fs + letterSpacing) - (n > 0 ? letterSpacing : 0)
  const calcWidth = (cols: number, fs: number) => cols * fs + (cols - 1) * letterSpacing

  const cellW90 = cellWidth * 0.9
  const cellH90 = cellHeight * 0.9

  const charHeight = initialFontSize + letterSpacing
  const maxCharsPerCol = Math.max(1, Math.floor((cellH90 + letterSpacing) / charHeight))
  const neededCols = Math.ceil(chars.length / maxCharsPerCol)

  let finalColCount: number
  let fontSize = initialFontSize
  if (neededCols === 1) {
    finalColCount = 1
    while (fontSize >= minFontSize) {
      if (calcHeight(chars.length, fontSize) <= cellH90 && calcWidth(1, fontSize) <= cellW90) break
      fontSize -= 0.5
    }
  } else {
    finalColCount = Math.min(3, neededCols)
    while (fontSize >= minFontSize) {
      const perCol = Math.ceil(chars.length / finalColCount)
      if (calcHeight(perCol, fontSize) <= cellH90 && calcWidth(finalColCount, fontSize) <= cellW90) break
      fontSize -= 0.5
    }
  }
  if (fontSize < minFontSize) fontSize = minFontSize

  const perColDraw = Math.ceil(chars.length / finalColCount)
  const blockWidth = calcWidth(finalColCount, fontSize)
  const blockLeft = x + (cellWidth - blockWidth) / 2

  for (let c = 0; c < finalColCount; c++) {
    const colChars = chars.slice(c * perColDraw, (c + 1) * perColDraw)
    if (!colChars.length) continue
    const colTop = y + cellHeight - (cellHeight - colChars.length * (fontSize + letterSpacing) + letterSpacing) / 2
    colChars.forEach((ch, r) => {
      const chWidth = font.widthOfTextAtSize(ch, fontSize)
      page.drawText(ch, {
        x: blockLeft + c * (fontSize + letterSpacing) + (fontSize - chWidth) / 2,
        y: colTop - r * (fontSize + letterSpacing) - fontSize,
        size: fontSize,
        font,
        color,
      })
    })
  }
}

/** 横排自适应宽度文本 */
function drawHorizontalText(
  page: PDFPage,
  text: string,
  font: PDFFont,
  x: number,
  y: number,
  boxWidth: number,
  size: number,
  color: ReturnType<typeof rgb>,
) {
  let fontSize = size
  while (fontSize > 6 && font.widthOfTextAtSize(text, fontSize) > boxWidth) fontSize -= 0.5
  const w = font.widthOfTextAtSize(text, fontSize)
  page.drawText(text, { x: x + (boxWidth - w) / 2, y, size: fontSize, font, color })
}

/* ---------- 页脚 ---------- */
function drawFooter(
  page: PDFPage,
  font: PDFFont,
  texts: { left?: string; center?: string; right?: string },
  color: ReturnType<typeof rgb>,
) {
  const { width } = page.getSize()
  const y = 15
  const size = 10
  if (texts.left) page.drawText(texts.left, { x: 30, y, size, font, color })
  if (texts.center) {
    const w = font.widthOfTextAtSize(texts.center, size)
    page.drawText(texts.center, { x: (width - w) / 2, y, size, font, color })
  }
  if (texts.right) {
    const w = font.widthOfTextAtSize(texts.right, size)
    page.drawText(texts.right, { x: width - 30 - w, y, size, font, color })
  }
}

/* ---------- 传统礼簿内页（竖排 12 格） ---------- */
function addLedgerPages(
  doc: PDFDocument,
  fonts: { brush: PDFFont; serif: PDFFont },
  data: LedgerRecord[],
  chineseAmount: (n: number) => string,
  colors: { primary: ReturnType<typeof rgb>; ink: ReturnType<typeof rgb> },
) {
  const [pageW, pageH] = A4_LANDSCAPE
  const margin = { top: 30, bottom: 36, left: 30, right: 30 }
  const tableW = pageW - margin.left - margin.right
  const tableH = pageH - margin.top - margin.bottom
  const colW = tableW / ITEMS_PER_PAGE
  const giftLabelH = tableH * 0.14
  const nameH = (tableH - giftLabelH) / 2
  const amountH = nameH
  const numericH = 24
  const chineseAmountH = amountH - numericH
  const totalPages = Math.max(1, Math.ceil(data.length / ITEMS_PER_PAGE))

  for (let p = 0; p < totalPages; p++) {
    const page = doc.addPage(A4_LANDSCAPE)
    // 外框
    page.drawRectangle({
      x: margin.left,
      y: margin.bottom,
      width: tableW,
      height: tableH,
      borderColor: colors.primary,
      borderWidth: 2,
    })
    const line1Y = margin.bottom + amountH
    const line2Y = line1Y + giftLabelH
    page.drawLine({
      start: { x: margin.left, y: line1Y },
      end: { x: pageW - margin.right, y: line1Y },
      color: colors.primary,
      thickness: 1,
    })
    page.drawLine({
      start: { x: margin.left, y: line2Y },
      end: { x: pageW - margin.right, y: line2Y },
      color: colors.primary,
      thickness: 1,
    })
    for (let i = 1; i < ITEMS_PER_PAGE; i++) {
      const lx = margin.left + i * colW
      page.drawLine({ start: { x: lx, y: margin.bottom }, end: { x: lx, y: pageH - margin.top }, color: colors.primary, thickness: 0.75 })
    }

    const pageData = data.slice(p * ITEMS_PER_PAGE, (p + 1) * ITEMS_PER_PAGE)
    pageData.forEach((item, i) => {
      const colX = margin.left + i * colW
      // 2 字姓名加全角空格隔开（传统礼簿习惯）
      const displayName =
        item.name.length === 2 ? `${item.name[0]}\u3000${item.name[1]}` : item.name
      // 姓名（毛笔竖排）
      drawVerticalText(page, displayName, fonts.brush, {
        x: colX,
        y: line2Y,
        cellWidth: colW,
        cellHeight: nameH,
        initialFontSize: 24,
        minFontSize: 9,
        color: colors.ink,
        letterSpacing: 3,
      })
      // 「贺礼」题字
      drawVerticalText(page, '贺礼', fonts.brush, {
        x: colX,
        y: line1Y,
        cellWidth: colW,
        cellHeight: giftLabelH,
        initialFontSize: 16,
        minFontSize: 8,
        color: colors.primary,
        letterSpacing: 2,
      })
      // 中文大写（竖排）
      drawVerticalText(page, chineseAmount(item.amount), fonts.serif, {
        x: colX,
        y: margin.bottom + numericH,
        cellWidth: colW,
        cellHeight: chineseAmountH,
        initialFontSize: 14,
        minFontSize: 8,
        color: colors.ink,
        letterSpacing: 2,
      })
      // 数字金额（底部横排）
      drawHorizontalText(
        page,
        formatRMB(item.amount),
        fonts.serif,
        colX,
        margin.bottom + 7,
        colW,
        11,
        colors.ink,
      )
    })

    const subtotal = pageData.reduce((s, r) => s + r.amount, 0)
    drawFooter(page, fonts.serif, {
      left: `生成日期: ${new Date().toLocaleString('sv-SE')}`,
      center: `第 ${p + 1} 页 / 共 ${totalPages} 页`,
      right: `本页小计: ${formatRMB(subtotal)}`,
    }, colors.ink)
  }
}

/* ---------- 总计页 ---------- */
function addSummaryPage(
  doc: PDFDocument,
  serif: PDFFont,
  brush: PDFFont,
  records: LedgerRecord[],
  opt: PdfOptions,
  colors: { primary: ReturnType<typeof rgb>; ink: ReturnType<typeof rgb> },
) {
  const page = doc.addPage(A4_LANDSCAPE)
  const [pageW, pageH] = A4_LANDSCAPE
  const margin = { top: 80, bottom: 50, left: 120, right: 120 }

  const title = '总　计'
  const tw = brush.widthOfTextAtSize(title, 34)
  page.drawText(title, {
    x: (pageW - tw) / 2,
    y: pageH - margin.top,
    size: 34,
    font: brush,
    color: colors.primary,
  })

  const rows: [string, string, string][] = []
  for (const ch of CHANNELS) {
    const list = records.filter((r) => r.channel === ch.key)
    if (!list.length) continue
    rows.push([
      ch.label,
      `${list.length} 人`,
      formatRMB(list.reduce((s, r) => s + r.amount, 0)),
    ])
  }
  rows.push(['合　计', `${records.length} 人`, formatRMB(records.reduce((s, r) => s + r.amount, 0))])

  const tableW = pageW - margin.left - margin.right
  const colWs = [tableW * 0.34, tableW * 0.28, tableW * 0.38]
  const rowH = 42
  let cursorY = pageH - margin.top - 50

  // 表头
  const headers = ['送礼方式', '人数', '总金额']
  let cx = margin.left
  headers.forEach((h, i) => {
    page.drawText(h, {
      x: cx + (colWs[i] - serif.widthOfTextAtSize(h, 16)) / 2,
      y: cursorY - 14,
      size: 16,
      font: serif,
      color: colors.primary,
    })
    cx += colWs[i]
  })
  cursorY -= 28
  page.drawLine({
    start: { x: margin.left, y: cursorY },
    end: { x: margin.left + tableW, y: cursorY },
    color: colors.primary,
    thickness: 1.2,
  })

  rows.forEach((row) => {
    cx = margin.left
    row.forEach((cell, i) => {
      const isTotal = i === 2 && row[0].startsWith('合')
      page.drawText(cell, {
        x: cx + (colWs[i] - serif.widthOfTextAtSize(cell, 15)) / 2,
        y: cursorY - rowH / 2 - 8,
        size: isTotal ? 17 : 15,
        font: isTotal ? brush : serif,
        color: isTotal ? colors.primary : colors.ink,
      })
      cx += colWs[i]
    })
    cursorY -= rowH
    page.drawLine({
      start: { x: margin.left, y: cursorY },
      end: { x: margin.left + tableW, y: cursorY },
      color: colors.primary,
      thickness: 0.8,
    })
  })

  // 落款：记账人 + 事项日期
  let fy = cursorY - 70
  const lines: string[] = []
  if (opt.recorder) lines.push(`记账人：${opt.recorder}`)
  if (opt.subtitle) lines.push(opt.subtitle)
  for (const line of lines) {
    const lw = serif.widthOfTextAtSize(line, 18)
    page.drawText(line, { x: pageW - margin.right - lw - 30, y: fy, size: 18, font: serif, color: colors.ink })
    fy -= 36
  }

  drawFooter(page, serif, { center: `共 ${records.length} 笔 · ${formatRMB(records.reduce((s, r) => s + r.amount, 0))}` }, colors.ink)
}

/* ---------- 备注附录 ---------- */
function addRemarkPages(
  doc: PDFDocument,
  serif: PDFFont,
  records: LedgerRecord[],
  colors: { primary: ReturnType<typeof rgb>; ink: ReturnType<typeof rgb> },
) {
  const remarks = records
    .map((r, index) => ({
      name: r.name,
      remark: (r.note ?? '').trim(),
      position: `第${Math.floor(index / ITEMS_PER_PAGE) + 1}页第${(index % ITEMS_PER_PAGE) + 1}位`,
    }))
    .filter((r) => r.remark)
  if (!remarks.length) return

  const page = doc.addPage(A4_LANDSCAPE)
  const [pageW, pageH] = A4_LANDSCAPE
  const margin = { top: 80, bottom: 50, left: 80, right: 80 }
  const colWs = [140, 200, pageW - margin.left - margin.right - 340]

  const title = '附录 · 宾客备注'
  const tw = serif.widthOfTextAtSize(title, 26)
  page.drawText(title, { x: (pageW - tw) / 2, y: pageH - margin.top, size: 26, font: serif, color: colors.primary })

  let cursorY = pageH - margin.top - 40
  const tableW = colWs.reduce((a, b) => a + b, 0)

  const headers = ['姓名', '位置索引', '备注信息']
  let cx = margin.left
  headers.forEach((h, i) => {
    page.drawText(h, {
      x: cx + (colWs[i] - serif.widthOfTextAtSize(h, 14)) / 2,
      y: cursorY - 20,
      size: 14,
      font: serif,
      color: colors.primary,
    })
    cx += colWs[i]
  })
  cursorY -= 32
  page.drawLine({ start: { x: margin.left, y: cursorY }, end: { x: margin.left + tableW, y: cursorY }, color: colors.primary, thickness: 1.2 })

  remarks.forEach((row) => {
    const rowH = 30
    cx = margin.left
    ;[row.name, row.position, row.remark].forEach((cell, i) => {
      const text = String(cell)
      let out = text
      while (serif.widthOfTextAtSize(out, 12) > colWs[i] - 10 && out.length > 1) out = out.slice(0, -2) + '…'
      page.drawText(out, {
        x: cx + (colWs[i] - serif.widthOfTextAtSize(out, 12)) / 2,
        y: cursorY - rowH / 2 - 5,
        size: 12,
        font: serif,
        color: colors.ink,
      })
      cx += colWs[i]
    })
    cursorY -= rowH
    page.drawLine({ start: { x: margin.left, y: cursorY }, end: { x: margin.left + tableW, y: cursorY }, color: colors.primary, thickness: 0.8 })
  })

  drawFooter(page, serif, { center: '附录 第 1 页' }, colors.ink)
}

/* ---------- 封面 / 封底 ---------- */
async function addCoverPage(
  doc: PDFDocument,
  brush: PDFFont,
  serif: PDFFont,
  opt: PdfOptions,
  colors: { primary: ReturnType<typeof rgb>; ink: ReturnType<typeof rgb>; frame: ReturnType<typeof rgb> },
) {
  const page = doc.addPage(A4_LANDSCAPE)
  const [pageW, pageH] = A4_LANDSCAPE

  if (opt.coverImage) {
    try {
      const bytes = await dataUrlToBytes(opt.coverImage)
      const img = await doc.embedJpg(bytes).catch(() => doc.embedPng(bytes))
      page.drawImage(img, { x: 0, y: 0, width: pageW, height: pageH })
    } catch {
      /* 图片损坏则退化为矢量封面 */
    }
  }
  if (!opt.coverImage) {
    // 矢量仿古封面：底色 + 回纹边框 + 竖排题字
    page.drawRectangle({
      x: 0,
      y: 0,
      width: pageW,
      height: pageH,
      color: opt.kind === 'white' ? rgb(0.965, 0.97, 0.975) : rgb(0.99, 0.95, 0.93),
    })
    page.drawRectangle({
      x: 26,
      y: 26,
      width: pageW - 52,
      height: pageH - 52,
      borderColor: colors.frame,
      borderWidth: 2.5,
    })
    page.drawRectangle({
      x: 34,
      y: 34,
      width: pageW - 68,
      height: pageH - 68,
      borderColor: colors.frame,
      borderWidth: 0.8,
      opacity: 0.6,
    })
  }

  // 竖排大标题（居右偏中，仿古籍书封）
  const titleSize = 66
  const titleX = pageW / 2 + 120
  const chars = [...opt.title]
  chars.forEach((ch, i) => {
    const cw = brush.widthOfTextAtSize(ch, titleSize)
    page.drawText(ch, {
      x: titleX - cw / 2,
      y: pageH - 120 - i * (titleSize + 14),
      size: titleSize,
      font: brush,
      color: colors.primary,
    })
  })

  // 副题（事项名+日期）
  const subY = 90
  const sub = opt.subtitle
  const sw = serif.widthOfTextAtSize(sub, 20)
  page.drawText(sub, { x: titleX - sw / 2, y: subY, size: 20, font: serif, color: colors.ink })
}

/* ---------- 主入口 ---------- */
export async function generateGiftPdf(
  recordsRaw: LedgerRecord[],
  opt: PdfOptions,
  chineseAmount: (n: number) => string,
): Promise<Uint8Array> {
  const records = recordsRaw.filter((r) => !r.voided)
  if (!records.length) throw new Error('没有有效记录，无法生成礼簿')

  const [brushBytes, serifBytes] = await Promise.all([
    fetchBinary('./fonts/MaShanZheng-Regular.ttf'),
    fetchBinary('./fonts/SourceHanSerifCN-Regular.otf'),
  ])

  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const brush = await doc.embedFont(brushBytes, { subset: true })
  const serif = await doc.embedFont(serifBytes, { subset: true })
  const colors = themeColors(opt.kind)

  if (opt.showCover !== false) await addCoverPage(doc, brush, serif, opt, colors)
  addLedgerPages(doc, { brush, serif }, records, chineseAmount, colors)
  addSummaryPage(doc, serif, brush, records, opt, colors)
  addRemarkPages(doc, serif, records, colors)

  if (opt.backCoverImage) {
    try {
      const page = doc.addPage(A4_LANDSCAPE)
      const bytes = await dataUrlToBytes(opt.backCoverImage)
      const img = await doc.embedJpg(bytes).catch(() => doc.embedPng(bytes))
      page.drawImage(img, { x: 0, y: 0, width: A4_LANDSCAPE[0], height: A4_LANDSCAPE[1] })
    } catch {
      /* ignore */
    }
  }

  return doc.save()
}
