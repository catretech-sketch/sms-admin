import { startOfWeek, type TrendPoint } from './attendanceTrend'
import { gradeRank } from './defaultClasses'

export const DASHBOARD_STAGES = [
  { label: 'Pre-primary', color: '#a855f7' },
  { label: 'Primary', color: '#16a34a' },
  { label: 'Middle', color: '#0ea5e9' },
  { label: 'Secondary', color: '#f59e0b' },
] as const

export type DashboardStageLabel = (typeof DASHBOARD_STAGES)[number]['label']

export type StageSlice = { label: string; value: number; color: string }

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const RESULT_BANDS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D', 'E'] as const
const RESULT_BAND_COLOR: Record<string, string> = {
  A1: '#16a34a', A2: '#16a34a',
  B1: '#0ea5e9', B2: '#0ea5e9',
  C1: '#f59e0b', C2: '#f59e0b',
  D: '#dc2626', E: '#dc2626',
}

function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function stageForGrade(grade: string): DashboardStageLabel | null {
  const rank = gradeRank(grade)
  if (rank <= -1) return 'Pre-primary'
  if (rank >= 1 && rank <= 5) return 'Primary'
  if (rank >= 6 && rank <= 8) return 'Middle'
  if (rank >= 9 && rank <= 12) return 'Secondary'
  return null
}

/** Live enrolment split from student grades — never a hardcoded share. */
export function enrollmentByStage(students: { grade?: string | null }[]): StageSlice[] {
  const counts: Record<string, number> = {
    'Pre-primary': 0, Primary: 0, Middle: 0, Secondary: 0, Other: 0,
  }
  for (const s of students) {
    const grade = String(s.grade ?? '').trim()
    if (!grade) continue
    const stage = stageForGrade(grade) ?? 'Other'
    counts[stage] += 1
  }
  const slices: StageSlice[] = DASHBOARD_STAGES.map((st) => ({ label: st.label, value: counts[st.label], color: st.color }))
  if (counts.Other) slices.push({ label: 'Other', value: counts.Other, color: '#64748b' })
  return slices
}

/** Same stage split from SQL GROUP BY grade (dashboard must not download the full roster). */
export function enrollmentByStageFromCounts(rows: { grade?: string | null; count: number }[]): StageSlice[] {
  const counts: Record<string, number> = {
    'Pre-primary': 0, Primary: 0, Middle: 0, Secondary: 0, Other: 0,
  }
  for (const r of rows) {
    const grade = String(r.grade ?? '').trim()
    if (!grade) continue
    const n = Number(r.count) || 0
    if (n <= 0) continue
    const stage = stageForGrade(grade) ?? 'Other'
    counts[stage] += n
  }
  const slices: StageSlice[] = DASHBOARD_STAGES.map((st) => ({ label: st.label, value: counts[st.label], color: st.color }))
  if (counts.Other) slices.push({ label: 'Other', value: counts.Other, color: '#64748b' })
  return slices
}

export function genderCounts(students: { gender?: string | null }[]): {
  boys: number
  girls: number
  unspecified: number
} {
  let boys = 0
  let girls = 0
  let unspecified = 0
  for (const s of students) {
    const g = String(s.gender ?? '').trim().toUpperCase()
    if (g === 'M') boys += 1
    else if (g === 'F') girls += 1
    else unspecified += 1
  }
  return { boys, girls, unspecified }
}

export function uniqueGradeCount(students: { grade?: string | null }[]): number {
  const grades = new Set<string>()
  for (const s of students) {
    const g = String(s.grade ?? '').trim()
    if (g && g !== '—' && g !== '-') grades.add(g)
  }
  return grades.size
}

export type WeekWindow = { from: string; to: string; label: string }

/** Cap parallel range-summary calls so today's KPI is not starved (browser ~6 connections/host). */
export const RANGE_TREND_CONCURRENCY = 2

export async function mapPoolResults<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  if (!items.length) return out
  const limit = Math.max(1, Math.min(concurrency, items.length))
  let next = 0
  await Promise.all(Array.from({ length: limit }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }))
  return out
}

export async function loadRangeTrend(
  windows: WeekWindow[],
  fetchRollup: (w: WeekWindow) => Promise<WeekRollup>,
  concurrency = RANGE_TREND_CONCURRENCY,
): Promise<TrendPoint[]> {
  const rollups = await mapPoolResults(windows, concurrency, fetchRollup)
  return trendFromWeekRollups(windows, rollups)
}

/** Last `days` calendar days, each window is that single day. */
export function dashboardDayWindows(days = 14, end: Date = new Date()): WeekWindow[] {
  const endNoon = new Date(end)
  endNoon.setHours(12, 0, 0, 0)
  const out: WeekWindow[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(endNoon)
    d.setDate(d.getDate() - i)
    const key = isoDate(d)
    out.push({ from: key, to: key, label: `${d.getDate()}/${d.getMonth() + 1}` })
  }
  return out
}

/** Last `weeks` weeks (Mon–Sun), last window clamped to `end`. */
export function dashboardWeekWindows(weeks = 8, end: Date = new Date()): WeekWindow[] {
  const endNoon = new Date(end)
  endNoon.setHours(12, 0, 0, 0)
  const endWeek = startOfWeek(endNoon)
  const out: WeekWindow[] = []
  for (let i = weeks - 1; i >= 0; i--) {
    const fromD = new Date(endWeek)
    fromD.setDate(fromD.getDate() - i * 7)
    const toD = new Date(fromD)
    toD.setDate(toD.getDate() + 6)
    if (toD.getTime() > endNoon.getTime()) toD.setTime(endNoon.getTime())
    out.push({
      from: isoDate(fromD),
      to: isoDate(toD),
      label: `${fromD.getDate()} ${MONTH_LABELS[fromD.getMonth()]}`,
    })
  }
  return out
}

