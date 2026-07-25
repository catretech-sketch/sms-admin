/* Daily teacher/staff roll-call until a dedicated API exists.
   Persisted per tenant + date in localStorage. */
import { tokenStore } from './auth/tokenStore'
import type { AttendanceRecord, AttendanceStatus } from './attendance'

export type PeopleAttGroup = 'teachers' | 'staff'

function storageKey(group: PeopleAttGroup, date: string): string {
  const tenant = tokenStore.getTenantId() || 'default'
  return `sms_${group}_attendance:${tenant}:${date}`
}

export function loadPeopleAttendance(group: PeopleAttGroup, date: string): Record<string, AttendanceStatus> {
  try {
    const raw = localStorage.getItem(storageKey(group, date))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, string>
    const out: Record<string, AttendanceStatus> = {}
    for (const [id, st] of Object.entries(parsed)) {
      if (st === 'present' || st === 'late' || st === 'absent') out[id] = st
    }
    return out
  } catch {
    return {}
  }
}

/** All locally-saved roll-call marks for a group, as attendance records (for trends/export). */
export function listAllLocalPeopleAttendance(group: PeopleAttGroup): AttendanceRecord[] {
  const out: AttendanceRecord[] = []
  try {
    const tenant = tokenStore.getTenantId() || 'default'
    const prefix = `sms_${group}_attendance:${tenant}:`
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key || !key.startsWith(prefix)) continue
      const date = key.slice(prefix.length)
      const marks = loadPeopleAttendance(group, date)
      for (const [id, status] of Object.entries(marks)) {
        out.push({ id: `${group}-${id}-${date}`, classId: '', studentId: id, date, status })
      }
    }
  } catch { /* storage disabled */ }
  return out
}

export const PEOPLE_ATTENDANCE_CHANGED = 'sms:people-attendance-changed'

export function savePeopleAttendance(
  group: PeopleAttGroup,
  date: string,
  marks: Record<string, AttendanceStatus>,
): void {
  localStorage.setItem(storageKey(group, date), JSON.stringify(marks))
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PEOPLE_ATTENDANCE_CHANGED, { detail: { group, date } }))
  }
}

export function isPeoplePresent(status: AttendanceStatus | undefined): boolean {
  return status === 'present' || status === 'late'
}

/** Count present/late marks for the given person ids (manual CRM roll-call). */
export function countMarkedPresent(
  marks: Record<string, AttendanceStatus>,
  ids: string[],
): number {
  return ids.reduce((n, id) => n + (isPeoplePresent(marks[id]) ? 1 : 0), 0)
}

export interface CheckInInfo {
  checkedIn: boolean
  at?: string | null
}

export interface EffectiveStatusOpts {
  /** Teacher-app check-ins keyed by teacherId AND lowercased name. */
  checkIn?: Map<string, CheckInInfo>
  /** True once the principal/teacher-app feed has loaded for this date. */
  principalKnown?: boolean
}

/**
 * Resolve a person's status for a day. One source of truth shared by the
 * Attendance roster, the summary cards, and the Dashboard so they never disagree.
 * Priority: explicit CRM mark → teacher-app check-in → roll-call default.
 * Staff have no app check-in feed, so they default to absent until CRM marks them present;
 * teachers with no check-in feed loaded yet default to present (unknown, not yet contradicted).
 */
export function effectivePeopleStatus(
  group: PeopleAttGroup,
  person: { id: string; name: string },
  marks: Record<string, AttendanceStatus>,
  opts: EffectiveStatusOpts = {},
): AttendanceStatus {
  const mark = marks[person.id]
  if (mark) return mark
  if (group === 'teachers' && opts.checkIn) {
    const hit = opts.checkIn.get(person.id) ?? opts.checkIn.get(person.name.toLowerCase())
    if (hit?.checkedIn) return 'present'
    if (opts.principalKnown && hit && !hit.checkedIn) return 'absent'
  }
  if (group === 'staff') return 'absent'
  return 'present'
}

/** Count present/late people using {@link effectivePeopleStatus}. */
export function countPeoplePresent(
  group: PeopleAttGroup,
  people: { id: string; name: string }[],
  marks: Record<string, AttendanceStatus>,
  opts: EffectiveStatusOpts = {},
): number {
  return people.reduce(
    (n, p) => n + (isPeoplePresent(effectivePeopleStatus(group, p, marks, opts)) ? 1 : 0),
    0,
  )
}
