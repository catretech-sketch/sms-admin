/* ============================================================
   SchoolMate — Timetable model + teacher clash detection.
   Pure, UI-free helpers so the builder can detect when a
   teacher is booked in two classes at the same day+period.
   ============================================================ */

export type Cell = { subject: string; teacherId: string }
export type Grid = Record<string, Cell | null>
export type Grids = Record<string, Grid>

/** Stable key for a 0-based day + 0-based period slot. */
export const cellKey = (day: number, period: number): string => `${day}-${period}`

// ─── Backend publish reconciliation ─────────────────────────────────────────
// Pure diffing so it can be unit-tested without the API — the screen just
// executes the plan (create each `toCreate`, delete each `toDeleteIds`).

export interface RemoteTimetableSlot {
  id: string
  day: string
  period: number // 1-based, matches the backend's CreateTimetableSlotRequest.Period
  classId: string | null
}

export interface TimetableSyncTarget {
  day: string
  period: number // 1-based
  subject: string | null
  classId: string
  className: string
}

export interface TimetableSyncPlan {
  toCreate: TimetableSyncTarget[]
  toDeleteIds: string[]
}

/**
 * Diffs the local draft (`grids`, keyed by className, 0-based day/period cells)
 * against what the backend currently has for the classes present in `grids`.
 * Slots for classes NOT in `grids` are left alone (this reconciliation only
 * owns the classes the admin is actively publishing). `classIdFor` resolves a
 * grid's className key to its real backend class id — classes with no
 * resolvable id are skipped (nothing to publish them against).
 */
export function planTimetableSync(
  grids: Grids,
  days: string[],
  classIdFor: (className: string) => string | null,
  remote: RemoteTimetableSlot[],
): TimetableSyncPlan {
  const toCreate: TimetableSyncTarget[] = []
  const ownedClassIds = new Set<string>()

  for (const [className, grid] of Object.entries(grids)) {
    const classId = classIdFor(className)
    if (!classId) continue
    ownedClassIds.add(classId)
    for (const [key, cell] of Object.entries(grid)) {
      if (!cell) continue
      const [dStr, pStr] = key.split('-')
      const d = Number(dStr)
      const p = Number(pStr)
      if (!days[d]) continue // key from a day index this school doesn't use
      toCreate.push({
        day: days[d], period: p + 1, subject: cell.subject || null,
        classId, className,
      })
    }
  }

  // Anything already on the backend for a class we own, that isn't in the
  // fresh toCreate set, is stale (removed or changed) and must go — we always
  // delete+recreate rather than update-in-place (no update endpoint exists,
  // and the slot count/shape is small enough that this is cheap).
  const toDeleteIds = remote
    .filter((r) => r.classId && ownedClassIds.has(r.classId))
    .map((r) => r.id)

  return { toCreate, toDeleteIds }
}

/**
 * Every class OTHER than `exceptClass` in which `teacherId` already teaches at
 * this day+period. Empty array if none. An empty teacherId never clashes.
 */
export function clashingClasses(
  grids: Grids, teacherId: string, day: number, period: number, exceptClass: string,
): string[] {
  if (!teacherId) return []
  const key = cellKey(day, period)
  const out: string[] = []
  for (const [cls, grid] of Object.entries(grids)) {
    if (cls === exceptClass) continue
    const cell = grid[key]
    if (cell && cell.teacherId === teacherId) out.push(cls)
  }
  return out
}

/**
 * The first class OTHER than `exceptClass` in which `teacherId` already teaches
 * at this day+period, or null if none.
 */
export function clashingClass(
  grids: Grids, teacherId: string, day: number, period: number, exceptClass: string,
): string | null {
  return clashingClasses(grids, teacherId, day, period, exceptClass)[0] ?? null
}

/** True if the teacher is booked in another class at this slot. */
export function teacherBusyElsewhere(
  grids: Grids, teacherId: string, day: number, period: number, exceptClass: string,
): boolean {
  return clashingClass(grids, teacherId, day, period, exceptClass) !== null
}

/**
 * Pick a teacher from `roster` for a slot, preferring one free across all other
 * classes. Tries the roster in rotation order from `rotStart`. Falls back to the
 * rotated teacher (a residual clash) if everyone is busy. '' for an empty roster.
 */
export function pickTeacher(
  grids: Grids, roster: string[], day: number, period: number, exceptClass: string, rotStart: number,
): string {
  if (roster.length === 0) return ''
  const n = roster.length
  for (let i = 0; i < n; i++) {
    const cand = roster[(rotStart + i) % n]
    if (!teacherBusyElsewhere(grids, cand, day, period, exceptClass)) return cand
  }
  return roster[rotStart % n]
}

/**
 * The set of cell keys in `cls` whose assigned teacher is double-booked in
 * another class at the same slot.
 */
export function conflictsFor(grids: Grids, cls: string): Set<string> {
  const out = new Set<string>()
  const grid = grids[cls]
  if (!grid) return out
  for (const [key, cell] of Object.entries(grid)) {
    if (!cell || !cell.teacherId) continue
    const [d, p] = key.split('-').map(Number)
    if (teacherBusyElsewhere(grids, cell.teacherId, d, p, cls)) out.add(key)
  }
  return out
}

/** Total assigned periods per teacher across every class. */
export function teacherLoads(grids: Grids): Record<string, number> {
  const out: Record<string, number> = {}
  for (const grid of Object.values(grids)) {
    for (const cell of Object.values(grid)) {
      if (cell && cell.teacherId) out[cell.teacherId] = (out[cell.teacherId] ?? 0) + 1
    }
  }
  return out
}

/** Teacher ids that are double-booked in at least one slot (across all classes). */
export function clashingTeachers(grids: Grids): Set<string> {
  const out = new Set<string>()
  for (const cls of Object.keys(grids)) {
    const grid = grids[cls]
    for (const key of conflictsFor(grids, cls)) {
      const cell = grid[key]
      if (cell?.teacherId) out.add(cell.teacherId)
    }
  }
  return out
}

export interface TeacherSlotEntry { cls: string; subject: string }
export interface SubjectSlotEntry { cls: string; teacherId: string }

/** All of a teacher's placements, keyed by slot (2+ entries = clash). */
export function teacherSchedule(grids: Grids, teacherId: string): Record<string, TeacherSlotEntry[]> {
  const out: Record<string, TeacherSlotEntry[]> = {}
  if (!teacherId) return out
  for (const [cls, grid] of Object.entries(grids)) {
    for (const [key, cell] of Object.entries(grid)) {
      if (cell && cell.teacherId === teacherId) (out[key] ??= []).push({ cls, subject: cell.subject })
    }
  }
  return out
}

/** All placements of a subject, keyed by slot (2+ entries = same-slot in two classes). */
export function subjectSchedule(grids: Grids, subject: string): Record<string, SubjectSlotEntry[]> {
  const out: Record<string, SubjectSlotEntry[]> = {}
  if (!subject) return out
  for (const [cls, grid] of Object.entries(grids)) {
    for (const [key, cell] of Object.entries(grid)) {
      if (cell && cell.subject === subject) (out[key] ??= []).push({ cls, teacherId: cell.teacherId })
    }
  }
  return out
}
