import type { PrincipalStaffEntry } from '@/api/principalAttendance'
import type { CheckInInfo } from '@/api/peopleAttendance'
import { normalizePersonKey } from '@/api/peopleAttendance'
import type { Staff, Teacher } from '@/types'

export type FenceStatus = 'inside' | 'edge' | 'outside'

export interface GeoAttendancePerson {
  id: string
  name: string
  subtitle: string
  group: 'teacher' | 'staff'
  checkedIn: boolean
  checkInAt: string | null
  checkOutAt: string | null
  verified: boolean
  fenceStatus: FenceStatus
}

function mapApiStaff(staff: PrincipalStaffEntry[]): GeoAttendancePerson[] {
  return staff.map((s) => ({
    id: s.teacherId,
    name: s.name,
    subtitle: s.subject || s.role || (s.role ? 'Staff' : 'Teacher'),
    group: s.role ? 'staff' : 'teacher',
    checkedIn: s.checkedIn,
    checkInAt: s.checkInAt ?? null,
    checkOutAt: s.checkOutAt ?? null,
    verified: Boolean(s.checkedIn && s.checkInAt),
    fenceStatus: s.checkedIn ? 'inside' : 'outside',
  }))
}

function buildRosterPeople(teachers: Teacher[], staff: Staff[]): GeoAttendancePerson[] {
  const people: GeoAttendancePerson[] = teachers.map((t) => ({
    id: t.id,
    name: t.name,
    subtitle: `${t.dept} · ${t.desig}`,
    group: 'teacher' as const,
    checkedIn: false,
    checkInAt: null,
    checkOutAt: null,
    verified: false,
    fenceStatus: 'outside' as const,
  }))
  for (const s of staff) {
    people.push({
      id: s.id,
      name: s.name,
      subtitle: `${s.role} · ${s.dept}`,
      group: 'staff',
      checkedIn: false,
      checkInAt: null,
      checkOutAt: null,
      verified: false,
      fenceStatus: 'outside',
    })
  }
  return people
}

/** Live principal staff punches, or roster rows pending check-in (no fabricated demo times). */
export function resolveGeoAttendancePeople(
  teachers: Teacher[],
  staff: Staff[],
  apiStaff: PrincipalStaffEntry[],
  apiLoaded: boolean,
  geoEnabled: boolean,
): GeoAttendancePerson[] {
  if (!geoEnabled) return []

  if (apiLoaded && apiStaff.length > 0) {
    return mapApiStaff(apiStaff)
  }

  if (apiLoaded && (teachers.length > 0 || staff.length > 0)) {
    return buildRosterPeople(teachers, staff)
  }

  return apiStaff.length > 0 ? mapApiStaff(apiStaff) : []
}

export function principalStaffToCheckInMap(staff: PrincipalStaffEntry[]): Map<string, CheckInInfo> {
  const m = new Map<string, CheckInInfo>()
  for (const s of staff) {
    if (!s.checkedIn && !s.checkInAt && !s.checkOutAt) continue
    const info: CheckInInfo = {
      checkedIn: s.checkedIn || Boolean(s.checkInAt),
      at: s.checkInAt ?? null,
      checkOutAt: s.checkOutAt ?? null,
    }
    const idKey = normalizePersonKey(String(s.teacherId ?? ''))
    if (idKey) m.set(idKey, info)
    m.set(normalizePersonKey(s.name), info)
  }
  return m
}

export function geoPeopleToCheckInMap(people: GeoAttendancePerson[]): Map<string, CheckInInfo> {
  const m = new Map<string, CheckInInfo>()
  for (const p of people) {
    if (!p.checkedIn && !p.checkInAt && !p.checkOutAt) continue
    const info = { checkedIn: p.checkedIn, at: p.checkInAt, checkOutAt: p.checkOutAt }
    m.set(String(p.id).toLowerCase(), info)
    m.set(p.name.trim().toLowerCase(), info)
  }
  return m
}

export function countFenceStatus(people: GeoAttendancePerson[]): Record<FenceStatus, number> {
  const c: Record<FenceStatus, number> = { inside: 0, edge: 0, outside: 0 }
  for (const p of people) c[p.fenceStatus]++
  return c
}
