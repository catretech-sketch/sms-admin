/* Owner portfolio fee rollup from tenant-local fee stores (desk fallback). */
import { tokenStore } from './auth/tokenStore'
import type { FeeSchoolSummary, FeeSummaryResponse } from './ownerTypes'

const INVOICE_PREFIX = 'sms_fee_invoices:'
const PAYMENT_PREFIX = 'sms_fee_payments:'

function readJsonArray(key: string): Record<string, unknown>[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed as Record<string, unknown>[] : []
  } catch {
    return []
  }
}

/** All tenant ids that have local invoice rows. */
export function discoverLocalFeeTenantIds(): string[] {
  const ids = new Set<string>()
  if (typeof localStorage === 'undefined') return []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key?.startsWith(INVOICE_PREFIX)) continue
    const tenantId = key.slice(INVOICE_PREFIX.length)
    if (tenantId && readJsonArray(key).length) ids.add(tenantId)
  }
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key?.startsWith(PAYMENT_PREFIX)) continue
    const tenantId = key.slice(PAYMENT_PREFIX.length)
    if (tenantId && readJsonArray(key).length) ids.add(tenantId)
  }
  return [...ids]
}

function inPeriod(dateRaw: unknown, from?: string, to?: string): boolean {
  const d = String(dateRaw ?? '').slice(0, 10)
  if (!d) return !from && !to
  if (from && d < from) return false
  if (to && d > to) return false
  return true
}

function emptyRollup(): Omit<FeeSchoolSummary, 'tenant_id' | 'name'> {
  return { collected: 0, outstanding: 0, payment_count: 0, invoice_count: 0 }
}

function rollupSingleTenant(
  tenantId: string,
  period: { from?: string; to?: string } = {},
): Omit<FeeSchoolSummary, 'tenant_id' | 'name'> {
  const invoices = readJsonArray(`${INVOICE_PREFIX}${tenantId}`)
  const payments = readJsonArray(`${PAYMENT_PREFIX}${tenantId}`)
  if (!invoices.length && !payments.length) return emptyRollup()

  let outstanding = 0
  let invoiceCount = 0
  let paidOnInvoices = 0
  for (const inv of invoices) {
    const due = Number(inv.due ?? 0) || 0
    const paid = Number(inv.paid ?? 0) || 0
    const status = String(inv.status ?? '').toLowerCase()
    paidOnInvoices += paid
    if (due > 0 || status === 'due' || status === 'partial') {
      outstanding += due
      invoiceCount += 1
    }
  }

  const periodPayments = payments.filter((p) => inPeriod(p.date, period.from, period.to))
  const allPaymentsTotal = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
  const collectedFromPeriod = periodPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
  const paymentCount = periodPayments.length

  /* Period cash first; then all-time payments; then invoice.paid from desk generate/pay. */
  const collected = collectedFromPeriod > 0
    ? collectedFromPeriod
    : allPaymentsTotal > 0
      ? allPaymentsTotal
      : paidOnInvoices

  return {
    collected,
    outstanding,
    payment_count: paymentCount > 0 ? paymentCount : (payments.length > 0 ? payments.length : (paidOnInvoices > 0 ? 1 : 0)),
    invoice_count: invoiceCount,
  }
}

export function resolveSchoolFeeKeys(
  school: { id: string; slug?: string },
  opts: { portfolioSize?: number; localTenantIds?: string[] } = {},
): string[] {
  const keys = new Set<string>()
  keys.add(school.id)
  if (school.slug) keys.add(school.slug)

  const tenant = tokenStore.getTenantId()
  if (tenant) {
    if (tenant === school.id || tenant === school.slug) keys.add(tenant)
    if (tenant === school.id || tenant === school.slug) keys.add('default')
  }

  const localIds = opts.localTenantIds ?? discoverLocalFeeTenantIds()
  for (const lid of localIds) {
    if (lid === school.id || lid === school.slug) keys.add(lid)
  }

  if (localIds.includes('default')) {
    const matchesTenant = tenant && (tenant === school.id || tenant === school.slug)
    const singleSchool = (opts.portfolioSize ?? 0) === 1
    if (matchesTenant || singleSchool) keys.add('default')
  }

  return [...keys]
}

export function rollupLocalFeesForTenant(
  tenantId: string,
  period: { from?: string; to?: string } = {},
): Omit<FeeSchoolSummary, 'tenant_id' | 'name'> {
  return rollupSingleTenant(tenantId, period)
}

