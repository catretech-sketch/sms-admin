/* Fee invoices — live API when available, tenant-local store as fallback (404/405). */
import { request, listRequest } from './client'
import { ApiError } from './ApiError'
import { snakeToCamel, camelToSnake } from './mapper'
import { tokenStore } from './auth/tokenStore'
import { getFeeStructure } from './feeStructure'
import { listFeeHeads } from './feeHeads'
import { listStudents } from './students'
import type { FeeInvoice, FeeInvoiceLine, FeeStatus, Student } from '@/types'

interface ListEnvelope { data: Record<string, unknown>[]; next_cursor: string | null }

function storageKey(): string {
  const tenant = tokenStore.getTenantId() || 'default'
  return `sms_fee_invoices:${tenant}`
}

function isMissingEndpoint(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 404 || err.status === 405)
}

function toFeeInvoice(row: Record<string, unknown>): FeeInvoice {
  const inv = snakeToCamel<FeeInvoice & Record<string, unknown>>(row)
  const adm = String(
    inv.studentAdm
    ?? row.student_adm
    ?? row.admission_no
    ?? row.adm
    ?? '',
  ).trim()
  const lines = Array.isArray(inv.lines)
    ? inv.lines.map((ln) => {
      const line = snakeToCamel<FeeInvoiceLine>(ln as unknown as Record<string, unknown>)
      return {
        headId: String(line.headId ?? ''),
        headName: String(line.headName ?? ''),
        amount: Number(line.amount) || 0,
      }
    })
    : []
  return {
    ...inv,
    lines,
    total: Number(inv.total) || 0,
    paid: Number(inv.paid) || 0,
    waived: Number(inv.waived) || 0,
    due: Number(inv.due) || 0,
    status: (String(inv.status || 'due') as FeeStatus),
    ...(adm ? { studentAdm: adm } : {}),
  }
}

function loadLocal(): FeeInvoice[] {
  try {
    const raw = localStorage.getItem(storageKey())
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.map((row) => toFeeInvoice(row as Record<string, unknown>)).filter((i) => i.id && i.studentId)
  } catch {
    return []
  }
}

function saveLocal(rows: FeeInvoice[]): void {
  localStorage.setItem(storageKey(), JSON.stringify(rows))
}

