/* School-wide attendance trend series (weekly / monthly) from real day marks.
   present + late count as attended; buckets with no marks are flagged empty. */
import { toAttendanceDate, type AttendanceRecord, type AttendanceStatus } from '@/api/attendance'

export interface TrendPoint {
  /** X-axis label, e.g. "5 Jul" (week start) or "Jul" (month). */
  label: string
  /** Attendance % for the bucket (0 when empty). */
  value: number
  /** True when no marks fell in this bucket (render as a blank bar). */
  empty?: boolean
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export type TrendMode = 'day' | 'week' | 'month' | 'quarter'

/** Calendar days of history needed for each chart mode (do not page the full archive). */
export function trendLookbackDays(mode: TrendMode): number {
  switch (mode) {
    case 'day': return 14
    case 'week': return 8 * 7
    case 'month': return 6 * 31
    case 'quarter': return 4 * 92
    default: return 56
  }
}

/** Present / late / absent split for the trend window (for the composition pie). */
export interface Composition {
  present: number
  late: number
  absent: number
  total: number
  /** Attendance % = (present + late) / total. */
  pct: number
}

function attended(status: AttendanceStatus): boolean {
  return status === 'present' || status === 'late'
}

function iso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Monday of the week containing `d` (local, noon-anchored to avoid DST edges). */
export function startOfWeek(d: Date): Date {
  const x = new Date(d)
  x.setHours(12, 0, 0, 0)
  const dow = (x.getDay() + 6) % 7 // 0 = Monday
  x.setDate(x.getDate() - dow)
  return x
}

function weekLabel(iso8601: string): string {
  const d = new Date(`${iso8601}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso8601
  return `${d.getDate()} ${MONTH_LABELS[d.getMonth()]}`
}

function dayLabel(iso8601: string): string {
  const d = new Date(`${iso8601}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso8601
  return `${d.getDate()}/${d.getMonth() + 1}`
}

/** Daily attendance % for the last `days` days ending at `end` (oldest → newest). */
export function dailyTrend(records: AttendanceRecord[], days = 14, end: Date = new Date()): TrendPoint[] {
  const base = new Date(end)
  base.setHours(12, 0, 0, 0)
  const keys: string[] = []
  const buckets = new Map<string, { att: number; tot: number }>()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(base)
    d.setDate(d.getDate() - i)
    const key = iso(d)
    keys.push(key)
    buckets.set(key, { att: 0, tot: 0 })
  }
  for (const r of records) {
    const b = buckets.get(toAttendanceDate(r.date))
    if (!b) continue
    b.tot += 1
    if (attended(r.status)) b.att += 1
  }
  return keys.map((key) => {
    const b = buckets.get(key)!
    return b.tot
      ? { label: dayLabel(key), value: Math.round((b.att / b.tot) * 100) }
      : { label: dayLabel(key), value: 0, empty: true }
  })
}

/** Weekly attendance % for the last `weeks` weeks ending at `end` (oldest → newest). */
export function weeklyTrend(records: AttendanceRecord[], weeks = 8, end: Date = new Date()): TrendPoint[] {
  const endWeek = startOfWeek(end)
  const keys: string[] = []
  const buckets = new Map<string, { att: number; tot: number }>()
  for (let i = weeks - 1; i >= 0; i--) {
    const ws = new Date(endWeek)
    ws.setDate(ws.getDate() - i * 7)
    const key = iso(ws)
    keys.push(key)
    buckets.set(key, { att: 0, tot: 0 })
  }
  for (const r of records) {
    const d = new Date(`${toAttendanceDate(r.date)}T12:00:00`)
    if (Number.isNaN(d.getTime())) continue
    const b = buckets.get(iso(startOfWeek(d)))
    if (!b) continue
    b.tot += 1
    if (attended(r.status)) b.att += 1
  }
  return keys.map((key) => {
    const b = buckets.get(key)!
    return b.tot
      ? { label: weekLabel(key), value: Math.round((b.att / b.tot) * 100) }
      : { label: weekLabel(key), value: 0, empty: true }
  })
}

/** Quarterly attendance % for the last `quarters` quarters ending at `end`. */
export function quarterlyTrend(records: AttendanceRecord[], quarters = 4, end: Date = new Date()): TrendPoint[] {
  const endQ = Math.floor(end.getMonth() / 3) // 0..3
  const keys: string[] = []
  const buckets = new Map<string, { att: number; tot: number }>()
  for (let i = quarters - 1; i >= 0; i--) {
    const abs = end.getFullYear() * 4 + endQ - i
    const y = Math.floor(abs / 4)
    const q = abs % 4
    const key = `${y}-Q${q + 1}`
    keys.push(key)
    buckets.set(key, { att: 0, tot: 0 })
  }
  for (const r of records) {
    const d = toAttendanceDate(r.date)
    const y = Number(d.slice(0, 4))
    const m = Number(d.slice(5, 7)) - 1
    if (!y || m < 0) continue
    const key = `${y}-Q${Math.floor(m / 3) + 1}`
    const b = buckets.get(key)
    if (!b) continue
    b.tot += 1
    if (attended(r.status)) b.att += 1
  }
  return keys.map((key) => {
    const b = buckets.get(key)!
    const [y, q] = key.split('-Q')
    const label = `Q${q} '${y.slice(2)}`
    return b.tot ? { label, value: Math.round((b.att / b.tot) * 100) } : { label, value: 0, empty: true }
  })
}

/** Present/late/absent composition across the same window the trend bars cover. */
export function trendComposition(
  records: AttendanceRecord[],
  mode: TrendMode,
  count: number,
  end: Date = new Date(),
): Composition {
  let start: Date
  let endBound: Date
  if (mode === 'day') {
    endBound = new Date(end)
    endBound.setHours(12, 0, 0, 0)
    start = new Date(endBound)
    start.setDate(start.getDate() - (count - 1))
  } else if (mode === 'week') {
    const endWeek = startOfWeek(end)
    start = new Date(endWeek)
    start.setDate(start.getDate() - (count - 1) * 7)
    endBound = new Date(endWeek)
    endBound.setDate(endBound.getDate() + 6)
  } else if (mode === 'quarter') {
    const endQ = Math.floor(end.getMonth() / 3)
    const startMonth = (endQ - (count - 1)) * 3
    start = new Date(end.getFullYear(), startMonth, 1, 12)
    endBound = new Date(end.getFullYear(), endQ * 3 + 3, 0, 12) // last day of end quarter
  } else {
    start = new Date(end.getFullYear(), end.getMonth() - (count - 1), 1, 12)
    endBound = new Date(end.getFullYear(), end.getMonth() + 1, 0, 12) // last day of end month
  }
  const startIso = iso(start)
  const endIso = iso(endBound)
  let present = 0
  let late = 0
  let absent = 0
  for (const r of records) {
    const d = toAttendanceDate(r.date)
    if (d < startIso || d > endIso) continue
    if (r.status === 'absent') absent += 1
    else if (r.status === 'late') late += 1
    else present += 1
  }
  const total = present + late + absent
  return { present, late, absent, total, pct: total ? Math.round(((present + late) / total) * 100) : 0 }
}

/** Monthly attendance % for the last `months` months ending at `end` (oldest → newest). */
export function monthlyTrend(records: AttendanceRecord[], months = 6, end: Date = new Date()): TrendPoint[] {
  const keys: string[] = []
  const buckets = new Map<string, { att: number; tot: number }>()
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(end.getFullYear(), end.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    keys.push(key)
    buckets.set(key, { att: 0, tot: 0 })
  }
  for (const r of records) {
    const key = toAttendanceDate(r.date).slice(0, 7)
    const b = buckets.get(key)
    if (!b) continue
    b.tot += 1
    if (attended(r.status)) b.att += 1
  }
  return keys.map((key) => {
    const b = buckets.get(key)!
    const monthIdx = Number(key.slice(5, 7)) - 1
    const label = MONTH_LABELS[monthIdx] ?? key
    return b.tot ? { label, value: Math.round((b.att / b.tot) * 100) } : { label, value: 0, empty: true }
  })
}
