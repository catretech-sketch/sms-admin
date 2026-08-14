import { request } from './client'
import { snakeToCamel } from './mapper'
import type { FeeReportSummary } from '@/types'

/** Local calendar YYYY-MM-DD (not UTC — avoids IST day skew). */
export function localDateIso(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Normalize payment / invoice dates to YYYY-MM-DD for comparisons. */
export function paymentDateIso(raw: unknown): string {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)

  /* en-IN short: "17 Jul 2026" / "17 July 2026" */
  const mon = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/)
  if (mon) {
    const months: Record<string, string> = {
      jan: '01', january: '01', feb: '02', february: '02', mar: '03', march: '03',
      apr: '04', april: '04', may: '05', jun: '06', june: '06',
      jul: '07', july: '07', aug: '08', august: '08',
      sep: '09', sept: '09', september: '09', oct: '10', october: '10',
      nov: '11', november: '11', dec: '12', december: '12',
    }
    const mm = months[mon[2].toLowerCase()]
    if (mm) return `${mon[3]}-${mm}-${mon[1].padStart(2, '0')}`
  }

  /* en-IN numeric: "17/07/2026" or "17-07-2026" */
  const slash = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (slash) {
    return `${slash[3]}-${slash[2].padStart(2, '0')}-${slash[1].padStart(2, '0')}`
  }

  const parsed = new Date(s)
  if (!Number.isNaN(parsed.getTime())) return localDateIso(parsed)
  return ''
}

export async function getFeeReportSummary(): Promise<FeeReportSummary> {
  const wire = await request<Record<string, unknown>>('/fees/reports/summary')
  const summary = snakeToCamel<FeeReportSummary>(wire)
  const latest = summary.latestPayment
    ? (() => {
      const p = summary.latestPayment as FeeReportSummary['latestPayment'] & { method?: string; classLabel?: string }
      if (!p) return null
      return {
        ...p,
        mode: p.mode || p.method || '',
        cls: p.cls || p.classLabel || '',
      }
    })()
    : summary.latestPayment
  return {
    ...summary,
    collectedToday: Number(summary.collectedToday) || 0,
    collectedTerm: Number(summary.collectedTerm) || 0,
    outstanding: Number(summary.outstanding) || 0,
    defaulters: Number(summary.defaulters) || 0,
    billedTerm: Number(summary.billedTerm) || 0,
    pct: Number(summary.pct) || 0,
    byClass: Array.isArray(summary.byClass) ? summary.byClass : [],
    byMode: Array.isArray(summary.byMode) ? summary.byMode : [],
    latestPayment: latest ?? null,
  }
}
