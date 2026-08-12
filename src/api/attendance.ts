import { request } from './client'
import { snakeToCamel, camelToSnake } from './mapper'
import { ApiError } from './ApiError'
import { tokenStore } from './auth/tokenStore'

export type AttendanceStatus = 'present' | 'late' | 'absent'

export interface AttendanceMark {
  studentId: string
  status: AttendanceStatus
}

export interface AttendanceRecord {
  id: string
  tenantId?: string
  classId: string
  studentId: string
  date: string
  status: AttendanceStatus
  markedBy?: string | null
}

export interface AttendanceRollCall {
  date: string
  day: string
  period: number | null
  subject: string | null
  startTime: string | null
  endTime: string | null
  teacherId: string | null
  teacherName: string | null
  classTeacherId: string | null
  classTeacherName: string | null
  canMark: boolean
  reason: string
  marked: boolean
}

/** `null` for anything that isn't a real mark — a malformed/missing status must
 *  never be silently treated as "present". */
function asStatus(v: unknown): AttendanceStatus | null {
  const s = String(v ?? '').trim().toLowerCase()
  if (s === 'late' || s === 'absent' || s === 'present') return s
  return null
}

/** `null` when the row has no recognizable status — dropped by the caller rather
 *  than counted as a real "present" mark. */
function toRecord(row: Record<string, unknown>): AttendanceRecord | null {
  const c = snakeToCamel<Record<string, unknown>>(row)
  const status = asStatus(c.status)
  if (!status) return null
  return {
    id: c.id != null ? String(c.id) : '',
    tenantId: c.tenantId != null ? String(c.tenantId) : undefined,
    classId: c.classId != null ? String(c.classId) : '',
    studentId: c.studentId != null ? String(c.studentId) : '',
    date: c.date != null ? String(c.date) : '',
    status,
    markedBy: c.markedBy != null ? String(c.markedBy) : null,
  }
}

/** Normalize to YYYY-MM-DD for API date query/body. */
export function toAttendanceDate(date: string): string {
  const m = String(date).trim().match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : String(date).slice(0, 10)
}

/* ---------- local fallback (used when the attendance API is 404/405) ---------- */

function storageKey(): string {
  const tenant = tokenStore.getTenantId() || 'default'
  return `sms_attendance:${tenant}`
}

function isMissingEndpoint(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 404 || err.status === 405)
}

function loadLocalAll(): AttendanceRecord[] {
  try {
    const raw = localStorage.getItem(storageKey())
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((r): r is AttendanceRecord => !!r && typeof r === 'object')
  } catch {
    return []
  }
}

function saveLocalAll(rows: AttendanceRecord[]): void {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(rows))
  } catch {
    /* ignore quota / private-mode errors */
  }
}

function loadLocalDay(classId: string, day: string): AttendanceRecord[] {
  return loadLocalAll().filter((r) => r.classId === classId && toAttendanceDate(r.date) === day)
}

/** Replace the class+day slice of the local store with fresh marks. */
function writeLocalDay(classId: string, day: string, records: AttendanceMark[]): AttendanceRecord[] {
  const others = loadLocalAll().filter(
    (r) => !(r.classId === classId && toAttendanceDate(r.date) === day),
  )
  const fresh: AttendanceRecord[] = records
    .filter((r) => r.studentId)
    .map((r) => ({
      id: `local-${classId}-${day}-${r.studentId}`,
      classId,
      studentId: r.studentId,
      date: day,
      status: r.status,
      markedBy: 'local',
    }))
  const merged = [...others, ...fresh]
  saveLocalAll(merged)
  return fresh
}

/** Every locally stored attendance mark for the current tenant. */
export function listAllLocalAttendance(): AttendanceRecord[] {
  return loadLocalAll()
}

/** Read every locally stored mark for a class within a date range (inclusive). */
export function listLocalAttendanceRange(
  classId: string,
  from: string,
  to: string,
): AttendanceRecord[] {
  const lo = toAttendanceDate(from)
  const hi = toAttendanceDate(to)
  return loadLocalAll().filter((r) => {
    if (r.classId !== classId) return false
    const d = toAttendanceDate(r.date)
    return d >= lo && d <= hi
  })
}

/**
 * Read every locally stored mark for a student within a date range, regardless
 * of which class id it was saved under. This makes the student profile robust
 * to class-label vs class-id mismatches between the attendance screen and SIS.
 */
export function listLocalAttendanceForStudent(
  studentId: string,
  from: string,
  to: string,
): AttendanceRecord[] {
  const lo = toAttendanceDate(from)
  const hi = toAttendanceDate(to)
  return loadLocalAll().filter((r) => {
    if (r.studentId !== studentId) return false
    const d = toAttendanceDate(r.date)
    return d >= lo && d <= hi
  })
}

/** Cache server-returned marks locally so the student profile can roll up history. */
function cacheLocalRecords(classId: string, day: string, rows: AttendanceRecord[]): void {
  if (!rows.length) return
  const others = loadLocalAll().filter(
    (r) => !(r.classId === classId && toAttendanceDate(r.date) === day),
  )
  saveLocalAll([...others, ...rows])
}

export async function listAttendance(classId: string, date: string): Promise<AttendanceRecord[]> {
  const day = toAttendanceDate(date)
  try {
    const data = await request<Record<string, unknown>[] | null>(`/classes/${classId}/attendance`, {
      query: { date: day },
    })
    const rows = (data ?? []).map((row) => toRecord(row)).filter((r): r is AttendanceRecord => r != null)
    if (rows.length) cacheLocalRecords(classId, day, rows)
    // Trust the server when the endpoint exists — an empty array means "not marked yet",
    // not "fall back to stale browser storage" (teacher-app marks live on the server).
    return rows
  } catch (err) {
    if (isMissingEndpoint(err)) return loadLocalDay(classId, day)
    throw err
  }
}

export async function getAttendanceRollCall(classId: string, date: string): Promise<AttendanceRollCall> {
  const data = await request<Record<string, unknown>>(`/classes/${classId}/attendance/roll-call`, {
    query: { date: toAttendanceDate(date) },
  })
  return snakeToCamel<AttendanceRollCall>(data)
}

export async function saveAttendance(
  classId: string,
  args: { date: string; records: AttendanceMark[] },
): Promise<void> {
  const day = toAttendanceDate(args.date)
  const records = args.records
    .filter((r) => r.studentId)
    .map((r) => ({ studentId: r.studentId, status: r.status }))
  if (!records.length) throw new Error('No students to save')
  try {
    await request<unknown>(`/classes/${classId}/attendance`, {
      method: 'POST',
      body: camelToSnake({ date: day, records }),
    })
    // Mirror to local as well so the student profile can roll up month history
    // even when the range/student GET endpoints are missing.
    writeLocalDay(classId, day, records)
  } catch (err) {
    if (isMissingEndpoint(err)) {
      writeLocalDay(classId, day, records)
      return
    }
    throw err
  }
}
