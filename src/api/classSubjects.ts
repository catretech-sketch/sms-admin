/* Per-class subject lists — live API when available, tenant-local map as fallback. */
import { request } from './client'
import { ApiError } from './ApiError'
import { tokenStore } from './auth/tokenStore'
import { loadPublishEnvelope } from '@/lib/academicsPublish'
import type { SchoolClass } from './classes'

/** Map of class key (id preferred, else name) → subject names. */
export type ClassSubjectsMap = Record<string, string[]>

export const CLASS_SUBJECTS_CHANGED = 'sms-class-subjects-changed'

function storageKey(): string {
  const tenant = tokenStore.getTenantId() || 'default'
  return `sms_class_subjects:${tenant}`
}

function notifyChanged(): void {
  try {
    window.dispatchEvent(new CustomEvent(CLASS_SUBJECTS_CHANGED))
  } catch {
    /* SSR / non-browser */
  }
}

function normalizeNames(list: unknown): string[] {
  if (!Array.isArray(list)) {
    if (typeof list === 'string') {
      return [...new Set(list.split(',').map((s) => s.trim()).filter(Boolean))]
    }
    return []
  }
  const out: string[] = []
  for (const item of list) {
    if (typeof item === 'string') {
      const n = item.trim()
      if (n) out.push(n)
      continue
    }
    if (item && typeof item === 'object') {
      const row = item as Record<string, unknown>
      const n = String(row.name ?? row.subject ?? row.title ?? '').trim()
      if (n) out.push(n)
    }
  }
  return [...new Set(out)]
}

/** Extract subject names from a class wire / API payload. */
export function parseSubjectsFromClassWire(wire: Record<string, unknown>): string[] {
  if (Array.isArray(wire.subjects)) return normalizeNames(wire.subjects)
  if (Array.isArray(wire.subject_names)) return normalizeNames(wire.subject_names)
  if (typeof wire.subjects === 'string') return normalizeNames(wire.subjects)
  if (typeof wire.subject === 'string') return normalizeNames(wire.subject)
  return []
}

export function loadClassSubjectsMap(): ClassSubjectsMap {
  try {
    const raw = localStorage.getItem(storageKey())
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: ClassSubjectsMap = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const key = String(k).trim()
      if (!key) continue
      out[key] = normalizeNames(v)
    }
    return out
  } catch {
    return {}
  }
}

export function saveClassSubjectsMap(map: ClassSubjectsMap): ClassSubjectsMap {
  const next: ClassSubjectsMap = {}
  for (const [k, v] of Object.entries(map)) {
    const key = String(k).trim()
    if (!key) continue
    next[key] = normalizeNames(v)
  }
  localStorage.setItem(storageKey(), JSON.stringify(next))
  notifyChanged()
  return next
}

export function classSubjectsKey(classId: string | undefined | null, className: string): string {
  const id = (classId ?? '').trim()
  if (id) return id
  return className.trim()
}

/** Mapped subjects only — never invents from the full catalog. */
export function getClassSubjects(classId: string | undefined | null, className: string): string[] {
  const map = loadClassSubjectsMap()
  const id = (classId ?? '').trim()
  const name = className.trim()
  if (id && map[id]?.length) return [...map[id]]
  if (name && map[name]?.length) return [...map[name]]
  return []
}

export function setClassSubjects(
  classId: string | undefined | null,
  className: string,
  subjects: string[],
): ClassSubjectsMap {
  const map = loadClassSubjectsMap()
  const key = classSubjectsKey(classId, className)
  const list = normalizeNames(subjects)
  if (!list.length) {
    delete map[key]
    if (className.trim() && className.trim() !== key) delete map[className.trim()]
  } else {
    map[key] = list
    const name = className.trim()
    if (name && name !== key) map[name] = list
  }
  return saveClassSubjectsMap(map)
}

/**
 * Prefer API subjects on each class row; fill gaps from the local map.
 * Writes API-sourced lists into the local map so Exams/Timetable stay in sync.
 */