/** Last `months` calendar months, last window clamped to `end`. */
export function dashboardMonthWindows(months = 6, end: Date = new Date()): WeekWindow[] {
  const endNoon = new Date(end)
  endNoon.setHours(12, 0, 0, 0)
  const out: WeekWindow[] = []
  for (let i = months - 1; i >= 0; i--) {
    const fromD = new Date(endNoon.getFullYear(), endNoon.getMonth() - i, 1, 12)
    const toD = new Date(fromD.getFullYear(), fromD.getMonth() + 1, 0, 12)
    if (toD.getTime() > endNoon.getTime()) toD.setTime(endNoon.getTime())
    out.push({
      from: isoDate(fromD),
      to: isoDate(toD),
      label: MONTH_LABELS[fromD.getMonth()],
    })
  }
  return out
}

/** Last `quarters` calendar quarters, last window clamped to `end`. */
export function dashboardQuarterWindows(quarters = 4, end: Date = new Date()): WeekWindow[] {
  const endNoon = new Date(end)
  endNoon.setHours(12, 0, 0, 0)
  const endQ = Math.floor(endNoon.getMonth() / 3)
  const out: WeekWindow[] = []
  for (let i = quarters - 1; i >= 0; i--) {
    const abs = endNoon.getFullYear() * 4 + endQ - i
    const y = Math.floor(abs / 4)
    const q = abs % 4
    const fromD = new Date(y, q * 3, 1, 12)
    const toD = new Date(y, q * 3 + 3, 0, 12)
    if (toD.getTime() > endNoon.getTime()) toD.setTime(endNoon.getTime())
    out.push({
      from: isoDate(fromD),
      to: isoDate(toD),
      label: `Q${q + 1} '${String(y).slice(2)}`,
    })
  }
  return out
}

export function trendWindowsForMode(
  mode: 'day' | 'week' | 'month' | 'quarter',
  end: Date = new Date(),
): WeekWindow[] {
  if (mode === 'day') return dashboardDayWindows(14, end)
  if (mode === 'week') return dashboardWeekWindows(8, end)
  if (mode === 'month') return dashboardMonthWindows(6, end)
  return dashboardQuarterWindows(4, end)
}

export type WeekRollup = {
  totalMarkedPeriods: number
  present?: number
  late?: number
  absent?: number
  leave?: number
  attendancePercentage: number | null
}

export function trendFromWeekRollups(windows: { label: string }[], rollups: WeekRollup[]): TrendPoint[] {
  return windows.map((w, i) => {
    const r = rollups[i]
    const marked = r?.totalMarkedPeriods ?? 0
    if (!marked) return { label: w.label, value: 0, empty: true }
    const pct = r.attendancePercentage != null
      ? Math.round(Number(r.attendancePercentage))
      : Math.round((((r.present ?? 0) + (r.late ?? 0)) / marked) * 100)
    return { label: w.label, value: pct }
  })
}

export function compositionFromRollups(rollups: WeekRollup[]): {
  present: number
  late: number
  absent: number
  total: number
  pct: number
} {
  let present = 0
  let late = 0
  let absent = 0
  for (const r of rollups) {
    present += r.present ?? 0
    late += r.late ?? 0
    absent += (r.absent ?? 0) + (r.leave ?? 0)
  }
  const total = present + late + absent
  return {
    present,
    late,
    absent,
    total,
    pct: total ? Math.round(((present + late) / total) * 100) : 0,
  }
}

export function resultBandCounts(rows: { grade?: string | null }[]): { label: string; value: number; color: string }[] {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const g = String(row.grade ?? '').trim().toUpperCase()
    if (!g) continue
    counts.set(g, (counts.get(g) ?? 0) + 1)
  }
  if (counts.size === 0) return []
  const ordered = [
    ...RESULT_BANDS.filter((b) => counts.has(b)),
    ...[...counts.keys()].filter((k) => !RESULT_BANDS.includes(k as typeof RESULT_BANDS[number])).sort(),
  ]
  return ordered.map((label) => ({
    label,
    value: counts.get(label) ?? 0,
    color: RESULT_BAND_COLOR[label] ?? '#64748b',
  }))
}

export function resultBandCountsFromHistogram(rows: { grade?: string | null; count: number }[]): { label: string; value: number; color: string }[] {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const g = String(row.grade ?? '').trim().toUpperCase()
    if (!g) continue
    const n = Number(row.count) || 0
    if (n <= 0) continue
    counts.set(g, (counts.get(g) ?? 0) + n)
  }
  if (counts.size === 0) return []
  const ordered = [
    ...RESULT_BANDS.filter((b) => counts.has(b)),
    ...[...counts.keys()].filter((k) => !RESULT_BANDS.includes(k as typeof RESULT_BANDS[number])).sort(),
  ]
  return ordered.map((label) => ({
    label,
    value: counts.get(label) ?? 0,
    color: RESULT_BAND_COLOR[label] ?? '#64748b',
  }))
}

/** Prefer completed exams, then marks-entry / published, then latest end date. */
export function pickLatestExam<T extends { id: string; status: string; to?: string; published?: boolean }>(
  exams: T[] | undefined,
): T | null {
  if (!exams?.length) return null
  const rank = (e: T) => (e.status === 'completed' ? 3 : e.status === 'marks_entry' ? 2 : e.published ? 1 : 0)
  return [...exams].sort((a, b) => {
    const rd = rank(b) - rank(a)
    if (rd) return rd
    return String(b.to || '').localeCompare(String(a.to || ''))
  })[0] ?? null
}