function newLocalId(): string {
  return `local-inv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function filterLocal(
  rows: FeeInvoice[],
  opts: { q?: string; status?: string; grade?: string; class?: string } = {},
): FeeInvoice[] {
  const q = opts.q?.trim().toLowerCase()
  return rows.filter((inv) => {
    if (opts.status && opts.status !== 'all' && inv.status !== opts.status) return false
    if (opts.grade && opts.grade !== 'all' && inv.grade !== opts.grade) return false
    if (opts.class && opts.class !== 'all' && inv.cls !== opts.class) return false
    if (!q) return true
    const hay = `${inv.studentName} ${inv.studentAdm ?? ''} ${inv.cls} ${inv.grade}`.toLowerCase()
    return hay.includes(q)
  })
}

function amountRowForStudent(
  amounts: Record<string, Record<string, number>>,
  student: Student,
): Record<string, number> | null {
  const cls = String(student.cls ?? '').trim()
  const grade = String(student.grade ?? '').trim()
  if (cls && amounts[cls]) return amounts[cls]
  if (grade && amounts[grade]) return amounts[grade]
  return null
}

function studentInScope(
  student: Student,
  classes: string[],
  grades: string[],
): boolean {
  const cls = String(student.cls ?? '').trim()
  const grade = String(student.grade ?? '').trim()
  if (classes.length) return classes.includes(cls)
  if (grades.length) return grades.includes(grade) || grades.some((g) => cls === g || cls.startsWith(`${g}-`))
  return false
}

async function generateLocal(input: {
  grades: string[]
  classes: string[]
  academicYear: string
  term: string
  dueDate?: string
}): Promise<{ created: number }> {
  const [structure, heads, students] = await Promise.all([
    getFeeStructure({ academicYear: input.academicYear }),
    listFeeHeads(),
    listStudents(),
  ])
  const headName = new Map(heads.map((h) => [h.id, h.name]))
  const amounts = structure.amounts ?? {}
  const scoped = students.filter((s) => studentInScope(s, input.classes, input.grades))
  const created: FeeInvoice[] = []

  for (const student of scoped) {
    const row = amountRowForStudent(amounts, student)
    if (!row) continue
    const lines: FeeInvoiceLine[] = []
    for (const [headId, amount] of Object.entries(row)) {
      const n = Number(amount)
      if (!Number.isFinite(n) || n <= 0) continue
      lines.push({
        headId,
        headName: headName.get(headId) || headId,
        amount: n,
      })
    }
    if (!lines.length) continue
    const total = lines.reduce((s, l) => s + l.amount, 0)
    created.push({
      id: newLocalId(),
      studentId: student.id,
      studentName: student.name,
      studentAdm: student.adm?.trim() || undefined,
      cls: String(student.cls ?? '').trim() || String(student.grade ?? ''),
      grade: String(student.grade ?? '').trim(),
      academicYear: input.academicYear,
      term: input.term,
      lines,
      total,
      paid: 0,
      waived: 0,
      due: total,
      status: 'due',
      ...(input.dueDate ? { dueDate: input.dueDate } : {}),
    })
  }

  const existing = loadLocal().filter((inv) => {
    if (inv.academicYear !== input.academicYear || inv.term !== input.term) return true
    return !created.some((c) => c.studentId === inv.studentId)
  })
  saveLocal([...existing, ...created])
  return { created: created.length }
}

/** Update a local invoice after payment / waive. Exported for feePayments fallback. */
export function patchLocalInvoice(invoiceId: string, patch: Partial<FeeInvoice>): FeeInvoice | null {
  const rows = loadLocal()
  const idx = rows.findIndex((r) => r.id === invoiceId)
  if (idx < 0) return null
  const next = { ...rows[idx], ...patch }
  const due = Math.max(0, Number(next.total) - Number(next.paid) - Number(next.waived))
  next.due = due
  if (due <= 0) next.status = 'paid'
  else if (Number(next.paid) > 0) next.status = 'partial'
  else next.status = 'due'
  rows[idx] = next
  saveLocal(rows)
  return next
}

export function getLocalInvoice(invoiceId: string): FeeInvoice | null {
  return loadLocal().find((r) => r.id === invoiceId) ?? null
}

export async function listFeeInvoices(opts: { q?: string; status?: string; grade?: string; class?: string } = {}): Promise<FeeInvoice[]> {
  try {
    const env = await listRequest<ListEnvelope>('/fees/invoices', { query: opts })
    const rows = env.data.map((row) => toFeeInvoice(row))
    if (rows.length) saveLocal(rows)
    return rows.length ? rows : filterLocal(loadLocal(), opts)
  } catch (err) {
    if (isMissingEndpoint(err)) return filterLocal(loadLocal(), opts)
    throw err
  }
}

export async function generateFeeInvoices(input: {
  grades?: string[]
  /** Class labels (e.g. X-A) — preferred when structure is class-wise. */
  classes?: string[]
  academicYear: string
  term: string
  dueDate?: string
}): Promise<{ created: number }> {
  const grades = input.grades?.filter(Boolean) ?? []
  const classes = input.classes?.filter(Boolean) ?? []
  if (!grades.length && !classes.length) {
    throw new Error('Select at least one class or grade to generate invoices.')
  }
  /* Prefer classes only — sending both can double-bill on some backends. */
  const body = camelToSnake({
    academicYear: input.academicYear,
    term: input.term,
    ...(input.dueDate ? { dueDate: input.dueDate } : {}),
    ...(classes.length ? { classes } : { grades }),
  })
  try {
    return await request<{ created: number }>('/fees/invoices/generate', {
      method: 'POST',
      body,
    })
  } catch (err) {
    if (!isMissingEndpoint(err)) throw err
    return generateLocal({
      grades,
      classes,
      academicYear: input.academicYear,
      term: input.term,
      dueDate: input.dueDate,
    })
  }
}