export function hydrateClassSubjectsFromClasses(classes: SchoolClass[]): ClassSubjectsMap {
  const map = loadClassSubjectsMap()
  let changed = false
  for (const c of classes) {
    const id = (c.id ?? '').trim()
    const name = (c.name || `${c.grade}-${c.section}`).trim()
    const fromApi = normalizeNames(c.subjects ?? [])
    if (!fromApi.length) continue
    const key = id || name
    if (!key) continue
    const prev = map[key] ?? []
    const same = prev.length === fromApi.length && prev.every((s, i) => s === fromApi[i])
    if (!same) {
      map[key] = fromApi
      if (name && name !== key) map[name] = fromApi
      changed = true
    }
  }
  return changed ? saveClassSubjectsMap(map) : map
}

/**
 * Subjects for one class.
 * - prefer mapped list
 * - optional catalog fallback (timetable generate when unmapped)
 */
export function subjectsForClass(
  classId: string | undefined | null,
  className: string,
  catalog: string[],
  opts?: { fallbackCatalog?: boolean },
): string[] {
  const assigned = getClassSubjects(classId, className)
  if (assigned.length) return assigned
  if (opts?.fallbackCatalog === false) return []
  return catalog
}

/** Union of mapped subjects across many classes (first-seen order). */
export function unionMappedSubjects(
  classes: Array<{ id?: string | null; name: string }>,
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const c of classes) {
    for (const s of getClassSubjects(c.id, c.name)) {
      if (!seen.has(s)) {
        seen.add(s)
        out.push(s)
      }
    }
  }
  return out
}

/**
 * GET /classes/{id}/subjects — returns names.
 * Falls back to the local map on 404/405 (endpoint not deployed yet).
 */
export async function listClassSubjects(classId: string): Promise<string[]> {
  const id = classId.trim()
  if (!id) return []
  try {
    const data = await request<unknown>(`/classes/${id}/subjects`)
    let names: string[] = []
    if (Array.isArray(data)) names = normalizeNames(data)
    else if (data && typeof data === 'object') {
      const row = data as Record<string, unknown>
      if (Array.isArray(row.subjects)) names = normalizeNames(row.subjects)
      else if (Array.isArray(row.data)) names = normalizeNames(row.data)
    }
    if (names.length) setClassSubjects(id, '', names)
    return names.length ? names : getClassSubjects(id, '')
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 405)) {
      return getClassSubjects(id, '')
    }
    throw err
  }
}

/**
 * PUT /classes/{id}/subjects with `{ subjects: string[] }`.
 * Always updates the local map. Ignores 404/405 from the server.
 */
export async function saveClassSubjects(
  classId: string,
  className: string,
  subjects: string[],
): Promise<string[]> {
  const id = classId.trim()
  const list = normalizeNames(subjects)
  setClassSubjects(id || null, className, list)
  if (!id) return list
  try {
    await request<unknown>(`/classes/${id}/subjects`, {
      method: 'PUT',
      body: { subjects: list },
    })
  } catch (err) {
    if (!(err instanceof ApiError && (err.status === 404 || err.status === 405))) {
      /* Local map already saved — surface unexpected errors. */
      throw err
    }
  }
  return list
}

/** How many teaching (Class) periods are in the Periods schedule. */
export function teachingPeriodCount(fallback = 8): number {
  const env = loadPublishEnvelope<Array<{ type?: string }>>('periods')
  const rows = env.published ?? env.draft
  if (!Array.isArray(rows) || rows.length === 0) return fallback
  const n = rows.filter((r) => String(r?.type ?? '').toLowerCase() === 'class').length
  return n > 0 ? n : fallback
}

/** Soft match: class subjects should equal teaching periods (e.g. 8 periods → 8 subjects). */
export function subjectsMatchPeriodsHint(subjectCount: number, periodCount: number): string {
  if (periodCount <= 0) return 'Add Class periods under Academics → Periods first.'
  if (subjectCount === 0) return `Pick ${periodCount} subjects to match your ${periodCount} periods.`
  if (subjectCount === periodCount) return `Ready — ${subjectCount} subjects match ${periodCount} periods.`
  if (subjectCount < periodCount) return `${subjectCount} of ${periodCount} subjects — add ${periodCount - subjectCount} more to match periods.`
  return `${subjectCount} subjects for ${periodCount} periods — remove ${subjectCount - periodCount} for a 1:1 match.`
}
