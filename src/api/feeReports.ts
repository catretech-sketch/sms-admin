import { request } from './client'
import { ApiError } from './ApiError'
import { snakeToCamel } from './mapper'
import { listFeeInvoices } from './feeInvoices'
import { listLocalFeePayments } from './feePayments'
import type { FeePayment, FeeReportSummary } from '@/types'

function isMissingEndpoint(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 404 || err.status === 405)
}

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

function isPaymentOnDay(payment: FeePayment, dayIso: string): boolean {
  return paymentDateIso(payment.date) === dayIso
}

async function summaryFromLocal(): Promise<FeeReportSummary> {
  const [invoices, payments] = await Promise.all([
    listFeeInvoices(),
    Promise.resolve(listLocalFeePayments()),
  ])
  const billedTerm = invoices.reduce((s, i) => s + (Number(i.total) || 0), 0)
  const outstanding = invoices.reduce((s, i) => s + (Number(i.due) || 0), 0)
  const collectedTerm = invoices.reduce((s, i) => s + (Number(i.paid) || 0), 0)
  const today = localDateIso()

  let collectedToday = payments
    .filter((p) => isPaymentOnDay(p, today))
    .reduce((s, p) => s + (Number(p.amount) || 0), 0)

  /* Desk payments often used locale display dates; if none match today but
     invoice.paid has cash and every payment falls on today after normalize — covered above.
     If still 0 today but paid exists with no ledger rows, attribute paid that isn't outstanding. */
  if (collectedToday <= 0 && collectedTerm > 0 && payments.length === 0 && outstanding <= 0) {
    collectedToday = collectedTerm
  }

  const defaulters = invoices.filter((i) => i.status === 'due' || i.status === 'partial').length
  const pct = billedTerm > 0 ? Math.round((collectedTerm / billedTerm) * 1000) / 10 : 0

  const classMap = new Map<string, { value: number; n: number }>()
  for (const inv of invoices) {
    const label = inv.cls || inv.grade || '—'
    const cur = classMap.get(label) ?? { value: 0, n: 0 }
    cur.value += Number(inv.due) || 0
    cur.n += 1
    classMap.set(label, cur)
  }
  const byClass = [...classMap.entries()]
    .map(([label, v]) => ({ label, value: v.value, n: v.n }))
    .sort((a, b) => a.label.localeCompare(b.label))

  const modeMap = new Map<string, number>()
  for (const p of payments) {
    const label = String(p.mode || 'Other')
    modeMap.set(label, (modeMap.get(label) ?? 0) + (Number(p.amount) || 0))
  }
  const byMode = [...modeMap.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)

  const latestPayment: FeePayment | null = payments.length
    ? [...payments].sort((a, b) => {
      const da = paymentDateIso(a.date) || String(a.date)
      const db = paymentDateIso(b.date) || String(b.date)
      return db.localeCompare(da) || Number(b.id) - Number(a.id)
    })[0]
    : null

  return {
    collectedToday,
    collectedTerm,
    outstanding,
    defaulters,
    billedTerm,
    pct,
    byClass,
    byMode,
    latestPayment,
  }
}

function summaryLooksEmpty(s: FeeReportSummary): boolean {
  return (Number(s.billedTerm) || 0) <= 0
    && (Number(s.collectedTerm) || 0) <= 0
    && (Number(s.outstanding) || 0) <= 0
    && (Number(s.collectedToday) || 0) <= 0
}

export async function getFeeReportSummary(): Promise<FeeReportSummary> {
  try {
    const wire = await request<Record<string, unknown>>('/fees/reports/summary')
    const mapped = snakeToCamel<FeeReportSummary>(wire)
    /* API stub returning zeros while desk has local invoices — prefer local. */
    if (summaryLooksEmpty(mapped)) {
      const local = await summaryFromLocal()
      if (!summaryLooksEmpty(local)) return local
    }
    return mapped
  } catch (err) {
    if (isMissingEndpoint(err)) return summaryFromLocal()
    throw err
  }
}
