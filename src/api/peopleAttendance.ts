/* Daily teacher/staff roll-call. `/v1/staff-attendance` is the source of truth;
   in-memory Map is a session read cache populated only after successful fetch/save. */
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

/** `null` for anything that isn't a real mark — a malformed/missing status must
 *  never be silently treated as "present". */
function asStatus(v: unknown): AttendanceStatus | null {
  const s = String(v ?? '').trim().toLowerCase()
  if (s === 'late' || s === 'absent' || s === 'present') return s
  return null
}

const memory = new Map<string, Record<string, AttendanceStatus>>()

function cacheKey(group: PeopleAttGroup, date: string): string {
  const tenant = tokenStore.getTenantId() || 'default'
  return `${tenant}:${group}:${date}`
}

/** Test helper — drop in-memory people-attendance cache. */
export function clearPeopleAttendanceMemory(): void {
  memory.clear()
}

/**
 * GET a day's marks from the backend. Fail-closed: throws on any error
 * (including 404/405). Callers must not fall back to browser storage.
 */
export async function fetchRemotePeopleAttendance(
  group: PeopleAttGroup,
  date: string,
): Promise<Record<string, AttendanceStatus>> {
  const rows = await request<Record<string, unknown>[] | null>('/staff-attendance', {
    query: { person_type: personTypeOf(group), date },
  })
  const out: Record<string, AttendanceStatus> = {}
  for (const row of rows ?? []) {
    const id = row.person_id != null ? String(row.person_id) : ''
    const status = asStatus(row.status)
    if (id && status) out[id] = status
  }
  cachePeopleAttendance(group, date, out)
  return out
}

/**
 * Persist a day's marks to `/staff-attendance`, then update the in-memory cache.
 * Throws on API failure — callers must not toast success unless this resolves.
 */
export async function savePeopleAttendanceRemote(
  group: PeopleAttGroup,
  date: string,
  marks: Record<string, AttendanceStatus>,
): Promise<void> {
  const records = Object.entries(marks).map(([personId, status]) => ({ personId, status }))
  if (!records.length) throw new Error('No people to save')
  await request<unknown>('/staff-attendance', {
    method: 'POST',
    body: camelToSnake({ personType: personTypeOf(group), date, records }),
  })
  cachePeopleAttendance(group, date, marks)
}

/** @deprecated Use {@link savePeopleAttendanceRemote}. POST-only; throws on failure. */
export async function pushPeopleAttendance(
  group: PeopleAttGroup,
  date: string,
  marks: Record<string, AttendanceStatus>,
): Promise<void> {
  await savePeopleAttendanceRemote(group, date, marks)
}

/** Read marks from the in-memory session cache (empty if never fetched/saved this session). */
export function loadPeopleAttendance(group: PeopleAttGroup, date: string): Record<string, AttendanceStatus> {
  return memory.get(cacheKey(group, date)) ?? {}
}

/** All in-memory roll-call marks for a group (session cache only — not browser SoT). */
export function listCachedPeopleAttendance(group: PeopleAttGroup): AttendanceRecord[] {
  const out: AttendanceRecord[] = []
  const tenant = tokenStore.getTenantId() || 'default'
  const prefix = `${tenant}:${group}:`
  for (const [key, marks] of memory) {
    if (!key.startsWith(prefix)) continue
    const date = key.slice(prefix.length)
    for (const [id, status] of Object.entries(marks)) {
      out.push({ id: `${group}-${id}-${date}`, classId: '', studentId: id, date, status })
    }
  }
  return out
}

/** @deprecated Use {@link listCachedPeopleAttendance}. */
export const listAllLocalPeopleAttendance = listCachedPeopleAttendance

export const PEOPLE_ATTENDANCE_CHANGED = 'sms:people-attendance-changed'

/** Update the in-memory read cache only (not an authoritative save). Prefer {@link savePeopleAttendanceRemote}. */
export function cachePeopleAttendance(
  group: PeopleAttGroup,
  date: string,
  marks: Record<string, AttendanceStatus>,
): void {
  memory.set(cacheKey(group, date), { ...marks })
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PEOPLE_ATTENDANCE_CHANGED, { detail: { group, date } }))
  }
}

/** @deprecated Removed — local-only writes are not allowed. Use {@link savePeopleAttendanceRemote}. */
export function savePeopleAttendance(
  _group: PeopleAttGroup,
  _date: string,
  _marks: Record<string, AttendanceStatus>,
): never {
  throw new Error('savePeopleAttendance requires the API; use savePeopleAttendanceRemote')
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
  return explicitPeopleStatus(person, marks, opts) ?? (group === 'staff' ? 'absent' : 'present')
}

/**
 * Same resolution as {@link effectivePeopleStatus} but returns `null` instead
 * of the unknown roll-call default when nobody has actually marked this person
 * yet (no CRM mark, no app check-in). Use this to decide what gets *persisted*
 * on submit — the roll-call default is a display placeholder only and must
 * never be written as if it were a real mark.
 */
export function explicitPeopleStatus(
  person: { id: string; name: string },
  marks: Record<string, AttendanceStatus>,
  opts: EffectiveStatusOpts = {},
): AttendanceStatus | null {
  const mark = marks[person.id]
  if (mark) return mark
  if (opts.checkIn) {
    const hit = lookupStaffCheckIn(opts.checkIn, person)
    if (hit?.checkedIn || hit?.at) return 'present'
    if (opts.principalKnown && hit && !hit.checkedIn && !hit.at) return 'absent'
  }
  return null
}

/** Count present/late people from explicit marks/check-ins only — unmarked people never count as present. */
export function countPeoplePresent(
  people: { id: string; name: string }[],
  marks: Record<string, AttendanceStatus>,
  opts: EffectiveStatusOpts = {},
): number {
  return people.reduce(
    (n, p) => n + (isPeoplePresent(explicitPeopleStatus(p, marks, opts) ?? undefined) ? 1 : 0),
    0,
  )
}
