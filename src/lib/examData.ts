/* ============================================================
   SchoolMate — Exam lifecycle pure helpers (keys + progress).
   ============================================================ */
import type { PaperSlot } from '@/types'
export const markKey = (examId: string, studentId: string, subject: string): string =>
  `${examId}|${studentId}|${subject}`

export const attKey = (examId: string, studentId: string, subject: string): string =>
  `${examId}|${studentId}|${subject}`

/** Percentage of an exam's papers that have at least one saved mark. */
export function marksProgress(
  examMarks: Record<string, number>,
  examId: string,
  paperCount: number,
): number {
  const subs = new Set<string>()
  const prefix = examId + '|'
  for (const k of Object.keys(examMarks)) {
    if (k.startsWith(prefix)) subs.add(k.split('|')[2])
  }
  return Math.min(100, Math.round((100 * subs.size) / Math.max(1, paperCount)))
}

function toMinutes(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim())
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

/** End time "HH:MM" from a start + duration, clamped within the day. */
export function endTime(start: string, duration: number): string {
  const base = toMinutes(start)
  if (base === null) return start
  const mins = Math.min(1439, Math.max(0, base + (Number(duration) || 0)))
  const hh = String(Math.floor(mins / 60)).padStart(2, '0')
  const mm = String(mins % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

/** Conflict messages for a single exam's datesheet (empty = clean). */
export function findClashes(slots: PaperSlot[]): string[] {
  const out = new Set<string>()

  // Same subject twice for the same class (any dates) — O(n)
  const seenSubject = new Map<string, PaperSlot>()
  for (const a of slots) {
    if (!a.subject) continue
    const key = `${a.classId ?? ''}|${a.subject}`
    const prev = seenSubject.get(key)
    if (prev) {
      const cls = a.className || prev.className
      out.add(`Subject ${a.subject} — allocated to two papers${cls ? ` for ${cls}` : ''}`)
    } else {
      seenSubject.set(key, a)
    }
  }

  // Overlaps only need same-date pairs — O(Σ n_day²) instead of O(n²)
  const byDate = new Map<string, PaperSlot[]>()
  for (const s of slots) {
    if (!s.date) continue
    const list = byDate.get(s.date)
    if (list) list.push(s)
    else byDate.set(s.date, [s])
  }

  const overlap = (a: PaperSlot, b: PaperSlot): boolean => {
    const as = toMinutes(a.start), bs = toMinutes(b.start)
    if (as === null || bs === null) return false
    return as < bs + (b.duration || 0) && bs < as + (a.duration || 0)
  }

  for (const daySlots of byDate.values()) {
    for (let i = 0; i < daySlots.length; i++) {
      for (let j = i + 1; j < daySlots.length; j++) {
        const a = daySlots[i], b = daySlots[j]
        if (!overlap(a, b)) continue
        const ai = [a.inv1, a.inv2].filter(Boolean)
        const bi = [b.inv1, b.inv2].filter(Boolean)
        for (const t of ai) if (bi.includes(t)) out.add(`Invigilator ${t} — overlapping slots on ${a.date}`)
        if (a.room && b.room && a.room === b.room) out.add(`Room ${a.room} — double-booked on ${a.date}`)
      }
    }
  }
  return [...out]
}
