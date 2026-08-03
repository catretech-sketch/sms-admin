/* Daily teacher/staff roll-call. localStorage is the fast synchronous cache the
   UI reads/writes directly; `/v1/staff-attendance` is synced best-effort in the
   background (fetch-and-merge on load, push-after-save on submit) so a slow or
   unreachable backend never blocks the roster screen. */
import { request } from './client'
import { camelToSnake } from './mapper'
import { ApiError } from './ApiError'
import { tokenStore } from './auth/tokenStore'
import type { AttendanceRecord, AttendanceStatus } from './attendance'

export type PeopleAttGroup = 'teachers' | 'staff'

/** `/v1/staff-attendance` uses the singular form for its `person_type` param. */
function personTypeOf(group: PeopleAttGroup): 'teacher' | 'staff' {
  return group === 'teachers' ? 'teacher' : 'staff'
}

function isMissingEndpoint(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 404 || err.status === 405)
}

function asStatus(v: unknown): AttendanceStatus {
  const s = String(v ?? '').trim().toLowerCase()
  if (s === 'late' || s === 'absent' || s === 'present') return s
  return 'present'
}

/** Best-effort GET of a day's marks from the backend; null on any failure (caller keeps local cache). */
export async function fetchRemotePeopleAttendance(
  group: PeopleAttGroup,
  date: string,
): Promise<Record<string, AttendanceStatus> | null> {
  try {
    const rows = await request<Record<string, unknown>[] | null>('/staff-attendance', {
      query: { person_type: personTypeOf(group), date },
    })
    const out: Record<string, AttendanceStatus> = {}
    for (const row of rows ?? []) {
      const id = row.person_id != null ? String(row.person_id) : ''
      if (id) out[id] = asStatus(row.status)
    }
    return out
  } catch (err) {
    if (isMissingEndpoint(err)) return null
    return null // best-effort — never block the roster screen on a backend hiccup
  }
}

/** Best-effort push of a day's marks to the backend; swallows all failures. */
export async function pushPeopleAttendance(
  group: PeopleAttGroup,
  date: string,
  marks: Record<string, AttendanceStatus>,
): Promise<void> {
  const records = Object.entries(marks).map(([personId, status]) => ({ personId, status }))
  if (!records.length) return
  try {
    await request<unknown>('/staff-attendance', {
      method: 'POST',
      body: camelToSnake({ personType: personTypeOf(group), date, records }),
    })
  } catch {
    // best-effort — localStorage already has the authoritative save
  }
}

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
  checkOutAt?: string | null
}

/** Normalize person id/name keys for punch lookup maps. */
export function normalizePersonKey(value: string): string {
  return value.trim().toLowerCase().replace(/[{}]/g, '')
}

export function lookupStaffCheckIn(
  checkIn: Map<string, CheckInInfo>,
  person: { id: string; name: string },
): CheckInInfo | undefined {
  return checkIn.get(normalizePersonKey(person.id))
    ?? checkIn.get(person.id)
    ?? checkIn.get(normalizePersonKey(person.name))
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
    const hit = lookupStaffCheckIn(opts.checkIn, person)
    if (hit?.checkedIn || hit?.at) return 'present'
    if (opts.principalKnown && hit && !hit.checkedIn && !hit.at) return 'absent'
  }
  if (group === 'staff' && opts.checkIn) {
    const hit = lookupStaffCheckIn(opts.checkIn, person)
    if (hit?.checkedIn || hit?.at) return 'present'
    if (opts.principalKnown && hit && !hit.checkedIn && !hit.at) return 'absent'
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
