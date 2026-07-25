import ExcelJS from 'exceljs'
import { fmtMoney, fmtNum } from '@/lib/format'
import { properName } from '@/lib/properCase'
import type { ReportSpec, ReportMeta } from './reportExport'

const CHART_HUES = ['#0ea5e9', '#f59e0b', '#16a34a', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d']
function segColor(i: number, brand: string): string {
  return i === 0 ? brand : CHART_HUES[(i - 1) % CHART_HUES.length]
}

function resolveBrand(color?: string): string {
  const c = (color || '').trim()
  if (/^#?[0-9a-fA-F]{3,8}$/.test(c)) return c.startsWith('#') ? c : `#${c}`
  return '#4f46e5'
}

/** '#4f46e5' → 'FF4F46E5' (ExcelJS ARGB). */
function argb(hex: string): string {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return 'FF' + full.toUpperCase().slice(0, 6).padEnd(6, '0')
}

function stripDataUrl(dataUrl: string): string {
  const i = dataUrl.indexOf(',')
  return i >= 0 ? dataUrl.slice(i + 1) : dataUrl
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rad = Math.min(r, h / 2, w / 2)
  ctx.beginPath()
  ctx.moveTo(x + rad, y)
  ctx.arcTo(x + w, y, x + w, y + h, rad)
  ctx.arcTo(x + w, y + h, x, y + h, rad)
  ctx.arcTo(x, y + h, x, y, rad)
  ctx.arcTo(x, y, x + w, y, rad)
  ctx.closePath()
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text
  let t = text
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1)
  return t + '…'
}

/** Renders the report chart onto a canvas and returns a PNG data URL. */
function chartPng(spec: ReportSpec, brand: string, currency?: string): string | null {
  const data = (spec.chart ?? []).filter((d) => spec.chartKind === 'pie' ? d.value > 0 : true)
  if (data.length === 0) return null
  const fmt = (v: number) => (spec.chartMoney ? fmtMoney(v, currency || undefined) : fmtNum(v))
  const dpr = 2
  const W = 620
  const isPie = spec.chartKind === 'pie'
  const H = isPie
    ? Math.max(190, 52 + data.length * 24)
    : 52 + data.length * 30 + 12

  const canvas = document.createElement('canvas')
  canvas.width = W * dpr
  canvas.height = H * dpr
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.scale(dpr, dpr)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)

  ctx.fillStyle = '#0f172a'
  ctx.font = '700 14px system-ui, Segoe UI, sans-serif'
  ctx.textBaseline = 'middle'
  ctx.fillText(spec.chartTitle || (isPie ? 'Breakdown' : 'Overview'), 12, 20)

  if (isPie) {
    const total = data.reduce((s, d) => s + d.value, 0) || 1
    const cx = 96, cy = 40 + (H - 40) / 2, rOut = 62, rIn = 34
    let start = -Math.PI / 2
    data.forEach((d, i) => {
      const ang = (d.value / total) * Math.PI * 2
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.arc(cx, cy, rOut, start, start + ang)
      ctx.closePath()
      ctx.fillStyle = segColor(i, brand)
      ctx.fill()
      start += ang
    })
    ctx.beginPath()
    ctx.fillStyle = '#ffffff'
    ctx.arc(cx, cy, rIn, 0, Math.PI * 2)
    ctx.fill()
    // legend
    let ly = 48
    ctx.textBaseline = 'middle'
    data.forEach((d, i) => {
      const pct = Math.round((d.value / total) * 100)
      ctx.fillStyle = segColor(i, brand)
      roundRect(ctx, 184, ly - 6, 12, 12, 3)
      ctx.fill()
      ctx.fillStyle = '#334155'
      ctx.font = '400 12.5px system-ui, Segoe UI, sans-serif'
      const label = truncate(ctx, d.label, 220)
      ctx.fillText(label, 202, ly)
      ctx.fillStyle = '#0f172a'
      ctx.font = '600 12.5px system-ui, Segoe UI, sans-serif'
      ctx.textAlign = 'right'
      ctx.fillText(`${fmt(d.value)} · ${pct}%`, W - 14, ly)
      ctx.textAlign = 'left'
      ly += 24
    })
  } else {
    const max = Math.max(...data.map((d) => Math.abs(d.value)), 1)
    const labelW = 150, barX = 162, valW = 108
    const barMax = W - barX - valW - 14
    let y = 44
    data.forEach((d) => {
      ctx.fillStyle = '#334155'
      ctx.font = '400 12.5px system-ui, Segoe UI, sans-serif'
      ctx.textBaseline = 'middle'
      ctx.fillText(truncate(ctx, d.label, labelW - 8), 12, y + 10)
      // track
      ctx.fillStyle = '#eef2f7'
      roundRect(ctx, barX, y, barMax, 14, 7)
      ctx.fill()
      // bar
      const w = Math.max(3, (Math.abs(d.value) / max) * barMax)
      ctx.fillStyle = brand
      roundRect(ctx, barX, y, w, 14, 7)
      ctx.fill()
      // value
      ctx.fillStyle = '#0f172a'
      ctx.font = '600 12.5px system-ui, Segoe UI, sans-serif'
      ctx.textAlign = 'right'
      ctx.fillText(fmt(d.value), W - 14, y + 10)
      ctx.textAlign = 'left'
      y += 30
    })
  }
  return canvas.toDataURL('image/png')
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

/** School logo as PNG: uses the logo image when loadable, else an initials badge. */
async function logoPng(meta: ReportMeta, brand: string): Promise<string> {
  const size = 120
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  if (meta.logoUrl) {
    try {
      const img = await loadImage(meta.logoUrl)
      ctx.clearRect(0, 0, size, size)
      ctx.drawImage(img, 0, 0, size, size)
      return canvas.toDataURL('image/png')
    } catch {
      /* fall through to initials badge */
    }
  }
  ctx.fillStyle = brand
  roundRect(ctx, 0, 0, size, size, 22)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.font = '800 56px system-ui, Segoe UI, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText((meta.logoInitials || meta.schoolName || '?').slice(0, 3).toUpperCase(), size / 2, size / 2 + 4)
  return canvas.toDataURL('image/png')
}

function colWidth(spec: ReportSpec, colIdx: number): number {
  let max = spec.columns[colIdx]?.length ?? 8
  for (const r of spec.rows) max = Math.max(max, String(r[colIdx] ?? '').length)
  return Math.min(42, Math.max(10, max + 2))
}

/** Builds and downloads a real .xlsx workbook: branded logo, KPIs,
 *  an embedded chart image and the styled data table. */
export async function downloadReportXlsx(spec: ReportSpec, meta: ReportMeta): Promise<void> {
  const brand = resolveBrand(meta.brandColor)
  const wb = new ExcelJS.Workbook()
  wb.creator = properName(meta.schoolName)
  wb.created = new Date()
  const ws = wb.addWorksheet(spec.title.slice(0, 31), {
    views: [{ showGridLines: false }],
  })

  const nCols = spec.columns.length
  spec.columns.forEach((_, i) => { ws.getColumn(i + 1).width = colWidth(spec, i) })

  // ---- Header (title + logo) ----
  ws.mergeCells(1, 1, 1, Math.max(2, nCols))
  const titleCell = ws.getCell('A1')
  titleCell.value = properName(meta.schoolName)
  titleCell.font = { bold: true, size: 16, color: { argb: argb(brand) } }
  ws.getRow(1).height = 24

  ws.mergeCells(2, 1, 2, Math.max(2, nCols))
  const subCell = ws.getCell('A2')
  subCell.value = [meta.schoolCity, spec.title, meta.period].filter(Boolean).join('  ·  ')
  subCell.font = { size: 11, color: { argb: 'FF64748B' } }

  try {
    const logo = await logoPng(meta, brand)
    const imgId = wb.addImage({ base64: stripDataUrl(logo), extension: 'png' })
    ws.addImage(imgId, { tl: { col: Math.max(1.05, nCols - 1.1), row: 0.1 }, ext: { width: 58, height: 58 } })
  } catch { /* logo optional */ }

  let row = 4

  // ---- KPI chips ----
  if (spec.summary?.length) {
    spec.summary.forEach((s, i) => {
      const c = i * 2 + 1
      const lc = ws.getCell(row, c)
      lc.value = s.label
      lc.font = { size: 9, bold: true, color: { argb: 'FF94A3B8' } }
      const vc = ws.getCell(row + 1, c)
      vc.value = s.value
      vc.font = { size: 13, bold: true, color: { argb: 'FF0F172A' } }
    })
    row += 3
  }

  // ---- Table ----
  const headerRowIdx = row
  const headerRow = ws.getRow(headerRowIdx)
  spec.columns.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = c
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(brand) } }
    cell.alignment = { horizontal: spec.align?.[i] === 'r' || spec.money?.[i] ? 'right' : 'left' }
    cell.border = { bottom: { style: 'thin', color: { argb: argb(brand) } } }
  })
  headerRow.height = 18

  spec.rows.forEach((r, ri) => {
    const dataRow = ws.getRow(headerRowIdx + 1 + ri)
    r.forEach((v, i) => {
      const cell = dataRow.getCell(i + 1)
      const isMoney = !!spec.money?.[i]
      const num = typeof v === 'number' ? v : (isMoney && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : null)
      if (num !== null && (isMoney || typeof v === 'number')) {
        cell.value = num
        cell.numFmt = isMoney ? `"${meta.currency || '₹'}" #,##0` : '#,##0'
        cell.alignment = { horizontal: 'right' }
      } else {
        cell.value = v as string
        cell.alignment = { horizontal: spec.align?.[i] === 'r' ? 'right' : 'left' }
      }
      if (ri % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F8FA' } }
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } } }
    })
  })

  const tableEnd = headerRowIdx + spec.rows.length

  // ---- Chart image (below the table) ----
  const chart = chartPng(spec, brand, meta.currency)
  if (chart) {
    const imgId = wb.addImage({ base64: stripDataUrl(chart), extension: 'png' })
    const h = spec.chartKind === 'pie'
      ? Math.max(190, 52 + (spec.chart?.length ?? 0) * 24)
      : 52 + (spec.chart?.length ?? 0) * 30 + 12
    ws.addImage(imgId, { tl: { col: 0.1, row: tableEnd + 2 }, ext: { width: 620, height: h } })
  }

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${spec.title.replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '') || 'report'}-${meta.period.replace(/[^\w]+/g, '-')}.xlsx`
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
