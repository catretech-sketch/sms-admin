import { request } from './client'
import { snakeToCamel, camelToSnake } from './mapper'

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

function asStatus(v: unknown): AttendanceStatus {
  const s = String(v ?? '').trim().toLowerCase()
  if (s === 'late' || s === 'absent' || s === 'present') return s
  return 'present'
}

function toRecord(row: Record<string, unknown>): AttendanceRecord {
  const c = snakeToCamel<Record<string, unknown>>(row)
  return {
    id: c.id != null ? String(c.id) : '',
    tenantId: c.tenantId != null ? String(c.tenantId) : undefined,
    classId: c.classId != null ? String(c.classId) : '',
    studentId: c.studentId != null ? String(c.studentId) : '',
    date: c.date != null ? String(c.date) : '',
    status: asStatus(c.status),
    markedBy: c.markedBy != null ? String(c.markedBy) : null,
  }
}

/** Normalize to YYYY-MM-DD for API date query/body. */
export function toAttendanceDate(date: string): string {
  const m = String(date).trim().match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : String(date).slice(0, 10)
}

export async function listAttendance(classId: string, date: string): Promise<AttendanceRecord[]> {
  const day = toAttendanceDate(date)
  const data = await request<Record<string, unknown>[] | null>(`/classes/${classId}/attendance`, {
    query: { date: day },
  })
  return (data ?? []).map((row) => toRecord(row))
}

export async function saveAttendance(
  classId: string,
  args: { date: string; records: AttendanceMark[] },
): Promise<void> {
  const day = toAttendanceDate(args.date)
  const records = args.records
    .filter((r) => r.studentId)
    .map((r) => ({ studentId: r.studentId, status: asStatus(r.status) }))
  if (!records.length) throw new Error('No students to save')
  await request<unknown>(`/classes/${classId}/attendance`, {
    method: 'POST',
    body: camelToSnake({ date: day, records }),
  })
}
