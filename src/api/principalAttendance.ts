import { request } from './client'
import { snakeToCamel } from './mapper'

export interface PrincipalClassAttendance {
  classId: string
  className: string
  present: number
  total: number
  pct: number
}

export interface PrincipalStaffEntry {
  teacherId: string
  name: string
  initials: string
  subject?: string | null
  phone?: string | null
  checkedIn: boolean
  checkInAt?: string | null
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

/** Class-wise roll-call + teacher-app check-ins (Owner / Admin / Principal). */
export async function getPrincipalAttendance(date?: string): Promise<PrincipalAttendance> {
  const wire = await request<Record<string, unknown>>('/principal/attendance', {
    query: date ? { date } : undefined,
  })
  return snakeToCamel<PrincipalAttendance>(wire)
}
