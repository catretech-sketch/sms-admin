/* Student monthly attendance — real class marks only (no hash/dummy series). */
import { request } from './client'
import { ApiError } from './ApiError'
import { listAttendance, listLocalAttendanceRange, listLocalAttendanceForStudent, toAttendanceDate, type AttendanceRecord, type AttendanceStatus } from './attendance'
import type { MonthValue } from '@/types'

function isMissingEndpoint(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 404 || err.status === 405)
}

function asStatus(v: unknown): AttendanceStatus {
  const s = String(v ?? '').trim().toLowerCase()
  if (s === 'late' || s === 'absent' || s === 'present') return s
  return 'present'
}

function toRecord(row: Record<string, unknown>): AttendanceRecord {
  return {
    id: row.id != null ? String(row.id) : '',
    tenantId: row.tenant_id != null ? String(row.tenant_id) : row.tenantId != null ? String(row.tenantId) : undefined,
    classId: row.class_id != null ? String(row.class_id) : row.classId != null ? String(row.classId) : '',
    studentId: row.student_id != null ? String(row.student_id) : row.studentId != null ? String(row.studentId) : '',
    date: row.date != null ? String(row.date) : '',
    status: asStatus(row.status),
    markedBy: row.marked_by != null ? String(row.marked_by) : row.markedBy != null ? String(row.markedBy) : null,
  }
}

function localDateIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Weekdays (Mon–Fri) from `from` through `to` inclusive (YYYY-MM-DD). */
export function weekdaysBetween(from: string, to: string): string[] {
  const start = new Date(`${toAttendanceDate(from)}T12:00:00`)
  const end = new Date(`${toAttendanceDate(to)}T12:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return []
  const out: string[] = []
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay()
    if (dow === 0 || dow === 6) continue
    out.push(localDateIso(d))
  }
  return out
}

function monthKey(dateRaw: string): string {
  const iso = toAttendanceDate(dateRaw)
  return iso.slice(0, 7) // YYYY-MM
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Present+late count as attended for %. */
function isAttended(status: AttendanceStatus): boolean {
  return status === 'present' || status === 'late'
}

/** A month bar enriched with its YYYY-MM key + raw counts (for drill-down). */
export interface MonthAttendance extends MonthValue {
  key: string
  present: number
  total: number
}

/** One student's day mark (for the daily drill-down under a month). */
export interface DayAttendance {
  date: string // YYYY-MM-DD
  status: AttendanceStatus
}

/** Roll up one student's day marks into keyed month bars (only months with marks). */
export function monthlyBreakdown(
  records: AttendanceRecord[],
  studentId: string,
): MonthAttendance[] {
  const byMonth = new Map<string, { attended: number; total: number }>()
  for (const r of records) {
    if (r.studentId !== studentId) continue
    const key = monthKey(r.date)
    if (!/^\d{4}-\d{2}$/.test(key)) continue
    const cur = byMonth.get(key) ?? { attended: 0, total: 0 }
    cur.total += 1
    if (isAttended(r.status)) cur.attended += 1
    byMonth.set(key, cur)
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ym, v]) => {
      const monthIdx = Number(ym.slice(5, 7)) - 1
      return {
        key: ym,
        label: MONTH_LABELS[monthIdx] ?? ym,
        value: v.total ? Math.round((v.attended / v.total) * 100) : 0,
        present: v.attended,
        total: v.total,
      }
    })
}

/** Roll up one student's day marks into month % bars (only months with marks). */
export function rollupMonthlyAttendance(
  records: AttendanceRecord[],
  studentId: string,
): MonthValue[] {
  return monthlyBreakdown(records, studentId).map(({ label, value }) => ({ label, value }))
}

function shiftMonth(end: Date, delta: number): string {
  const d = new Date(end.getFullYear(), end.getMonth() + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function blankMonth(key: string): MonthAttendance {
  const monthIdx = Number(key.slice(5, 7)) - 1
  return { key, label: MONTH_LABELS[monthIdx] ?? key, value: 0, present: 0, total: 0 }
}

/** Start calendar year of the Indian academic session (April–March) for a date. */
export function academicYearStart(ref: Date = new Date()): number {
  return ref.getMonth() >= 3 ? ref.getFullYear() : ref.getFullYear() - 1
}

/** The 12 month keys (Apr → next Mar) for the academic session starting `startYear`. */
export function academicYearMonthKeys(startYear: number): string[] {
  const keys: string[] = []
  for (let m = 4; m <= 12; m++) keys.push(`${startYear}-${String(m).padStart(2, '0')}`)
  for (let m = 1; m <= 3; m++) keys.push(`${startYear + 1}-${String(m).padStart(2, '0')}`)
  return keys
}

/** Fill an explicit list of YYYY-MM keys with a student's marks (blank where none). */
export function monthlySeriesForKeys(
  records: AttendanceRecord[],
  studentId: string,
  keys: string[],
): MonthAttendance[] {
  const byKey = new Map(monthlyBreakdown(records, studentId).map((m) => [m.key, m]))
  return keys.map((key) => byKey.get(key) ?? blankMonth(key))
}

/**
 * Continuous month axis for the bar chart: every month from `monthsBack` before
 * `end` through `monthsForward` after it. Months with no marks are returned with
 * total = 0 (render them blank); months with marks carry their real %.
 */
export function monthlySeries(
  records: AttendanceRecord[],
  studentId: string,
  opts: { monthsBack?: number; monthsForward?: number; end?: Date } = {},
): MonthAttendance[] {
  const monthsBack = opts.monthsBack ?? 5
  const monthsForward = opts.monthsForward ?? 1
  const end = opts.end ?? new Date()
  const keys: string[] = []
  for (let delta = -monthsBack; delta <= monthsForward; delta++) keys.push(shiftMonth(end, delta))
  return monthlySeriesForKeys(records, studentId, keys)
}

/** Daily marks for one student within a given YYYY-MM, sorted ascending. */
export function dailyMarksForMonth(
  records: AttendanceRecord[],
  studentId: string,
  ym: string,
): DayAttendance[] {
  return records
    .filter((r) => r.studentId === studentId && monthKey(r.date) === ym)
    .map((r) => ({ date: toAttendanceDate(r.date), status: r.status }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** One cell in the full-month grid — status is null when no mark was recorded. */
export interface DayCell {
  date: string // YYYY-MM-DD
  status: AttendanceStatus | null
  weekend: boolean
}

/**
 * Every calendar day of a month for one student. Days with a recorded mark
 * carry the status; unmarked days are returned with status = null (shown blank).
 */
export function monthDailyGrid(
  records: AttendanceRecord[],
  studentId: string,
  ym: string,
): DayCell[] {
  if (!/^\d{4}-\d{2}$/.test(ym)) return []
  const marks = new Map(dailyMarksForMonth(records, studentId, ym).map((d) => [d.date, d.status]))
  const [y, m] = ym.split('-').map(Number)
  const count = new Date(y, m, 0).getDate() // last day of month
  const out: DayCell[] = []
  for (let i = 1; i <= count; i++) {
    const date = `${ym}-${String(i).padStart(2, '0')}`
    const dow = new Date(`${date}T12:00:00`).getDay()
    out.push({ date, status: marks.get(date) ?? null, weekend: dow === 0 || dow === 6 })
  }
  return out
}

async function tryStudentAttendanceApi(
  studentId: string,
  from: string,
  to: string,
): Promise<AttendanceRecord[] | null> {
  try {
    const data = await request<Record<string, unknown>[] | null>(`/students/${studentId}/attendance`, {
      query: { from, to },
    })
    return (data ?? []).map((row) => toRecord(row))
  } catch (err) {
    if (isMissingEndpoint(err)) return null
    throw err
  }
}

async function tryClassRangeAttendanceApi(
  classId: string,
  from: string,
  to: string,
): Promise<AttendanceRecord[] | null> {
  try {
    const data = await request<Record<string, unknown>[] | null>(`/classes/${classId}/attendance`, {
      query: { from, to },
    })
    return (data ?? []).map((row) => toRecord(row))
  } catch (err) {
    if (isMissingEndpoint(err)) return null
    throw err
  }
}

async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  let i = 0
  async function worker() {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx])
    }
  }
  const n = Math.max(1, Math.min(concurrency, items.length || 1))
  await Promise.all(Array.from({ length: n }, () => worker()))
  return out
}

/** Load real day marks for a student (range APIs first, else weekday day-scan). */
export async function listStudentAttendanceHistory(
  studentId: string,
  classId: string | null | undefined,
  opts: { from?: string; to?: string } = {},
): Promise<AttendanceRecord[]> {
  const to = opts.to || localDateIso(new Date())
  const fromDefault = new Date(`${to}T12:00:00`)
  fromDefault.setDate(fromDefault.getDate() - 120) /* ~4 months of weekdays */
  const from = opts.from || localDateIso(fromDefault)

  const studentRows = await tryStudentAttendanceApi(studentId, from, to)
  if (studentRows && studentRows.length) {
    return studentRows.filter((r) => r.studentId === studentId || !r.studentId)
      .map((r) => ({ ...r, studentId: r.studentId || studentId }))
  }

  // Robust local fast path: find this student's marks regardless of which class
  // id they were saved under (the attendance screen and SIS can resolve the
  // class differently). Works even when classId is unknown here.
  const localByStudent = listLocalAttendanceForStudent(studentId, from, to)
  if (localByStudent.length) return localByStudent

  if (!classId) return []

  const classRange = await tryClassRangeAttendanceApi(classId, from, to)
  if (classRange) {
    return classRange.filter((r) => r.studentId === studentId)
  }

  // Local marks scoped to the resolved class id (populated when attendance was
  // marked while the API was unavailable). Avoids ~one 404 request per weekday.
  const localRange = listLocalAttendanceRange(classId, from, to)
  if (localRange.length) {
    return localRange.filter((r) => r.studentId === studentId)
  }

  const days = weekdaysBetween(from, to)
  const batches = await mapPool(days, 6, async (day) => {
    try {
      const rows = await listAttendance(classId, day)
      return rows.filter((r) => r.studentId === studentId)
    } catch {
      return [] as AttendanceRecord[]
    }
  })
  return batches.flat()
}

export function monthlyAttendanceFromHistory(
  records: AttendanceRecord[],
  studentId: string,
): MonthValue[] {
  return rollupMonthlyAttendance(records, studentId)
}

/**
 * Attendance % per student computed from raw day marks (present+late over total).
 * Used to rank Attendance toppers on real data instead of the SIS field.
 */
export function attendancePctByStudent(records: AttendanceRecord[]): Map<string, number> {
  const acc = new Map<string, { attended: number; total: number }>()
  for (const r of records) {
    if (!r.studentId) continue
    const cur = acc.get(r.studentId) ?? { attended: 0, total: 0 }
    cur.total += 1
    if (isAttended(r.status)) cur.attended += 1
    acc.set(r.studentId, cur)
  }
  const out = new Map<string, number>()
  for (const [id, v] of acc) {
    out.set(id, v.total ? Math.round((v.attended / v.total) * 100) : 0)
  }
  return out
}
