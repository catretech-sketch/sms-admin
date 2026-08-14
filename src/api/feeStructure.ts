import { request } from './client'
import { snakeToCamel } from './mapper'
import { tokenStore } from './auth/tokenStore'

/** Class/grade key → headId → amount (legacy + amounts block). */
export type FeeStructureMatrix = Record<string, Record<string, number>>

export type FeeStructureStatus = 'active' | 'inactive'

/** Named fee structure with header fields + class-wise amounts. */
export interface FeeStructureDocument {
  id?: string
  name: string
  academicYear: string
  /** Grade or class scope (e.g. I, X). Empty = all classes in amounts. */
  classGrade: string
  /** Optional section (A/B/C). Empty = all sections. */
  section: string
  currency: string
  effectiveFrom: string
  effectiveTo?: string
  status: FeeStructureStatus
  description: string
  amounts: FeeStructureMatrix
}

export type FeeStructureMetaInput = {
  currency?: string
  academicYear?: string
  name?: string
}

function defaultAcademicYear(d = new Date()): string {
  const y = d.getFullYear()
  const m = d.getMonth()
  return m >= 3 ? `${y}-${String(y + 1).slice(2)}` : `${y - 1}-${String(y).slice(2)}`
}

function todayIso(d = new Date()): string {
  return d.toISOString().slice(0, 10)
}

export function defaultFeeStructureMeta(opts: FeeStructureMetaInput = {}): Omit<FeeStructureDocument, 'amounts'> {
  const academicYear = opts.academicYear?.trim() || defaultAcademicYear()
  const currency = opts.currency?.trim() || 'INR'
  return {
    name: opts.name?.trim() || `School fees ${academicYear}`,
    academicYear,
    classGrade: '',
    section: '',
    currency,
    effectiveFrom: todayIso(),
    status: 'active',
    description: '',
  }
}

function isPlainAmountMatrix(raw: unknown): raw is FeeStructureMatrix {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false
  const o = raw as Record<string, unknown>
  /* Document shape has known meta keys — not a bare matrix. */
  if ('amounts' in o || 'academic_year' in o || 'academicYear' in o || 'effective_from' in o || 'effectiveFrom' in o) {
    return false
  }
  if ('name' in o && typeof o.name === 'string' && ('status' in o || 'currency' in o)) return false
  return Object.values(o).every((v) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false
    return Object.values(v as Record<string, unknown>).every((n) => typeof n === 'number')
  })
}

function coerceAmounts(raw: unknown): FeeStructureMatrix {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: FeeStructureMatrix = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue
    const row: Record<string, number> = {}
    for (const [hid, amt] of Object.entries(v as Record<string, unknown>)) {
      const n = Number(amt)
      if (Number.isFinite(n)) row[hid] = n
    }
    out[k] = row
  }
  return out
}

/** Normalize API / legacy matrix into a FeeStructureDocument. */
export function normalizeFeeStructure(
  raw: unknown,
  opts: FeeStructureMetaInput = {},
): FeeStructureDocument {
  const defaults = defaultFeeStructureMeta(opts)
  if (isPlainAmountMatrix(raw)) {
    return { ...defaults, amounts: coerceAmounts(raw) }
  }
  if (!raw || typeof raw !== 'object') {
    return { ...defaults, amounts: {} }
  }
  const c = snakeToCamel<Record<string, unknown>>(raw as Record<string, unknown>)
  const amounts = coerceAmounts(c.amounts ?? {})
  const statusRaw = String(c.status ?? 'active').toLowerCase()
  const status: FeeStructureStatus = statusRaw === 'inactive' ? 'inactive' : 'active'
  const classGrade = String(c.classGrade ?? c.class ?? c.grade ?? '').trim()
  return {
    id: c.id != null ? String(c.id) : undefined,
    name: String(c.name ?? defaults.name).trim() || defaults.name,
    academicYear: String(c.academicYear ?? defaults.academicYear).trim() || defaults.academicYear,
    classGrade,
    section: String(c.section ?? '').trim(),
    currency: String(c.currency ?? defaults.currency).trim() || defaults.currency,
    effectiveFrom: String(c.effectiveFrom ?? defaults.effectiveFrom).trim() || defaults.effectiveFrom,
    effectiveTo: c.effectiveTo ? String(c.effectiveTo).trim() : undefined,
    status,
    description: String(c.description ?? '').trim(),
    amounts,
  }
}

function toWire(doc: FeeStructureDocument): Record<string, unknown> {
  return {
    ...(doc.id && !doc.id.startsWith('local-') ? { id: doc.id } : {}),
    name: doc.name.trim(),
    academic_year: doc.academicYear.trim(),
    class_grade: doc.classGrade.trim() || null,
    section: doc.section.trim() || null,
    currency: doc.currency.trim(),
    effective_from: doc.effectiveFrom.trim(),
    effective_to: doc.effectiveTo?.trim() || null,
    status: doc.status,
    description: doc.description.trim() || null,
    amounts_json: JSON.stringify(doc.amounts ?? {}),
  }
}

function structureStorageKey(): string {
  const tenant = tokenStore.getTenantId() || 'default'
  return `sms_fee_structure:${tenant}`
}

function clearLocalStructure(): void {
  try { localStorage.removeItem(structureStorageKey()) } catch { /* ignore */ }
}

function fromApiWire(raw: unknown, opts: FeeStructureMetaInput = {}): FeeStructureDocument {
  if (!raw || typeof raw !== 'object') return normalizeFeeStructure(raw, opts)
  const row = raw as Record<string, unknown>
  const amountsJson = row.amounts_json ?? row.amountsJson
  let amounts: unknown = row.amounts
  if (typeof amountsJson === 'string' && amountsJson.trim()) {
    try { amounts = JSON.parse(amountsJson) } catch { amounts = {} }
  }
  return normalizeFeeStructure({ ...row, amounts }, opts)
}

export async function getFeeStructure(opts: FeeStructureMetaInput = {}): Promise<FeeStructureDocument> {
  const raw = await request<unknown>('/fees/structure')
  clearLocalStructure()
  return fromApiWire(raw, opts)
}

export async function saveFeeStructure(doc: FeeStructureDocument): Promise<FeeStructureDocument> {
  const name = doc.name.trim()
  if (!name) throw new Error('Fee structure name is required')
  if (!doc.academicYear.trim()) throw new Error('Academic year is required')
  if (!doc.effectiveFrom.trim()) throw new Error('Effective from date is required')
  if (!doc.currency.trim()) throw new Error('Currency is required')
  const normalized: FeeStructureDocument = {
    ...doc,
    name,
    academicYear: doc.academicYear.trim(),
    classGrade: doc.classGrade.trim(),
    section: doc.section.trim(),
    currency: doc.currency.trim(),
    effectiveFrom: doc.effectiveFrom.trim(),
    description: doc.description.trim(),
  }
  const wire = await request<unknown>('/fees/structure', { method: 'PUT', body: toWire(normalized) })
  clearLocalStructure()
  return fromApiWire(wire, { currency: normalized.currency, academicYear: normalized.academicYear })
}

/** @deprecated Prefer FeeStructureDocument.amounts — kept for call sites mid-migration. */
export function amountsOnly(doc: FeeStructureDocument | FeeStructureMatrix): FeeStructureMatrix {
  if (doc && typeof doc === 'object' && 'amounts' in doc) return (doc as FeeStructureDocument).amounts
  return coerceAmounts(doc)
}
