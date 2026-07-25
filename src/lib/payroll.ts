/* ============================================================
   Payroll pay math + period helpers.
   Kept identical to the backend PayrollService.Compute so the
   client-side draft preview matches the server-computed run.
   ============================================================ */

export interface PayComponents {
  gross: number
  deductions: number
  net: number
}

/** Coerce a possibly-string salary field (from localStorage extras) to a number. */
export function toAmount(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const n = Number(String(v ?? '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

/**
 * Authoritative pay math (mirrors backend):
 * gross = basic; deduction = explicit EPF when > 0, else 12% statutory; net = gross − deduction.
 */
export function computePay(basic: number, epf = 0): PayComponents {
  const gross = Math.max(0, toAmount(basic))
  let deductions = epf > 0 ? toAmount(epf) : Math.round(gross * 0.12 * 100) / 100
  if (deductions > gross) deductions = gross
  return { gross, deductions, net: gross - deductions }
}

/** Detailed salary components — earnings (basic/hra/allowances) and deductions (epf/prof-tax/other). */
export interface SalaryComponents {
  basic: number
  hra: number
  allowances: number
  epf: number
  profTax: number
  otherDeductions: number
}

export const EMPTY_COMPONENTS: SalaryComponents = {
  basic: 0, hra: 0, allowances: 0, epf: 0, profTax: 0, otherDeductions: 0,
}

/** True when the components carry any pay at all (used to decide profile vs template). */
export function hasPay(c: Partial<SalaryComponents> | null | undefined): boolean {
  if (!c) return false
  return toAmount(c.basic) > 0 || toAmount(c.hra) > 0 || toAmount(c.allowances) > 0
    || toAmount(c.epf) > 0 || toAmount(c.profTax) > 0 || toAmount(c.otherDeductions) > 0
}

/**
 * Detailed pay math (mirrors backend PayrollService.Compute):
 *   gross       = basic + hra + allowances
 *   deductions  = (epf, or 12% of basic when 0) + prof-tax + other
 *   net         = gross − deductions  (deductions capped at gross)
 */
export function computeSalary(c: Partial<SalaryComponents>): PayComponents {
  const basic = Math.max(0, toAmount(c.basic))
  const gross = basic + Math.max(0, toAmount(c.hra)) + Math.max(0, toAmount(c.allowances))
  const epfRaw = toAmount(c.epf)
  const epf = epfRaw > 0 ? epfRaw : Math.round(basic * 0.12 * 100) / 100
  let deductions = epf + Math.max(0, toAmount(c.profTax)) + Math.max(0, toAmount(c.otherDeductions))
  if (deductions > gross) deductions = gross
  return { gross, deductions, net: gross - deductions }
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** Current payroll period as 'YYYY-MM' (local time). */
export function currentPeriod(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

/** 'YYYY-MM' → 'June 2026'. Returns the raw value if malformed. */
export function periodLabel(period: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(period)
  if (!m) return period
  const monthName = MONTHS[Number(m[2]) - 1] ?? m[2]
  return `${monthName} ${m[1]}`
}
