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
