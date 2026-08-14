/* Fee invoices — live API only (fail closed). */
import { request, listRequest } from './client'
import { snakeToCamel, camelToSnake } from './mapper'
import type { FeeInvoice, FeeInvoiceLine, FeeStatus } from '@/types'

interface ListEnvelope { data: Record<string, unknown>[]; next_cursor: string | null }

function toFeeInvoice(row: Record<string, unknown>): FeeInvoice {
  const inv = snakeToCamel<FeeInvoice & Record<string, unknown>>(row)
  const adm = String(
    inv.studentAdm
    ?? row.student_adm
    ?? row.admission_no
    ?? row.adm
    ?? '',
  ).trim()
  const studentName = String(
    inv.studentName ?? row.student_name ?? row.name ?? '',
  ).trim()
  const extra = inv as Record<string, unknown>
  const classLabel = String(extra.classLabel ?? row.class_label ?? '').trim()
  const cls = String(inv.cls || classLabel || row.cls || '').trim()
  const grade = String(inv.grade ?? row.grade ?? '').trim()
  const period = String(extra.period ?? row.period ?? '').trim()
  const photoUrl = String(extra.photoUrl ?? row.photo_url ?? '').trim()
  const avatarHueRaw = Number(extra.avatarHue ?? row.avatar_hue)
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
  /* Live API: amount + paid_amount; richer payloads may send total/paid/due. */
  const total = Number(inv.total ?? inv.amount ?? row.amount) || 0
  let status = (String(inv.status || 'due').toLowerCase() as FeeStatus)
  const waived = Number(inv.waived) || 0
  const paidFromApi = Number(
    inv.paid ?? extra.paidAmount ?? row.paid_amount ?? row.paid,
  )
  const hasPaidField = inv.paid != null || extra.paidAmount != null || row.paid_amount != null || row.paid != null
  const dueFromApi = Number(inv.due ?? row.due)
  const hasDue = Number.isFinite(dueFromApi) && (inv.due != null || row.due != null)

  let paid = hasPaidField && Number.isFinite(paidFromApi) ? Math.max(0, paidFromApi) : 0
  let due = hasDue ? Math.max(0, dueFromApi) : Math.max(0, total - paid - waived)

  /* Phantom paid: status=paid but nothing collected → treat as due. */
  if (status === 'paid' && paid <= 0 && total > 0) {
    status = 'due'
    paid = 0
    due = Math.max(0, total - waived)
  } else if (status === 'paid') {
    if (paid <= 0) paid = Math.max(0, total - waived)
    due = 0
  } else if (!hasDue) {
    due = Math.max(0, total - paid - waived)
  }
  const termFromPeriod = period && !inv.term ? period : String(inv.term ?? '')
  return {
    ...inv,
    studentName,
    cls,
    grade,
    term: termFromPeriod,
    academicYear: String(inv.academicYear ?? ''),
    lines,
    total,
    paid,
    waived,
    due,
    status,
    ...(adm ? { studentAdm: adm } : {}),
    ...(photoUrl ? { photoUrl } : {}),
    ...(Number.isFinite(avatarHueRaw) ? { avatarHue: avatarHueRaw } : {}),
  }
}

export async function listFeeInvoices(opts: { q?: string; status?: string; grade?: string; class?: string } = {}): Promise<FeeInvoice[]> {
  const env = await listRequest<ListEnvelope>('/fees/invoices', { query: opts })
  return env.data.map((row) => toFeeInvoice(row))
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
  const body = camelToSnake({
    academicYear: input.academicYear,
    term: input.term,
    ...(input.dueDate ? { dueDate: input.dueDate } : {}),
    ...(classes.length ? { classes } : { grades }),
  })
  return request<{ created: number }>('/fees/invoices/generate', {
    method: 'POST',
    body,
  })
}