export function rollupLocalFeesForSchool(
  school: { id: string; slug?: string },
  period: { from?: string; to?: string } = {},
  opts: { portfolioSize?: number } = {},
): Omit<FeeSchoolSummary, 'tenant_id' | 'name'> {
  const localIds = discoverLocalFeeTenantIds()
  const keys = resolveSchoolFeeKeys(school, { portfolioSize: opts.portfolioSize, localTenantIds: localIds })
  let best = emptyRollup()
  let bestScore = -1
  for (const key of keys) {
    const row = rollupSingleTenant(key, period)
    const score = row.collected + row.outstanding + row.invoice_count + row.payment_count
    if (score > bestScore) {
      best = row
      bestScore = score
    }
  }
  return best
}

function emptyTotals() {
  return { collected: 0, outstanding: 0, payment_count: 0, invoice_count: 0 }
}

function sumTotals(schools: FeeSchoolSummary[]): FeeSummaryResponse['totals'] {
  return schools.reduce((acc, s) => ({
    collected: acc.collected + Number(s.collected || 0),
    outstanding: acc.outstanding + Number(s.outstanding || 0),
    payment_count: acc.payment_count + Number(s.payment_count || 0),
    invoice_count: acc.invoice_count + Number(s.invoice_count || 0),
  }), emptyTotals())
}

function mergeFeeRow(
  api: Partial<FeeSchoolSummary> | undefined,
  local: Omit<FeeSchoolSummary, 'tenant_id' | 'name'>,
): Omit<FeeSchoolSummary, 'tenant_id' | 'name'> {
  const a = {
    collected: Number(api?.collected ?? 0) || 0,
    outstanding: Number(api?.outstanding ?? 0) || 0,
    payment_count: Number(api?.payment_count ?? 0) || 0,
    invoice_count: Number(api?.invoice_count ?? 0) || 0,
  }
  return {
    collected: a.collected || local.collected,
    outstanding: a.outstanding || local.outstanding,
    payment_count: a.payment_count || local.payment_count,
    invoice_count: a.invoice_count || local.invoice_count,
  }
}

function defaultPeriod(params: { from?: string; to?: string } = {}): { from: string; to: string } {
  if (params.from && params.to) return { from: params.from, to: params.to }
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const from = `${y}-${String(m + 1).padStart(2, '0')}-01`
  const last = new Date(y, m + 1, 0).getDate()
  const to = `${y}-${String(m + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`
  return { from: params.from || from, to: params.to || to }
}

export type PortfolioSchoolRef = { id: string; name: string; slug?: string }

/** Build / enrich owner fee summary using local per-tenant fee stores. */
export function enrichOwnerFeeSummary(
  schools: PortfolioSchoolRef[],
  api: FeeSummaryResponse | null,
  params: { from?: string; to?: string } = {},
): FeeSummaryResponse {
  const period = api?.period ?? defaultPeriod(params)
  const byId = new Map((api?.schools ?? []).map((s) => [s.tenant_id, s]))
  const portfolioSize = schools.length

  const rows: FeeSchoolSummary[] = schools.map((school) => {
    const apiRow = byId.get(school.id) ?? (school.slug ? byId.get(school.slug) : undefined)
    const local = rollupLocalFeesForSchool(school, period, { portfolioSize })
    const merged = mergeFeeRow(apiRow, local)
    return {
      tenant_id: school.id,
      name: apiRow?.name || school.name,
      ...merged,
    }
  })

  /* Include API-only tenants not in portfolio list. */
  for (const apiRow of api?.schools ?? []) {
    if (rows.some((r) => r.tenant_id === apiRow.tenant_id)) continue
    const local = rollupLocalFeesForSchool(
      { id: apiRow.tenant_id, slug: apiRow.tenant_id },
      period,
      { portfolioSize: Math.max(portfolioSize, 1) },
    )
    const merged = mergeFeeRow(apiRow, local)
    rows.push({ tenant_id: apiRow.tenant_id, name: apiRow.name, ...merged })
  }

  /* Orphan local stores (desk data under slug/id not returned by API). */
  const known = new Set(rows.map((r) => r.tenant_id))
  for (const localId of discoverLocalFeeTenantIds()) {
    if (localId === 'default') continue
    if (known.has(localId)) continue
    if (schools.some((s) => s.id === localId || s.slug === localId)) continue
    const local = rollupSingleTenant(localId, period)
    if (local.collected + local.outstanding + local.invoice_count <= 0) continue
    rows.push({
      tenant_id: localId,
      name: localId,
      ...local,
    })
  }

  return { period, schools: rows, totals: sumTotals(rows) }
}
