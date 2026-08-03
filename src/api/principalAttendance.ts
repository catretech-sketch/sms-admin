import { request } from './client'
import { snakeToCamel } from './mapper'

export interface PrincipalClassAttendance {
  classId: string
  className: string
  present: number
  total: number
  pct: number
  /** Students with a roll-call mark for the day (present + late + absent). */
  marked?: number
}

export interface PrincipalStaffEntry {
  teacherId: string
  name: string
  initials: string
  subject?: string | null
  phone?: string | null
  checkedIn: boolean
  checkInAt?: string | null
  checkOutAt?: string | null
  role?: string | null
}

export interface PrincipalAttendance {
  date: string
  presentTotal: number
  studentTotal: number
  overallPct: number
  classes: PrincipalClassAttendance[]
  staff: PrincipalStaffEntry[]
}

/** Browser UTC offset in minutes (same convention as teacher-app punch API). */
export function browserUtcOffsetMinutes(): number {
  return -new Date().getTimezoneOffset()
}

function eventAt(value: unknown): string | null {
  if (typeof value === 'string' && value) return value
  if (value && typeof value === 'object' && 'at' in value) {
    const at = (value as { at?: unknown }).at
    return typeof at === 'string' && at ? at : null
  }
  return null
}

/** Normalize staff punch fields from API wire (flat or nested check_in/check_out). */
export function parsePrincipalStaffEntry(raw: Record<string, unknown>): PrincipalStaffEntry {
  const mapped = snakeToCamel<Record<string, unknown>>(raw)
  const checkInAt = mapped.checkInAt
    ?? eventAt(raw.check_in_at)
    ?? eventAt(raw.check_in)
    ?? null
  const checkOutAt = mapped.checkOutAt
    ?? eventAt(raw.check_out_at)
    ?? eventAt(raw.check_out)
    ?? null
  const teacherId = String(mapped.teacherId ?? raw.teacher_id ?? '')
  return {
    ...mapped,
    teacherId,
    checkInAt,
    checkOutAt,
    checkedIn: Boolean(mapped.checkedIn ?? raw.checked_in) || Boolean(checkInAt) || Boolean(checkOutAt),
  } as PrincipalStaffEntry
}

/** Class-wise roll-call + teacher-app check-ins (Owner / Admin / Principal). */
export async function getPrincipalAttendance(date?: string): Promise<PrincipalAttendance> {
  const query: Record<string, string | number> = { offset_minutes: browserUtcOffsetMinutes() }
  if (date) query.date = date
  const wire = await request<Record<string, unknown>>('/principal/attendance', { query })
  const data = snakeToCamel<PrincipalAttendance>(wire)
  const staffRaw = Array.isArray(wire.staff) ? wire.staff as Record<string, unknown>[] : []
  return {
    ...data,
    staff: staffRaw.map(parsePrincipalStaffEntry),
  }
}
