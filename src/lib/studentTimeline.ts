/* Student activity timeline — assembled from real data (payments, invoices,
   attendance marks, enrolment). No hardcoded/dummy events. */
import { fmtMoney } from './format'
import type { Student, FeePayment, FeeInvoice } from '@/types'
import type { AttendanceRecord } from '@/api/attendance'

export interface TimelineEvent {
  id: string
  tone: string
  title: string
  body: string
  date: string // human display, e.g. "12 Apr 2026"
  ts: number // sort key (ms); 0 when the date is unknown
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Parse assorted date strings (YYYY-MM-DD, ISO, "12 Apr 2026", en-IN) to ms. */
export function parseDateTs(raw: string | undefined | null): number {
  if (!raw) return 0
  const s = String(raw).trim()
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) {
    const t = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T12:00:00`).getTime()
    return Number.isNaN(t) ? 0 : t
  }
  const t = new Date(s).getTime()
  return Number.isNaN(t) ? 0 : t
}

/** Format a date string/ms to "12 Apr 2026"; falls back to the raw string. */
export function formatDate(raw: string | undefined | null): string {
  const ts = parseDateTs(raw)
  if (!ts) return raw ? String(raw) : '—'
  const d = new Date(ts)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

function paymentLabel(p: FeePayment): string {
  return p.headName || (typeof p.feeType === 'string' ? p.feeType : '') || p.mode || 'Fee'
}

export interface BuildTimelineOpts {
  student: Student
  payments?: FeePayment[]
  invoices?: FeeInvoice[]
  attendance?: AttendanceRecord[]
  /** Max events returned (most recent first). */
  limit?: number
  /** Cap on attendance exception events so a long history can't flood the feed. */
  attendanceLimit?: number
}

/**
 * Build a student's activity timeline from real records. Everything is filtered
 * to this student, merged, sorted newest-first, and capped for scalability.
 */
export function buildStudentTimeline(opts: BuildTimelineOpts): TimelineEvent[] {
  const { student, payments = [], invoices = [], attendance = [] } = opts
  const limit = opts.limit ?? 20
  const attendanceLimit = opts.attendanceLimit ?? 6
  const events: TimelineEvent[] = []

  // Fee payments received
  for (const p of payments) {
    if (p.studentId && p.studentId !== student.id) continue
    events.push({
      id: `pay-${p.id}`,
      tone: 'var(--success)',
      title: 'Fee payment received',
      body: `${fmtMoney(p.amount)} — ${paymentLabel(p)}`,
      date: formatDate(p.date),
      ts: parseDateTs(p.date),
    })
  }

  // Fee invoices raised (dated by due date, which is the only date we have)
  for (const inv of invoices) {
    if (inv.studentId !== student.id && !(student.adm && inv.studentAdm === student.adm)) continue
    const paidUp = (inv.due || 0) <= 0
    events.push({
      id: `inv-${inv.id}`,
      tone: paidUp ? 'var(--success)' : 'var(--warning)',
      title: paidUp ? 'Invoice cleared' : 'Invoice raised',
      body: `${[inv.term, inv.academicYear].filter(Boolean).join(' · ') || 'Fee invoice'} · ${fmtMoney(inv.total)}${paidUp ? '' : ` · due ${fmtMoney(inv.due)}`}`,
      date: formatDate(inv.dueDate),
      ts: parseDateTs(inv.dueDate),
    })
  }

  // Attendance exceptions (late / absent) — most recent few only
  const exceptions = attendance
    .filter((r) => r.studentId === student.id && (r.status === 'late' || r.status === 'absent'))
    .sort((a, b) => parseDateTs(b.date) - parseDateTs(a.date))
    .slice(0, attendanceLimit)
  for (const r of exceptions) {
    events.push({
      id: `att-${r.id || `${r.date}-${r.status}`}`,
      tone: r.status === 'absent' ? 'var(--danger)' : 'var(--warning)',
      title: r.status === 'absent' ? 'Marked absent' : 'Marked late',
      body: 'Class attendance',
      date: formatDate(r.date),
      ts: parseDateTs(r.date),
    })
  }

  // Enrolment (from admission date)
  if (student.admissionDate) {
    events.push({
      id: 'enrolled',
      tone: 'var(--brand-600)',
      title: 'Enrolled',
      body: `Admission ${student.adm}`,
      date: formatDate(student.admissionDate),
      ts: parseDateTs(student.admissionDate),
    })
  }

  return events
    .sort((a, b) => b.ts - a.ts || a.title.localeCompare(b.title))
    .slice(0, limit)
}
